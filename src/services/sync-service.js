/**
 * XERUS SYNC SERVICE
 * Coordinates synchronization between Electron, Web Dashboard, and Backend
 * 
 * Phase 3: 3-Component Sync Infrastructure
 * Provides unified sync orchestration for agents, knowledge, and tools
 */

const { createLogger } = require('../common/services/logger.js');
const config = require('../common/config/config.js');

const logger = createLogger('SyncService');

class SyncService {
    constructor() {
        this.isInitialized = false;
        this.syncInterval = null;
        this.lastSyncAttempt = null;
        this.syncStatus = 'idle'; // idle, syncing, error
        this.syncStats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            lastSuccessfulSync: null,
            lastError: null
        };
        
        // Domain references (initialized during initialize())
        this.agentsDomain = null;
        
        // Configuration
        this.config = {
            autoSyncEnabled: false,
            syncIntervalMs: 5 * 60 * 1000, // 5 minutes
            retryAttempts: 3,
            retryDelayMs: 2000,
            enablePartialSync: true,
            syncOnUserAction: true,
            enableConflictResolution: true
        };
        
        logger.info('[SyncService] Sync service created');
    }
    
    /**
     * Initialize sync service with domain references
     */
    async initialize() {
        if (this.isInitialized) {
            return { success: true };
        }
        
        try {
            // Import domain references
            const { agentsDomain } = require('../domains/agents');
                
            this.agentsDomain = agentsDomain;
                
            // Initialize domains if needed
            await this.agentsDomain.initialize();
            
            // Start auto-sync if enabled
            if (this.config.autoSyncEnabled) {
                this.startAutoSync();
            }
            
            this.isInitialized = true;
            logger.info('[SyncService] Sync service initialized successfully');
            
            return { success: true };
            
        } catch (error) {
            logger.error('[SyncService] Failed to initialize sync service:', { error });
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Perform full sync across all domains
     */
    async performFullSync() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (this.syncStatus === 'syncing') {
            logger.warn('[SyncService] Sync already in progress, skipping');
            return { success: false, error: 'Sync already in progress' };
        }
        
        this.syncStatus = 'syncing';
        this.lastSyncAttempt = new Date().toISOString();
        
        const syncResults = {
            agents: { success: false, error: null, syncedCount: 0 }
        };
        
        let overallSuccess = true;
        
        try {
            logger.info('[SyncService] Starting full sync operation');
            
            // Sync Agents Domain
            try {
                const agentSyncResult = await this.agentsDomain.syncAgentsFromBackend();
                syncResults.agents = {
                    success: agentSyncResult.success,
                    error: agentSyncResult.error || null,
                    syncedCount: agentSyncResult.syncedCount || 0,
                    totalAgents: agentSyncResult.totalAgents || 0
                };
                
                if (!agentSyncResult.success) {
                    overallSuccess = false;
                }
                
            } catch (error) {
                logger.error('[SyncService] Agents sync failed:', { error });
                syncResults.agents.error = error.message;
                overallSuccess = false;
            }
            
            // Update sync statistics
            this.syncStats.totalSyncs++;
            if (overallSuccess) {
                this.syncStats.successfulSyncs++;
                this.syncStats.lastSuccessfulSync = new Date().toISOString();
                this.syncStats.lastError = null;
            } else {
                this.syncStats.failedSyncs++;
                this.syncStats.lastError = 'Partial sync failure - see domain results';
            }
            
            this.syncStatus = 'idle';
            
            logger.info('[SyncService] Full sync completed', {
                success: overallSuccess,
                results: syncResults,
                stats: this.syncStats
            });
            
            return {
                success: overallSuccess,
                results: syncResults,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            this.syncStatus = 'error';
            this.syncStats.failedSyncs++;
            this.syncStats.lastError = error.message;
            
            logger.error('[SyncService] Full sync failed:', { error });
            return { success: false, error: error.message };
        }
    }
    
    
    
    /**
     * Sync specific agent to backend
     */
    async syncAgent(agentId) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        try {
            logger.info(`[SyncService] Syncing agent ${agentId}`);
            const result = await this.agentsDomain.syncAgentToBackend(agentId);
            
            if (result.success) {
                logger.info(`[SyncService] Agent ${agentId} synced successfully`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`[SyncService] Failed to sync agent ${agentId}:`, { error });
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Check backend connectivity across all domains
     */
    async checkBackendConnectivity() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        const connectivity = {
            agents: { connected: false, error: null },
            overall: false
        };
        
        try {
            // Check agents domain
            const agentsCheck = await this.agentsDomain.checkBackendSync();
            connectivity.agents = {
                connected: agentsCheck.connected,
                error: agentsCheck.error || null,
                stats: agentsCheck.apiClientStats || null
            };
            
            // Overall connectivity
            connectivity.overall = connectivity.agents.connected;
            
            logger.info('[SyncService] Backend connectivity check completed', connectivity);
            return connectivity;
            
        } catch (error) {
            logger.error('[SyncService] Backend connectivity check failed:', { error });
            return {
                ...connectivity,
                overall: false,
                error: error.message
            };
        }
    }
    
    /**
     * Start automatic synchronization
     */
    startAutoSync() {
        if (this.syncInterval) {
            this.stopAutoSync();
        }
        
        this.syncInterval = setInterval(async () => {
            try {
                logger.info('[SyncService] Performing scheduled sync');
                await this.performFullSync();
            } catch (error) {
                logger.error('[SyncService] Scheduled sync failed:', { error });
            }
        }, this.config.syncIntervalMs);
        
        logger.info('[SyncService] Auto-sync started', {
            intervalMs: this.config.syncIntervalMs
        });
    }
    
    /**
     * Stop automatic synchronization
     */
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            logger.info('[SyncService] Auto-sync stopped');
        }
    }
    
    /**
     * Update sync configuration
     */
    updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        // Restart auto-sync if interval changed
        if (oldConfig.syncIntervalMs !== this.config.syncIntervalMs && this.syncInterval) {
            this.stopAutoSync();
            if (this.config.autoSyncEnabled) {
                this.startAutoSync();
            }
        }
        
        logger.info('[SyncService] Configuration updated', {
            oldConfig,
            newConfig: this.config
        });
    }
    
    /**
     * Get sync service status and statistics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            syncStatus: this.syncStatus,
            lastSyncAttempt: this.lastSyncAttempt,
            config: this.config,
            stats: this.syncStats,
            autoSyncActive: !!this.syncInterval
        };
    }
    
    /**
     * Shutdown sync service
     */
    async shutdown() {
        this.stopAutoSync();
        this.isInitialized = false;
        this.syncStatus = 'idle';
        
        logger.info('[SyncService] Sync service shutdown complete');
    }
}

// Create singleton instance
const syncService = new SyncService();

module.exports = {
    syncService,
    SyncService
};