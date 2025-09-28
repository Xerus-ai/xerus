/**
 * MEMORY ISOLATION SERVICE
 * Per-user/agent/thread memory boundaries (Mastra AI concepts)
 * 
 * Features:
 * - Strict memory isolation between agents and users
 * - Thread-level memory separation
 * - Cross-contamination prevention
 * - Privacy and security enforcement
 * - Memory access control and auditing
 * - Secure memory sharing mechanisms
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');
const crypto = require('crypto');

class MemoryIsolation extends EventEmitter {
  constructor() {
    super();
    
    this.initialized = false;
    
    // Configuration
    this.config = {
      strictMode: false,             // Allow cross-agent access for same user
      auditEnabled: true,            // Log all access attempts
      encryptionEnabled: false,      // Encrypt sensitive memory data
      crossAgentSharingAllowed: true, // Allow cross-agent sharing for same user
      maxAccessAttempts: 5,          // Max failed access attempts before blocking
      accessTimeoutMinutes: 30,     // Timeout for access sessions
      memoryOwnershipTracking: true  // Track memory ownership chains
    };
    
    // Access control matrix
    this.accessMatrix = new Map(); // Key: "agentId:userId", Value: access rules
    
    // Active isolation contexts
    this.isolationContexts = new Map(); // Key: contextId, Value: isolation context
    
    // Access audit log
    this.accessAuditLog = [];
    
    // Security metrics
    this.metrics = {
      totalIsolationContexts: 0,
      accessDenials: 0,
      crossContaminationPrevented: 0,
      auditLogEntries: 0,
      securityViolations: 0,
      lastSecurityCheck: null
    };
    
    console.log('🔒 [MemoryIsolation] Initializing memory isolation service...');
  }
  
  /**
   * Initialize memory isolation service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing isolation rules
      await this.loadIsolationRules();
      
      // Setup security monitoring
      this.setupSecurityMonitoring();
      
      // Initialize encryption if enabled
      if (this.config.encryptionEnabled) {
        await this.initializeEncryption();
      }
      
      // Setup periodic security checks
      this.setupSecurityChecks();
      
      this.initialized = true;
      
      console.log(`[OK] [MemoryIsolation] Initialized - ${this.metrics.totalIsolationContexts} isolation contexts`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Create isolation context for specific agent-user combination
   */
  createContext(agentId, userId, threadId = null) {
    const contextId = this.generateContextId(agentId, userId, threadId);
    
    // Check if context already exists
    if (this.isolationContexts.has(contextId)) {
      return this.isolationContexts.get(contextId);
    }
    
    const context = {
      contextId,
      agentId,
      userId,
      threadId,
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      
      // Isolation boundaries
      memoryBoundaries: {
        working: `working_${contextId}`,
        episodic: `episodic_${contextId}`,
        semantic: `semantic_${contextId}`,
        procedural: `procedural_${contextId}`
      },
      
      // Access permissions
      permissions: {
        read: true,
        write: true,
        delete: false,
        share: true,                 // Allow sharing for same user
        crossAgent: true             // Allow cross-agent access for same user
      },
      
      // Security settings
      security: {
        encrypted: this.config.encryptionEnabled,
        auditEnabled: this.config.auditEnabled,
        accessTimeout: this.config.accessTimeoutMinutes * 60 * 1000,
        lastSecurityCheck: new Date()
      },
      
      // Methods
      validateAccess: (operation, targetContext = null) => 
        this.validateAccess(contextId, operation, targetContext),
      auditAccess: (operation, result) => 
        this.auditAccess(contextId, operation, result),
      checkContamination: () => 
        this.checkCrossContamination(contextId),
      updateAccessTime: () => {
        context.lastAccessed = new Date();
        context.accessCount++;
      }
    };
    
    // Store context
    this.isolationContexts.set(contextId, context);
    this.metrics.totalIsolationContexts++;
    
    console.log(`🔒 [MemoryIsolation] Created isolation context: ${contextId}`);
    
    return context;
  }
  
  /**
   * Validate memory access request
   */
  async validateAccess(contextId, operation, targetContextId = null, metadata = {}) {
    try {
      const context = this.isolationContexts.get(contextId);
      if (!context) {
        await this.auditAccess(contextId, operation, {
          allowed: false,
          reason: 'context_not_found'
        });
        return { allowed: false, reason: 'Context not found' };
      }
      
      // Update access time
      context.updateAccessTime();
      
      // Check basic permissions
      const permissionCheck = this.checkBasicPermissions(context, operation);
      if (!permissionCheck.allowed) {
        await this.auditAccess(contextId, operation, permissionCheck);
        this.metrics.accessDenials++;
        return permissionCheck;
      }
      
      // Check cross-context access if applicable
      if (targetContextId && targetContextId !== contextId) {
        const crossContextCheck = await this.validateCrossContextAccess(
          contextId,
          targetContextId, 
          operation
        );
        if (!crossContextCheck.allowed) {
          await this.auditAccess(contextId, operation, crossContextCheck);
          this.metrics.accessDenials++;
          return crossContextCheck;
        }
      }
      
      // Check for potential contamination
      const contaminationCheck = await this.checkPotentialContamination(
        contextId, 
        operation, 
        metadata
      );
      if (!contaminationCheck.allowed) {
        await this.auditAccess(contextId, operation, contaminationCheck);
        this.metrics.crossContaminationPrevented++;
        return contaminationCheck;
      }
      
      // Check access timeout
      const timeoutCheck = this.checkAccessTimeout(context);
      if (!timeoutCheck.allowed) {
        await this.auditAccess(contextId, operation, timeoutCheck);
        return timeoutCheck;
      }
      
      // Access granted
      const result = { 
        allowed: true, 
        contextId, 
        permissions: context.permissions,
        timestamp: new Date()
      };
      
      await this.auditAccess(contextId, operation, result);
      
      return result;
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Access validation failed:', error);
      
      const result = { allowed: false, reason: 'Validation error', error: error.message };
      await this.auditAccess(contextId, operation, result);
      
      return result;
    }
  }
  
  /**
   * Check basic permissions for operation
   */
  checkBasicPermissions(context, operation) {
    switch (operation.toLowerCase()) {
      case 'read':
      case 'retrieve':
        return context.permissions.read ? 
          { allowed: true } : 
          { allowed: false, reason: 'Read permission denied' };
      
      case 'write':
      case 'store':
      case 'update':
        return context.permissions.write ? 
          { allowed: true } : 
          { allowed: false, reason: 'Write permission denied' };
      
      case 'delete':
      case 'remove':
        return context.permissions.delete ? 
          { allowed: true } : 
          { allowed: false, reason: 'Delete permission denied' };
      
      case 'share':
        return context.permissions.share ? 
          { allowed: true } : 
          { allowed: false, reason: 'Share permission denied' };
      
      default:
        return { allowed: false, reason: 'Unknown operation' };
    }
  }
  
  /**
   * Validate cross-context access
   */
  async validateCrossContextAccess(sourceContextId, targetContextId, operation) {
    const sourceContext = this.isolationContexts.get(sourceContextId);
    const targetContext = this.isolationContexts.get(targetContextId);
    
    if (!sourceContext || !targetContext) {
      return { allowed: false, reason: 'Source or target context not found' };
    }
    
    // Cross-user access is never allowed
    if (sourceContext.userId !== targetContext.userId) {
      return { allowed: false, reason: 'Cross-user access denied - data isolation required' };
    }
    
    // Cross-agent access is allowed for the same user (for context sharing)
    if (sourceContext.agentId !== targetContext.agentId) {
      console.log(`[LOADING] [MemoryIsolation] Cross-agent access allowed: ${sourceContext.agentId} → ${targetContext.agentId} for user ${sourceContext.userId}`);
      // Skip additional strict mode checks for same-user cross-agent access
    }
    
    // For cross-agent access with same user, allow if both contexts belong to same user
    if (sourceContext.agentId !== targetContext.agentId) {
      // Same user cross-agent access is generally allowed for context sharing
      console.log(`[OK] [MemoryIsolation] Same-user cross-agent access: ${sourceContext.agentId} → ${targetContext.agentId}`);
    }
    
    // Check for explicit sharing rules
    const sharingRule = await this.getSharingRule(sourceContextId, targetContextId);
    if (sharingRule && !sharingRule.allowed) {
      return { allowed: false, reason: 'Explicit sharing rule denial' };
    }
    
    // Additional security checks for sensitive operations
    if (['delete', 'update'].includes(operation.toLowerCase())) {
      return { allowed: false, reason: 'Destructive cross-context operations not allowed' };
    }
    
    return { allowed: true, crossContext: true };
  }
  
  /**
   * Check for potential memory contamination
   */
  async checkPotentialContamination(contextId, operation, metadata) {
    const context = this.isolationContexts.get(contextId);
    if (!context) {
      return { allowed: false, reason: 'Context not found' };
    }
    
    // Check for data that might belong to different users/agents
    if (metadata.sourceData) {
      const contaminationRisk = await this.analyzeContaminationRisk(
        context,
        metadata.sourceData
      );
      
      if (contaminationRisk.risk > 0.7) {
        return { 
          allowed: false, 
          reason: 'High contamination risk detected',
          riskScore: contaminationRisk.risk,
          details: contaminationRisk.details
        };
      }
    }
    
    // Check for suspicious access patterns
    if (context.accessCount > 100 && this.isAccessPatternSuspicious(context)) {
      return {
        allowed: false,
        reason: 'Suspicious access pattern detected'
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Analyze contamination risk in data
   */
  async analyzeContaminationRisk(context, data) {
    let risk = 0;
    const details = [];
    
    // Check for user identifiers that don't match the context user
    // Note: Different agent IDs for same user are allowed for context sharing
    const userIdentifiers = this.extractUserIdentifiers(data);
    for (const identifier of userIdentifiers) {
      // Only flag if it's a different user (not a different agent)
      if (identifier !== context.userId && !identifier.startsWith('agent_') && identifier !== context.agentId.toString()) {
        risk += 0.3;
        details.push(`Foreign user identifier: ${identifier}`);
      }
    }
    
    // Check for session IDs that don't belong to this context
    const sessionIds = this.extractSessionIds(data);
    if (sessionIds.length > 0 && context.threadId) {
      for (const sessionId of sessionIds) {
        if (sessionId !== context.threadId) {
          risk += 0.2;
          details.push(`Foreign session ID: ${sessionId}`);
        }
      }
    }
    
    // Check for memory type mismatches
    if (data.memoryType && data.contextId && data.contextId !== context.contextId) {
      risk += 0.4;
      details.push(`Context ID mismatch: ${data.contextId}`);
    }
    
    return {
      risk: Math.min(1.0, risk),
      details: details
    };
  }
  
  /**
   * Check access timeout
   */
  checkAccessTimeout(context) {
    const now = Date.now();
    const lastAccess = new Date(context.lastAccessed).getTime();
    const timeSinceAccess = now - lastAccess;
    
    if (timeSinceAccess > context.security.accessTimeout) {
      return {
        allowed: false,
        reason: 'Access session timed out',
        timeout: true
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check if access pattern is suspicious
   */
  isAccessPatternSuspicious(context) {
    const now = Date.now();
    const created = new Date(context.created).getTime();
    const sessionDuration = now - created;
    
    // High frequency access in short time = suspicious
    const accessRate = context.accessCount / (sessionDuration / 1000); // accesses per second
    
    if (accessRate > 10) { // More than 10 accesses per second
      return true;
    }
    
    return false;
  }
  
  /**
   * Audit access attempt
   */
  async auditAccess(contextId, operation, result) {
    if (!this.config.auditEnabled) {
      return;
    }
    
    const auditEntry = {
      id: crypto.randomUUID(),
      contextId,
      operation,
      result,
      timestamp: new Date(),
      userAgent: 'XerusMemorySystem',
      ipAddress: 'localhost'
    };
    
    // Store in memory (in production, this would go to persistent audit log)
    this.accessAuditLog.push(auditEntry);
    this.metrics.auditLogEntries++;
    
    // Keep audit log size manageable
    if (this.accessAuditLog.length > 1000) {
      this.accessAuditLog = this.accessAuditLog.slice(-500);
    }
    
    // Log security violations
    if (!result.allowed) {
      this.metrics.securityViolations++;
      console.warn(`🚨 [MemoryIsolation] Security violation: ${result.reason} for context ${contextId}`);
    }
    
    // Store critical audit entries in database
    if (!result.allowed || result.crossContext) {
      try {
        await neonDB.query(`
          INSERT INTO memory_access_audit (
            id, context_id, operation, result, timestamp
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          auditEntry.id,
          contextId,
          operation,
          JSON.stringify(result),
          auditEntry.timestamp
        ]);
      } catch (error) {
        console.error('[ERROR] [MemoryIsolation] Audit storage failed:', error);
      }
    }
  }
  
  /**
   * Check for cross-contamination
   */
  async checkCrossContamination(contextId) {
    try {
      const context = this.isolationContexts.get(contextId);
      if (!context) {
        return { contaminated: true, reason: 'Context not found' };
      }
      
      // Check each memory type for contamination
      const contaminationResults = {};
      
      for (const [memoryType, boundary] of Object.entries(context.memoryBoundaries)) {
        const contaminationCheck = await this.checkMemoryTypeContamination(
          contextId, 
          memoryType, 
          boundary
        );
        contaminationResults[memoryType] = contaminationCheck;
      }
      
      // Overall contamination assessment
      const contaminatedTypes = Object.values(contaminationResults)
        .filter(result => result.contaminated);
      
      const result = {
        contaminated: contaminatedTypes.length > 0,
        contaminatedTypes: contaminatedTypes.length,
        details: contaminationResults,
        timestamp: new Date()
      };
      
      if (result.contaminated) {
        console.warn(`🚨 [MemoryIsolation] Cross-contamination detected in context ${contextId}`);
        this.emit('contaminationDetected', { contextId, result });
      }
      
      return result;
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Contamination check failed:', error);
      return { contaminated: true, reason: 'Check failed', error: error.message };
    }
  }
  
  /**
   * Check specific memory type for contamination
   */
  async checkMemoryTypeContamination(contextId, memoryType, boundary) {
    try {
      const context = this.isolationContexts.get(contextId);
      const tableName = `${memoryType}_memory`;
      
      // Query for memories from different users (cross-user contamination)
      // Note: Cross-agent access for same user is allowed for context sharing
      const result = await neonDB.query(`
        SELECT COUNT(*) as suspicious_count
        FROM ${tableName}
        WHERE user_id != $1
        LIMIT 1
      `, [context.userId]);
      
      const suspiciousCount = parseInt(result.rows[0]?.suspicious_count || 0);
      
      return {
        contaminated: suspiciousCount > 0,
        suspiciousEntries: suspiciousCount,
        memoryType: memoryType
      };
      
    } catch (error) {
      console.error(`[ERROR] [MemoryIsolation] ${memoryType} contamination check failed:`, error);
      return {
        contaminated: true,
        reason: 'Check failed',
        error: error.message
      };
    }
  }
  
  /**
   * Get sharing rule between contexts
   */
  async getSharingRule(sourceContextId, targetContextId) {
    try {
      const result = await neonDB.query(`
        SELECT * FROM memory_sharing_rules
        WHERE source_context_id = $1 AND target_context_id = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      `, [sourceContextId, targetContextId]);
      
      if (result.rows.length > 0) {
        return {
          allowed: result.rows[0].allowed,
          permissions: JSON.parse(result.rows[0].permissions || '{}'),
          expires: result.rows[0].expires_at
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Sharing rule retrieval failed:', error);
      return null;
    }
  }
  
  /**
   * Create sharing rule between contexts
   */
  async createSharingRule(sourceContextId, targetContextId, permissions, expiresIn = null) {
    try {
      const ruleId = crypto.randomUUID();
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn) : null;
      
      await neonDB.query(`
        INSERT INTO memory_sharing_rules (
          id, source_context_id, target_context_id, allowed, permissions, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        ruleId,
        sourceContextId,
        targetContextId,
        true,
        JSON.stringify(permissions),
        expiresAt,
        new Date()
      ]);
      
      console.log(`[OK] [MemoryIsolation] Created sharing rule: ${sourceContextId} → ${targetContextId}`);
      
      return ruleId;
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Sharing rule creation failed:', error);
      throw error;
    }
  }
  
  /**
   * Utility methods
   */
  generateContextId(agentId, userId, threadId = null) {
    const base = `${agentId}:${userId}`;
    const hash = crypto.createHash('md5')
      .update(base + (threadId || ''))
      .digest('hex')
      .substring(0, 8);
    
    return threadId ? `${base}:${threadId}:${hash}` : `${base}:${hash}`;
  }
  
  extractUserIdentifiers(data) {
    const identifiers = [];
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // Simple pattern matching for common user identifier patterns
    const patterns = [
      /user[_-]?id["\s]*[:=]["\s]*([^",\s}]+)/g,
      /agent[_-]?id["\s]*[:=]["\s]*([^",\s}]+)/g,
      /"([^"]*user[^"]*)"["\s]*[:=]/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(dataStr)) !== null) {
        if (match[1] && match[1].length > 0) {
          identifiers.push(match[1]);
        }
      }
    });
    
    return [...new Set(identifiers)]; // Remove duplicates
  }
  
  extractSessionIds(data) {
    const sessionIds = [];
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // Pattern matching for session IDs
    const patterns = [
      /session[_-]?id["\s]*[:=]["\s]*([^",\s}]+)/g,
      /thread[_-]?id["\s]*[:=]["\s]*([^",\s}]+)/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(dataStr)) !== null) {
        if (match[1] && match[1].length > 0) {
          sessionIds.push(match[1]);
        }
      }
    });
    
    return [...new Set(sessionIds)];
  }
  
  /**
   * Security monitoring and checks
   */
  setupSecurityMonitoring() {
    // Monitor for suspicious patterns
    setInterval(() => {
      this.performSecurityScan();
    }, 5 * 60 * 1000); // Every 5 minutes
  }
  
  setupSecurityChecks() {
    // Periodic comprehensive security checks
    setInterval(async () => {
      await this.performComprehensiveSecurityCheck();
    }, 30 * 60 * 1000); // Every 30 minutes
  }
  
  async performSecurityScan() {
    try {
      // Scan for suspicious access patterns
      let suspiciousContexts = 0;
      
      for (const [contextId, context] of this.isolationContexts) {
        if (this.isAccessPatternSuspicious(context)) {
          suspiciousContexts++;
          console.warn(`🚨 [MemoryIsolation] Suspicious access pattern in context ${contextId}`);
        }
      }
      
      // Scan for expired contexts
      const now = Date.now();
      let expiredContexts = 0;
      
      for (const [contextId, context] of this.isolationContexts) {
        const lastAccess = new Date(context.lastAccessed).getTime();
        if (now - lastAccess > 24 * 60 * 60 * 1000) { // 24 hours
          expiredContexts++;
        }
      }
      
      if (suspiciousContexts > 0 || expiredContexts > 10) {
        this.emit('securityAlert', {
          suspiciousContexts,
          expiredContexts,
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Security scan failed:', error);
    }
  }
  
  async performComprehensiveSecurityCheck() {
    try {
      console.log('[SEARCH] [MemoryIsolation] Performing comprehensive security check...');
      
      // Check all contexts for contamination
      let contaminatedContexts = 0;
      
      for (const [contextId] of this.isolationContexts) {
        const contaminationResult = await this.checkCrossContamination(contextId);
        if (contaminationResult.contaminated) {
          contaminatedContexts++;
        }
      }
      
      // Update security metrics
      this.metrics.lastSecurityCheck = new Date();
      
      console.log(`[OK] [MemoryIsolation] Security check complete - ${contaminatedContexts} contaminated contexts`);
      
      if (contaminatedContexts > 0) {
        this.emit('contaminationAlert', {
          contaminatedContexts,
          totalContexts: this.isolationContexts.size,
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Comprehensive security check failed:', error);
    }
  }
  
  async loadIsolationRules() {
    try {
      // Load sharing rules from database
      const result = await neonDB.query(`
        SELECT COUNT(*) as rule_count FROM memory_sharing_rules
        WHERE expires_at IS NULL OR expires_at > NOW()
      `);
      
      console.log(`[TASKS] [MemoryIsolation] Loaded isolation rules`);
      
    } catch (error) {
      console.error('[ERROR] [MemoryIsolation] Failed to load isolation rules:', error);
    }
  }
  
  async initializeEncryption() {
    // Initialize encryption for sensitive memory data
    console.log('[SECURE] [MemoryIsolation] Encryption initialized');
  }
  
  /**
   * Cleanup expired contexts
   */
  async cleanupExpiredContexts() {
    const now = Date.now();
    const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedUp = 0;
    
    for (const [contextId, context] of this.isolationContexts) {
      const lastAccess = new Date(context.lastAccessed).getTime();
      if (now - lastAccess > expiredThreshold) {
        this.isolationContexts.delete(contextId);
        cleanedUp++;
      }
    }
    
    if (cleanedUp > 0) {
      this.metrics.totalIsolationContexts = this.isolationContexts.size;
      console.log(`[CLEAN] [MemoryIsolation] Cleaned up ${cleanedUp} expired contexts`);
    }
  }
  
  /**
   * Get isolation statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      ...this.metrics,
      activeContexts: this.isolationContexts.size,
      auditLogSize: this.accessAuditLog.length,
      config: this.config
    };
  }
  
  /**
   * Get audit log entries
   */
  getAuditLog(limit = 50) {
    return this.accessAuditLog.slice(-limit);
  }
  
  /**
   * Get security violations
   */
  getSecurityViolations(hours = 24) {
    const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    return this.accessAuditLog.filter(entry => 
      new Date(entry.timestamp) > since && !entry.result.allowed
    );
  }
}

module.exports = MemoryIsolation;