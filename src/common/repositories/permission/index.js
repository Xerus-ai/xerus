// SQLite repository has been removed - use backend API endpoints instead
module.exports = {
  // Throw error for any method calls
  ...Object.fromEntries(['markPermissionsAsCompleted', 'checkPermissionsCompleted'].map(method => [
    method, () => { throw new Error('SQLite repository has been removed. Use backend API endpoints instead.'); }
  ]))
}; 