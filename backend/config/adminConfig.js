/**
 * Unified Admin User Configuration
 * Centralizes admin user identification across all components
 */

const ADMIN_USER_CONFIG = {
  // Primary admin user ID (consistent across all components)
  adminUserId: 'assistant@xerus',
  adminEmail: 'assistant@xerus.com',
  
  // Alternative identifiers for backward compatibility
  alternativeIds: ['admin_user', 'assistant@xerus'],
  
  // Admin permissions
  permissions: ['*'],
  
  // Admin role
  role: 'admin'
};

/**
 * Check if a user is an admin based on various identifiers
 * @param {string} userId - User ID to check
 * @param {string} email - User email to check
 * @returns {boolean} - True if user is admin
 */
const isAdminUser = (userId, email) => {
  // Direct ID match
  if (userId === ADMIN_USER_CONFIG.adminUserId) return true;
  
  // Email match
  if (email === ADMIN_USER_CONFIG.adminEmail) return true;
  
  // Alternative ID match (for backward compatibility)
  if (ADMIN_USER_CONFIG.alternativeIds.includes(userId)) return true;
  
  // Environment variable override
  if (process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) return true;
  
  return false;
};

/**
 * Get standardized admin user object
 * @returns {object} - Standardized admin user
 */
const getStandardizedAdminUser = () => ({
  id: ADMIN_USER_CONFIG.adminUserId,
  uid: ADMIN_USER_CONFIG.adminUserId,
  email: ADMIN_USER_CONFIG.adminEmail,
  role: ADMIN_USER_CONFIG.role,
  permissions: ADMIN_USER_CONFIG.permissions,
  isAdmin: true
});

module.exports = {
  ADMIN_USER_CONFIG,
  isAdminUser,
  getStandardizedAdminUser
};