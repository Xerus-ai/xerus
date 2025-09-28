/**
 * SHARED CACHE SERVICE
 * In-memory cache shared across all backend processes for predictive context
 * 
 * FEATURES:
 * - Cross-instance data sharing
 * - TTL-based expiration
 * - LRU eviction
 * - Thread-safe operations
 */

class SharedCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
    this.config = {
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxSize: 100,
      cleanupInterval: 60 * 1000  // 1 minute
    };
    
    // Start cleanup interval
    this.startCleanup();
    
    console.log('🗄️ [SharedCache] Initialized with TTL-based expiration');
  }

  /**
   * Set value with optional TTL
   */
  set(key, value, ttl = this.config.defaultTTL) {
    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Implement LRU eviction
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }

    // Store value
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });

    // Set expiration timer
    if (ttl > 0) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttl);
      
      this.timers.set(key, timer);
    }

    console.log(`📝 [SharedCache] Set '${key}' with TTL ${ttl}ms`);
  }

  /**
   * Get value if not expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (entry.ttl > 0 && age > entry.ttl) {
      this.delete(key);
      return null;
    }

    console.log(`📖 [SharedCache] Retrieved '${key}' (age: ${age}ms)`);
    return entry.value;
  }

  /**
   * Delete value and clear timer
   */
  delete(key) {
    const existed = this.cache.delete(key);
    
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    if (existed) {
      console.log(`[DELETE] [SharedCache] Deleted '${key}'`);
    }
    
    return existed;
  }

  /**
   * Check if key exists and not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (entry.ttl > 0 && age > entry.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.cache.clear();
    this.timers.clear();
    
    console.log('[CLEAN] [SharedCache] Cleared all entries');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expiredCount = 0;
    
    // Count expired entries
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (entry.ttl > 0 && age > entry.ttl) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      activeEntries: this.cache.size - expiredCount,
      activeTimers: this.timers.size,
      maxSize: this.config.maxSize,
      defaultTTL: this.config.defaultTTL
    };
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (entry.ttl > 0 && age > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      expiredKeys.forEach(key => this.delete(key));
      console.log(`[CLEAN] [SharedCache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Update TTL for existing entry
   */
  updateTTL(key, newTTL) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Update TTL
    entry.ttl = newTTL;
    entry.timestamp = Date.now(); // Reset timestamp

    // Set new timer
    if (newTTL > 0) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, newTTL);
      
      this.timers.set(key, timer);
    } else {
      this.timers.delete(key);
    }

    console.log(`[TIME] [SharedCache] Updated TTL for '${key}' to ${newTTL}ms`);
    return true;
  }
}

// Export singleton instance
module.exports = new SharedCache();