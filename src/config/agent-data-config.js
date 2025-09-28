/**
 * Agent Data Management Configuration
 * Configuration for SQLite + Neon PostgreSQL integration
 */

const config = {
    // Connection management
    connections: {
        // PostgreSQL (Neon) configuration
        postgresql: {
            enabled: true,
            priority: 'write', // 'read', 'write', 'both'
            timeout: 30000, // 30 seconds
            retryAttempts: 3,
            retryDelay: 1000, // 1 second
            poolSize: 10,
            healthCheckInterval: 60000 // 1 minute
        },
        
        // SQLite configuration  
        sqlite: {
            enabled: true,
            priority: 'read', // 'read', 'write', 'both'
            timeout: 10000, // 10 seconds
            retryAttempts: 2,
            retryDelay: 500, // 0.5 seconds
            walMode: true, // Enable WAL mode for better concurrency
            foreignKeys: true,
            healthCheckInterval: 30000 // 30 seconds
        },
        
        // Fallback configuration
        fallback: {
            strategy: 'graceful', // 'graceful', 'strict', 'disabled'
            cacheEnabled: true,
            maxCacheSize: 1000, // Maximum number of cached agents
            cacheExpiry: 3600000 // 1 hour in milliseconds
        }
    },
    
    // Operation routing preferences
    routing: {
        // Default routing preferences
        defaults: {
            read: 'fastest', // 'fastest', 'reliable', 'postgresql', 'sqlite'
            write: 'reliable', // 'reliable', 'fastest', 'postgresql', 'sqlite'
            delete: 'reliable'
        },
        
        // Operation-specific overrides
        overrides: {
            'agent_create': 'postgresql',
            'agent_analytics': 'postgresql',
            'agent_search': 'sqlite',
            'agent_cache': 'sqlite'
        },
        
        // Load balancing for read operations
        loadBalancing: {
            enabled: true,
            algorithm: 'round_robin', // 'round_robin', 'least_connections', 'response_time'
            healthWeighting: true // Consider connection health in routing decisions
        }
    },
    
    // Synchronization configuration
    sync: {
        enabled: true,
        mode: 'bidirectional', // 'bidirectional', 'postgresql_to_sqlite', 'sqlite_to_postgresql'
        
        // Sync timing
        interval: 300000, // 5 minutes in milliseconds
        batchSize: 100, // Maximum items per sync batch
        maxQueueSize: 1000, // Maximum sync queue size
        
        // Conflict resolution
        conflictResolution: {
            strategy: 'last_write_wins', // 'last_write_wins', 'merge', 'manual'
            timestampField: 'updated_at',
            versionField: 'version' // Optional version field for conflict detection
        },
        
        // Retry configuration
        retry: {
            maxAttempts: 5,
            backoffMultiplier: 2,
            maxDelay: 60000 // 1 minute maximum delay
        },
        
        // Sync triggers
        triggers: {
            onWrite: true, // Trigger sync after write operations
            onSchedule: true, // Scheduled sync based on interval
            onStartup: true, // Sync on system startup
            onHealthRecover: true // Sync when connection health recovers
        }
    },
    
    // Performance optimization
    performance: {
        // Query optimization
        queries: {
            enablePreparedStatements: true,
            queryTimeout: 30000, // 30 seconds
            resultSetLimit: 1000, // Maximum results per query
            enableQueryCache: true,
            queryCacheTTL: 300000 // 5 minutes
        },
        
        // Connection pooling
        pooling: {
            postgresql: {
                min: 2,
                max: 10,
                acquireTimeoutMillis: 30000,
                idleTimeoutMillis: 600000 // 10 minutes
            },
            sqlite: {
                // SQLite doesn't use traditional connection pooling
                // but we can limit concurrent connections
                maxConcurrent: 5
            }
        },
        
        // Caching strategy
        caching: {
            layers: {
                memory: {
                    enabled: true,
                    maxSize: 500,
                    ttl: 1800000 // 30 minutes
                },
                redis: {
                    enabled: false, // Can be enabled for distributed caching
                    host: 'localhost',
                    port: 6379,
                    ttl: 3600000 // 1 hour
                }
            },
            
            // Cache invalidation
            invalidation: {
                strategy: 'write_through', // 'write_through', 'write_behind', 'write_around'
                events: ['create', 'update', 'delete'],
                cascading: true // Invalidate related cache entries
            }
        }
    },
    
    // Monitoring and logging
    monitoring: {
        // Metrics collection
        metrics: {
            enabled: true,
            interval: 60000, // 1 minute
            retention: 86400000, // 24 hours
            
            // Tracked metrics
            track: {
                connectionHealth: true,
                queryPerformance: true,
                syncOperations: true,
                cacheHitRatio: true,
                errorRates: true
            }
        },
        
        // Health checks
        healthChecks: {
            enabled: true,
            interval: 30000, // 30 seconds
            timeout: 10000, // 10 seconds
            
            // Health check endpoints
            endpoints: {
                postgresql: '/health/postgresql',
                sqlite: '/health/sqlite',
                sync: '/health/sync'
            }
        },
        
        // Alerting thresholds
        alerts: {
            errorRate: 0.05, // 5% error rate threshold
            responseTime: 5000, // 5 seconds response time threshold
            connectionFailures: 3, // Consecutive connection failures
            syncDelay: 600000 // 10 minutes sync delay threshold
        }
    },
    
    // Security configuration
    security: {
        // Data encryption
        encryption: {
            atRest: {
                enabled: false, // Enable for production
                algorithm: 'AES-256-GCM',
                keyRotation: true,
                rotationInterval: 2592000000 // 30 days
            },
            inTransit: {
                enabled: true,
                tlsVersion: '1.3',
                certificateValidation: true
            }
        },
        
        // Access control
        access: {
            authentication: {
                required: true,
                methods: ['jwt', 'apikey'] // Supported auth methods
            },
            authorization: {
                enabled: true,
                rbac: true, // Role-based access control
                permissions: {
                    'agent:read': ['user', 'admin'],
                    'agent:write': ['admin'],
                    'agent:delete': ['admin'],
                    'sync:manage': ['admin']
                }
            }
        },
        
        // Audit logging
        audit: {
            enabled: true,
            events: ['create', 'update', 'delete', 'sync'],
            retention: 2592000000, // 30 days
            format: 'json',
            sensitiveFields: ['system_prompt', 'model_preferences'] // Fields to mask in logs
        }
    },
    
    // Development and debugging
    development: {
        // Debug settings
        debug: {
            enabled: process.env.NODE_ENV === 'development',
            verboseLogging: false,
            queryLogging: true,
            syncLogging: true
        },
        
        // Testing configuration
        testing: {
            mockConnections: process.env.NODE_ENV === 'test',
            seedData: {
                enabled: false,
                file: './seeds/agent-test-data.json'
            }
        }
    },
    
    // Environment-specific overrides
    environments: {
        development: {
            connections: {
                postgresql: { enabled: true },
                sqlite: { enabled: true }
            },
            sync: { interval: 60000 }, // 1 minute for faster development
            monitoring: { metrics: { enabled: false } }
        },
        
        testing: {
            connections: {
                postgresql: { enabled: false },
                sqlite: { enabled: true }
            },
            sync: { enabled: false },
            monitoring: { enabled: false }
        },
        
        production: {
            connections: {
                postgresql: { enabled: true, priority: 'both' },
                sqlite: { enabled: true, priority: 'read' }
            },
            sync: { 
                enabled: true, 
                interval: 300000, // 5 minutes
                conflictResolution: { strategy: 'merge' }
            },
            security: {
                encryption: { atRest: { enabled: true } },
                audit: { enabled: true }
            },
            monitoring: { 
                enabled: true,
                alerts: { enabled: true }
            }
        }
    }
};

/**
 * Get environment-specific configuration
 */
function getConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...config };
    const envConfig = config.environments[environment] || {};
    
    // Deep merge environment-specific config
    return mergeDeep(baseConfig, envConfig);
}

/**
 * Deep merge utility function
 */
function mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = mergeDeep(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

/**
 * Validate configuration
 */
function validateConfig(config) {
    const errors = [];
    
    // Validate required fields
    if (!config.connections) {
        errors.push('Missing connections configuration');
    }
    
    if (!config.connections.postgresql && !config.connections.sqlite) {
        errors.push('At least one database connection must be enabled');
    }
    
    // Validate sync configuration
    if (config.sync.enabled && config.sync.interval < 30000) {
        errors.push('Sync interval must be at least 30 seconds');
    }
    
    if (config.sync.batchSize > 1000) {
        errors.push('Sync batch size should not exceed 1000 items');
    }
    
    // Validate performance settings
    if (config.performance.queries.queryTimeout < 1000) {
        errors.push('Query timeout should be at least 1 second');
    }
    
    return errors;
}

/**
 * Get configuration value by path
 */
function getConfigValue(path, defaultValue = null) {
    const config = getConfig();
    const keys = path.split('.');
    let value = config;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return defaultValue;
        }
    }
    
    return value;
}

// Export configuration and utilities
module.exports = {
    config,
    getConfig,
    validateConfig,
    getConfigValue,
    mergeDeep
};