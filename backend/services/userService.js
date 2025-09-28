/**
 * User Service
 * Handles user roles, permissions, and profile management
 */

const { neonDB } = require('../database/connections/neon');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [UserService]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'backend.log' })
  ]
});

/**
 * Default user roles and permissions
 */
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

const PERMISSIONS = {
  // Agent permissions
  AGENTS_READ: 'agents:read',
  AGENTS_CREATE: 'agents:create',
  AGENTS_UPDATE: 'agents:update',
  AGENTS_DELETE: 'agents:delete',
  
  // Knowledge permissions
  KNOWLEDGE_READ: 'knowledge:read',
  KNOWLEDGE_CREATE: 'knowledge:create',
  KNOWLEDGE_UPDATE: 'knowledge:update',
  KNOWLEDGE_DELETE: 'knowledge:delete',
  
  // Tool permissions
  TOOLS_READ: 'tools:read',
  TOOLS_EXECUTE: 'tools:execute',
  TOOLS_MANAGE: 'tools:manage',
  
  // System permissions
  SYSTEM_ADMIN: 'system:admin',
  ANALYTICS_READ: 'analytics:read',
  USER_MANAGEMENT: 'users:manage',
  
  // Wildcard permission (admin only)
  ALL: '*'
};

const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [PERMISSIONS.ALL],
  [USER_ROLES.USER]: [
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.TOOLS_READ,
    PERMISSIONS.TOOLS_EXECUTE
  ],
  [USER_ROLES.GUEST]: [
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.TOOLS_READ
  ]
};

class UserService {
  constructor() {
    this.connection = neonDB;
  }

  /**
   * Create or update user profile
   */
  async createOrUpdateUser(userData) {
    try {
      const { id, email, displayName, role = USER_ROLES.USER } = userData;
      
      if (!id || !email) {
        throw new Error('User ID and email are required');
      }

      // Check if user exists using parameterized query
      const existingUser = await this.connection.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );

      const now = new Date().toISOString();
      
      if (existingUser.rows.length > 0) {
        // Update existing user using parameterized query
        const result = await this.connection.query(
          `UPDATE users 
           SET email = $1, display_name = $2, role = $3, updated_at = $4
           WHERE id = $5 
           RETURNING *`,
          [email, displayName || null, role, now, id]
        );
        
        logger.info('User updated with parameterized query:', { 
          userId: id,
          email: email
        });
        
        logger.info('User updated', { userId: id, email, role, resultCount: result.rows?.length });
        
        if (!result.rows || result.rows.length === 0) {
          throw new Error('Failed to update user - no rows returned');
        }
        
        return result.rows[0];
      } else {
        // Create new user using parameterized query
        const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[USER_ROLES.USER];
        
        const result = await this.connection.query(
          `INSERT INTO users (id, email, display_name, role, permissions, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [id, email, displayName || null, role, JSON.stringify(permissions), now, now]
        );
        
        logger.info('User created with parameterized query:', { 
          userId: id,
          email: email
        });
        
        logger.info('User created', { userId: id, email, role, resultCount: result.rows?.length });
        
        if (!result.rows || result.rows.length === 0) {
          throw new Error('Failed to create user - no rows returned');
        }
        
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Create or update user failed', {
        error: error.message,
        userData: { id: userData.id, email: userData.email }
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const query = `SELECT * FROM users WHERE id = '${userId.replace(/'/g, "''")}'`;
      const result = await this.connection.query(query);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const user = result.rows[0];
      // Parse permissions JSON if it's a string
      if (user.permissions && typeof user.permissions === 'string') {
        try {
          user.permissions = JSON.parse(user.permissions);
        } catch (error) {
          logger.warn('Failed to parse user permissions JSON', { 
            userId: userId,
            permissions: user.permissions 
          });
          user.permissions = [];
        }
      }
      
      return user;
    } catch (error) {
      logger.error('Get user by ID failed', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Update user role and permissions
   */
  async updateUserRole(userId, newRole) {
    try {
      if (!Object.values(USER_ROLES).includes(newRole)) {
        throw new Error(`Invalid role: ${newRole}`);
      }

      const permissions = ROLE_PERMISSIONS[newRole] || ROLE_PERMISSIONS[USER_ROLES.USER];
      const now = new Date().toISOString();
      
      const updateQuery = `
        UPDATE users 
        SET role = '${newRole.replace(/'/g, "''")}', 
            permissions = '${JSON.stringify(permissions).replace(/'/g, "''")}'::jsonb, 
            updated_at = '${now}'::timestamp with time zone
        WHERE id = '${userId.replace(/'/g, "''")}' 
        RETURNING *
      `;
      
      const result = await this.connection.query(updateQuery);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      logger.info('User role updated', { userId, newRole, permissions });
      return result.rows[0];
    } catch (error) {
      logger.error('Update user role failed', {
        error: error.message,
        userId,
        newRole
      });
      throw error;
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(userId, permission) {
    try {
      const user = await this.getUserById(userId);
      
      if (!user) {
        return false;
      }

      // Admin users have all permissions
      if (user.role === USER_ROLES.ADMIN) {
        return true;
      }

      const userPermissions = user.permissions || [];
      
      // Check for wildcard permission or specific permission
      return userPermissions.includes(PERMISSIONS.ALL) || 
             userPermissions.includes(permission);
    } catch (error) {
      logger.error('Permission check failed', {
        error: error.message,
        userId,
        permission
      });
      return false;
    }
  }

  /**
   * Get user's effective permissions
   */
  async getUserPermissions(userId) {
    try {
      const user = await this.getUserById(userId);
      
      if (!user) {
        return [];
      }

      return user.permissions || [];
    } catch (error) {
      logger.error('Get user permissions failed', {
        error: error.message,
        userId
      });
      return [];
    }
  }

  /**
   * List all users (admin only)
   */
  async listUsers(limit = 50, offset = 0) {
    try {
      const query = `
        SELECT id, email, display_name, role, created_at, updated_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;
      
      const result = await this.connection.query(query);
      return result.rows;
    } catch (error) {
      logger.error('List users failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    try {
      const query = `DELETE FROM users WHERE id = '${userId.replace(/'/g, "''")}' RETURNING *`;
      const result = await this.connection.query(query);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      logger.info('User deleted', { userId });
      return result.rows[0];
    } catch (error) {
      logger.error('Delete user failed', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = {
  UserService: new UserService(),
  USER_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS
};