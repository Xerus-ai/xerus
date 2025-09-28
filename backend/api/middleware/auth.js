/**
 * Authentication Middleware
 * Backend Dev Agent 💻 - Extracted from xerus_web/backend_node/middleware/auth.js
 * Standalone Backend Service
 */

const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { createLogger, format, transports } = require('winston');
const { v4: uuidv4 } = require('uuid');
const { neonDB } = require('../../database/connections/neon');
const { isAdminUser, getStandardizedAdminUser } = require('../../config/adminConfig');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [Auth]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'backend.log' })
  ]
});

// Unified permissions - all users (guest and authenticated) have same permissions
// Credit system controls usage limits, not feature access
const DEFAULT_USER_PERMISSIONS = [
  'agents:read', 'agents:create', 'agents:update', 'agents:view', 'agents:analytics', 'agents:manage', 'agents:chat',
  'knowledge:create', 'knowledge:update', 'knowledge:view', 'knowledge:delete', 'knowledge:manage', 'knowledge:analytics',
  'tools:read', 'tools:execute', 'tools:configure', 'tools:manage', 'tools:analytics',
  'tools:perplexity', 'tools:tavily', 'tools:firecrawl', 'tools:calculator', 'tools:websearch',
  'conversations:read', 'conversations:create', 'conversations:update', 'conversations:delete',
  'apikeys:read', 'apikeys:create', 'apikeys:update', 'apikeys:delete'
];

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!serviceAccountKey || !projectId) {
      logger.warn('Firebase credentials not found, running in development mode');
      return;
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountKey);
    } catch (error) {
      logger.error('Invalid Firebase service account key format');
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: projectId
    });

    firebaseInitialized = true;
    logger.info('Firebase Admin SDK initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK', { error: error.message });
  }
};

// Initialize Firebase on module load
initializeFirebase();

/**
 * Generate guest session token
 */
const generateGuestSession = () => {
  return `guest_${uuidv4().replace(/-/g, '')}`;
};

/**
 * Create or get guest user in PostgreSQL with 10 credits
 */
const createOrGetGuestUser = async (guestSessionId, userData = {}) => {
  try {
    // First check if guest user already exists
    const existingUser = await neonDB.query(
      'SELECT * FROM users WHERE guest_session_token = $1',
      [guestSessionId]
    );

    if (existingUser.rows.length > 0) {
      // Update last activity
      await neonDB.query(
        'UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE guest_session_token = $1',
        [guestSessionId]
      );
      logger.info('Guest user activity updated', { 
        userId: existingUser.rows[0].id, 
        sessionToken: guestSessionId 
      });
      return existingUser.rows[0];
    }

    // Create new guest user with 10 credits
    const userId = uuidv4();
    const userAgent = userData.userAgent || null;
    const timezone = userData.timezone || null;
    const displayName = userData.displayName || 'Guest User';
    
    const result = await neonDB.query(`
      INSERT INTO users (
        id, display_name, email, role, user_type, guest_session_token,
        credits_available, credits_used, credits_reset_date, plan_type,
        session_expires_at, last_activity, metadata, is_active,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *
    `, [
      userId,                              // id
      displayName,                         // display_name  
      null,                               // email (null for guests)
      'user',                             // role
      'guest',                            // user_type
      guestSessionId,                     // guest_session_token
      10,                                 // credits_available (10 for guests)
      0,                                  // credits_used
      new Date(),                         // credits_reset_date
      'free',                             // plan_type
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // session_expires_at (30 days)
      new Date(),                         // last_activity
      JSON.stringify({                    // metadata
        userAgent,
        timezone,
        createdAsGuest: true
      }),
      true,                               // is_active
      new Date(),                         // created_at
      new Date()                          // updated_at
    ]);

    const newUser = result.rows[0];
    logger.info('Guest user created in PostgreSQL', { 
      userId: newUser.id, 
      sessionToken: guestSessionId,
      credits: newUser.credits_available
    });
    
    return newUser;
  } catch (error) {
    logger.error('Failed to create or get guest user from PostgreSQL', { 
      error: error.message, 
      sessionToken: guestSessionId 
    });
    throw error;
  }
};

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and extracts user information
 * Enhanced with guest user support
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const userIdHeader = req.headers['x-user-id'] || req.headers['X-User-ID'];
    const guestSessionHeader = req.headers['x-guest-session'] || req.headers['X-Guest-Session'];
    
    // Handle guest users
    if (!authHeader || authHeader === 'guest' || authHeader === 'Bearer guest') {
      const guestSessionId = guestSessionHeader || generateGuestSession();
      
      try {
        // Create or get guest user from PostgreSQL
        const guestUser = await createOrGetGuestUser(guestSessionId, {
          userAgent: req.get('User-Agent'),
          timezone: req.headers['timezone'] || req.headers['x-timezone']
        });

        req.user = {
          id: guestUser.id,
          email: guestUser.email,
          displayName: guestUser.display_name,
          role: 'guest',
          permissions: DEFAULT_USER_PERMISSIONS,
          isGuest: true,
          guestSession: guestSessionId,
          credits: {
            available: guestUser.credits_available,
            used: guestUser.credits_used,
            resetDate: guestUser.credits_reset_date
          },
          userType: guestUser.user_type,
          planType: guestUser.plan_type,
          sessionExpiresAt: guestUser.session_expires_at
        };
        
        logger.info('Guest user authenticated from PostgreSQL', {
          userId: guestUser.id,
          guestSessionId,
          credits: guestUser.credits_available,
          permissions: DEFAULT_USER_PERMISSIONS.length,
          path: req.path
        });
        
        // Add guest session header to response for client storage
        res.set('X-Guest-Session', guestSessionId);
        return next();
      } catch (error) {
        logger.error('Failed to handle guest user authentication', {
          error: error.message,
          guestSessionId,
          path: req.path
        });
        
        // Fallback to basic guest user without database persistence
        req.user = {
          id: guestSessionId,
          email: null,
          role: 'guest',
          permissions: DEFAULT_USER_PERMISSIONS,
          isGuest: true,
          guestSession: guestSessionId,
          credits: { available: 10, used: 0 }
        };
        
        res.set('X-Guest-Session', guestSessionId);
        return next();
      }
    }
    
    // Development mode - allow bypass for testing
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      // Check for development tokens
      if (authHeader === 'Bearer test_jwt_token' || 
          authHeader === 'Bearer development_token' || 
          authHeader === `Bearer ${process.env.DEVELOPMENT_TOKEN}`) {
        req.user = {
          id: userIdHeader || process.env.DEVELOPMENT_USER_ID || 'test_user',
          email: process.env.DEVELOPMENT_USER_EMAIL || 'test@example.com',
          role: 'admin',
          permissions: ['*']
        };
        logger.info('Development token auth', { 
          userId: req.user.id, 
          role: req.user.role, 
          permissions: req.user.permissions 
        });
        return next();
      }
      
      // Allow requests with valid user ID header in development
      if (userIdHeader) {
        const isUserAdmin = isAdminUser(userIdHeader);
        const userPermissions = isUserAdmin ? ['*'] : DEFAULT_USER_PERMISSIONS;
        
        req.user = {
          id: userIdHeader,
          email: isUserAdmin ? 'assistant@xerus.com' : `${userIdHeader}@development.local`,
          role: isUserAdmin ? 'admin' : 'user',
          permissions: userPermissions
        };
        logger.info('Development user ID header auth', { userId: req.user.id, role: req.user.role, permissions: req.user.permissions });
        return next();
      }
    }

    // Production JWT validation
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    // Try Firebase JWT validation first (production mode)
    if (firebaseInitialized) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Extract user information from Firebase token
        req.user = {
          id: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          role: decodedToken.role || 'user', // Custom claims
          permissions: decodedToken.permissions || [], // Custom claims
          firebaseUser: true
        };

        logger.info('User authenticated via Firebase', {
          userId: req.user.id,
          email: req.user.email,
          role: req.user.role,
          path: req.path
        });

        return next();
      } catch (firebaseError) {
        logger.warn('Firebase token validation failed', {
          error: firebaseError.message,
          ip: req.ip,
          path: req.path
        });
        // Fall through to JWT validation if Firebase fails
      }
    }

    // Fallback to JWT validation (legacy or custom tokens)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable not set');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication configuration error'
      });
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);
      
      // Extract user information from token
      req.user = {
        id: decoded.userId || decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
        firebaseUser: false
      };

      logger.debug('User authenticated via JWT', {
        userId: req.user.id,
        email: req.user.email,
        path: req.path
      });

      next();
    } catch (jwtError) {
      logger.warn('Token validation failed', {
        error: jwtError.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      } else {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token verification failed',
          code: 'TOKEN_VERIFICATION_FAILED'
        });
      }
    }
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication processing error'
    });
  }
};

/**
 * Role-based authorization middleware factory
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRole,
        path: req.path
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required role: ${requiredRole}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Permission-based authorization middleware factory
 */
const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    // Check permissions: specific permission, wildcard permission, or admin role
    const hasPermission = userPermissions.includes(requiredPermission) || 
                         userPermissions.includes('*') || 
                         req.user.role === 'admin';
    
    if (!hasPermission) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        userPermissions,
        requiredPermission,
        path: req.path
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required permission: ${requiredPermission}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    logger.debug('Permission granted', {
      userId: req.user.id,
      userRole: req.user.role,
      userPermissions,
      requiredPermission,
      path: req.path
    });

    next();
  };
};

/**
 * Generate JWT token for user
 */
const generateToken = (user, options = {}) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable not set');
  }

  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    permissions: user.permissions || []
  };

  const tokenOptions = {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRY || '24h',
    issuer: 'glass-backend-service',
    audience: 'glass-clients'
  };

  return jwt.sign(payload, jwtSecret, tokenOptions);
};

/**
 * Verify JWT token without middleware
 */
const verifyToken = (token) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable not set');
  }

  return jwt.verify(token, jwtSecret);
};

/**
 * Require authenticated user (no guests allowed)
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }
  
  if (req.user.isGuest) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please sign in to access this feature',
      guestMode: true,
      code: 'GUEST_LOGIN_REQUIRED'
    });
  }
  
  next();
};

/**
 * Guest-aware permission checking
 */
const requireGuestPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    // Check permissions: specific permission, wildcard permission, or admin role
    const hasPermission = userPermissions.includes(requiredPermission) || 
                         userPermissions.includes('*') || 
                         req.user.role === 'admin';
    
    if (!hasPermission) {
      const isGuest = req.user.isGuest;
      
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        userPermissions,
        requiredPermission,
        isGuest,
        path: req.path
      });

      return res.status(isGuest ? 401 : 403).json({
        error: isGuest ? 'Authentication required' : 'Forbidden',
        message: isGuest 
          ? 'Please sign in to access this feature'
          : `Insufficient permissions. Required permission: ${requiredPermission}`,
        code: isGuest ? 'GUEST_LOGIN_REQUIRED' : 'INSUFFICIENT_PERMISSIONS',
        guestMode: isGuest
      });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  requireRole,
  requirePermission,
  requireAuth,
  requireGuestPermission,
  generateToken,
  verifyToken,
  generateGuestSession,
  createOrGetGuestUser,
  DEFAULT_USER_PERMISSIONS
};