// SQLite repository has been removed - use backend API endpoints instead
module.exports = {
  // Throw error for any method calls
  ...Object.fromEntries(['getAllModels', 'getModel', 'upsertModel', 'updateInstallStatus', 'initializeDefaultModels', 'deleteModel', 'getInstalledModels', 'getInstallingModels'].map(method => [
    method, () => { throw new Error('SQLite repository has been removed. Use backend API endpoints instead.'); }
  ]))
}; 