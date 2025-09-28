/**
 * Authentication API Routes - RESTful Endpoints
 * Backend Dev Agent 💻 - Simplified auth for standalone service
 * Standalone Backend Service
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { generateToken, verifyToken } = require('../middleware/auth');

// Firebase Admin for ID token verification
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Use environment variables or default to localhost Firebase emulator
    const config = process.env.FIREBASE_ADMIN_CONFIG 
      ? JSON.parse(process.env.FIREBASE_ADMIN_CONFIG)
      : {
          projectId: 'xerus-d067d',
          // For production, you'd use a service account key
          // For development, we'll rely on Firebase Auth emulator or default credentials
        };
    
    admin.initializeApp(config);
    console.log('[OK] Firebase Admin initialized for auth service');
  } catch (error) {
    console.error('[ERROR] Firebase Admin initialization failed:', error.message);
  }
}

/**
 * POST /api/v1/auth/login
 * User authentication endpoint
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, user_id } = req.body;

  // Development/testing mode - simplified auth
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    if (!email && !user_id) {
      throw new ValidationError('Email or user_id is required for development login', { 
        field: 'email or user_id' 
      });
    }

    // Create mock user for development
    const mockUser = {
      id: user_id || email.split('@')[0],
      email: email || `${user_id}@development.local`,
      role: 'user',
      permissions: [
        'agents:create', 'agents:update', 'agents:view', 'agents:analytics', 'agents:manage',
        'knowledge:create', 'knowledge:update', 'knowledge:view', 'knowledge:delete', 'knowledge:manage', 'knowledge:analytics',
        'tools:execute', 'tools:configure', 'tools:manage', 'tools:analytics'
      ]
    };

    const token = generateToken(mockUser);

    res.json({
      message: 'Development login successful',
      user: mockUser,
      token,
      expires_in: '24h'
    });
    return;
  }

  // Production auth would integrate with actual user database
  if (!email || !password) {
    throw new ValidationError('Email and password are required', { 
      fields: ['email', 'password'] 
    });
  }

  // TODO: Implement production authentication
  // For now, return error for production
  throw new ValidationError('Production authentication not implemented yet');
}));

/**
 * POST /api/v1/auth/token/verify
 * Token verification endpoint
 */
router.post('/token/verify', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Token is required', { field: 'token' });
  }

  try {
    const decoded = verifyToken(token);
    
    res.json({
      valid: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions
      },
      expires_at: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.json({
      valid: false,
      error: error.message
    });
  }
}));

/**
 * POST /api/v1/auth/token/refresh
 * Token refresh endpoint
 */
router.post('/token/refresh', asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    throw new ValidationError('Refresh token is required', { field: 'refresh_token' });
  }

  try {
    // For development, just issue a new token with same claims
    const decoded = verifyToken(refresh_token);
    
    const newToken = generateToken({
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions
    });

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      expires_in: '24h'
    });
  } catch (error) {
    throw new ValidationError('Invalid refresh token');
  }
}));

/**
 * GET /api/v1/auth/me
 * Get current user information
 */
router.get('/me', asyncHandler(async (req, res) => {
  // This route uses the auth middleware, so req.user is available
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  res.json({
    user: req.user,
    authenticated: true,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/auth/verify-id-token
 * Convert Firebase ID token to custom token
 */
router.post('/verify-id-token', asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ValidationError('ID token is required', { field: 'idToken' });
  }

  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Create a custom token for this user
    const customToken = await admin.auth().createCustomToken(decodedToken.uid, {
      email: decodedToken.email,
      name: decodedToken.name,
      // Add any additional claims you need
    });

    console.log(`[OK] [Auth] Created custom token for user: ${decodedToken.uid} (${decodedToken.email})`);

    res.json({
      customToken,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name || decodedToken.email,
      }
    });
  } catch (error) {
    console.error('[ERROR] [Auth] ID token verification failed:', error.message);
    
    if (error.code === 'auth/id-token-expired') {
      throw new ValidationError('ID token has expired', { code: 'TOKEN_EXPIRED' });
    } else if (error.code === 'auth/id-token-revoked') {
      throw new ValidationError('ID token has been revoked', { code: 'TOKEN_REVOKED' });
    } else if (error.code === 'auth/invalid-id-token') {
      throw new ValidationError('Invalid ID token format', { code: 'INVALID_TOKEN' });
    }
    
    throw new ValidationError('Failed to verify ID token', { 
      code: 'VERIFICATION_FAILED',
      originalError: error.message 
    });
  }
}));


/**
 * POST /api/v1/auth/logout
 * User logout endpoint
 */
router.post('/logout', asyncHandler(async (req, res) => {
  // In a full implementation, we'd invalidate the token
  // For now, just return success
  res.json({
    message: 'Logout successful',
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/auth/health
 * Authentication health check - get current authentication state
 * This endpoint helps debug intermittent authentication issues
 */
router.get('/health', (req, res) => {
  const authHeader = req.headers.authorization;
  const userIdHeader = req.headers['x-user-id'];
  const sessionTokenHeader = req.headers['x-session-token'];
  
  // Import admin config for consistency check
  const { isAdminUser } = require('../../config/adminConfig');
  
  const healthInfo = {
    timestamp: new Date().toISOString(),
    authenticated: !!req.user,
    authMethod: 'none',
    user: null,
    headers: {
      hasAuthHeader: !!authHeader,
      hasUserIdHeader: !!userIdHeader,
      hasSessionTokenHeader: !!sessionTokenHeader,
      authHeaderPrefix: authHeader ? authHeader.split(' ')[0] : null
    },
    environment: process.env.NODE_ENV || 'development',
    firebaseStatus: admin.apps.length > 0 ? 'initialized' : 'not_initialized'
  };
  
  if (req.user) {
    const userIsAdmin = isAdminUser(req.user.id, req.user.email);
    healthInfo.user = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      permissions: req.user.permissions?.length || 0,
      isAdmin: userIsAdmin,
      roleConsistency: req.user.role === 'admin' ? userIsAdmin : true
    };
    
    // Determine auth method
    if (authHeader?.startsWith('Bearer')) {
      healthInfo.authMethod = 'jwt_token';
    } else if (userIdHeader) {
      healthInfo.authMethod = 'development_header';
    } else if (sessionTokenHeader) {
      healthInfo.authMethod = 'session_token';
    }
  }
  
  res.json(healthInfo);
});

module.exports = router;