/**
 * MEMORY EVOLUTION SERVICE
 * Agent self-modification and memory system improvement (Agent Zero concepts)
 * 
 * Features:
 * - Dynamic memory system optimization
 * - Agent self-improvement mechanisms
 * - Memory pattern learning and adaptation
 * - Performance-based memory tuning
 * - Emergent memory behaviors
 * - Evolutionary memory algorithms
 */

const { EventEmitter } = require('events');
const { neonDB } = require('../../database/connections/neon');

class MemoryEvolution extends EventEmitter {
  constructor() {
    super();
    
    this.initialized = false;
    
    // Configuration
    this.config = {
      evolutionEnabled: true,         // Enable memory evolution
      adaptationRate: 0.1,            // How fast memory adapts
      evolutionInterval: 12 * 60 * 60 * 1000, // 12 hours
      performanceThreshold: 0.8,      // Minimum performance to keep strategies
      maxEvolutionGenerations: 100,   // Limit evolution cycles
      mutationRate: 0.05,            // Rate of random changes
      selectionPressure: 0.7,        // How aggressively to select best strategies
      fitnessWindow: 7 * 24 * 60 * 60 * 1000 // 7 days for fitness evaluation
    };
    
    // Evolution strategies
    this.strategies = new Map([
      ['memory_allocation', { 
        current: { working: 0.3, episodic: 0.3, semantic: 0.2, procedural: 0.2 },
        fitness: 0.5,
        generation: 0
      }],
      ['retrieval_weighting', { 
        current: { relevance: 0.4, recency: 0.3, frequency: 0.3 },
        fitness: 0.5,
        generation: 0
      }],
      ['pattern_recognition', { 
        current: { temporal: 0.25, contextual: 0.25, behavioral: 0.25, semantic: 0.25 },
        fitness: 0.5,
        generation: 0
      }],
      ['memory_consolidation', { 
        current: { importance_threshold: 0.7, frequency_threshold: 3, time_decay: 0.1 },
        fitness: 0.5,
        generation: 0
      }]
    ]);
    
    // Evolution history per agent-user
    this.evolutionHistory = new Map(); // Key: "agentId:userId"
    
    // Performance metrics for evolution
    this.performanceMetrics = new Map();
    
    // Evolution statistics
    this.metrics = {
      totalEvolutions: 0,
      successfulEvolutions: 0,
      currentGeneration: 1,
      averageFitness: 0.5,
      bestFitness: 0.5,
      strategiesEvaluated: 0,
      lastEvolution: null
    };
    
    console.log('🧬 [MemoryEvolution] Initializing memory evolution service...');
  }
  
  /**
   * Initialize memory evolution service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load existing evolution data
      await this.loadEvolutionHistory();
      
      // Setup evolution cycles
      this.setupEvolutionCycles();
      
      // Initialize fitness tracking
      this.setupFitnessTracking();
      
      // Load performance baselines
      await this.loadPerformanceBaselines();
      
      this.initialized = true;
      
      console.log(`[OK] [MemoryEvolution] Initialized - Generation ${this.metrics.currentGeneration}`);
      
      this.emit('initialized');
      
    } catch (error) {
      console.error('[ERROR] [MemoryEvolution] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Evaluate memory system evolution opportunity
   */
  async evaluateEvolution(memoryInstance, content, context) {
    if (!this.config.evolutionEnabled || !this.initialized) {
      return;
    }
    
    try {
      const instanceKey = `${memoryInstance.agentId}:${memoryInstance.userId}`;
      
      // Collect performance data
      const performanceData = await this.collectPerformanceData(memoryInstance);
      
      // Analyze current strategy effectiveness
      const strategyEffectiveness = await this.analyzeStrategyEffectiveness(
        instanceKey,
        performanceData
      );
      
      // Check if evolution is needed
      const evolutionNeed = this.assessEvolutionNeed(
        instanceKey,
        strategyEffectiveness,
        performanceData
      );
      
      if (evolutionNeed.shouldEvolve) {
        console.log(`🧬 [MemoryEvolution] Evolution triggered for ${instanceKey} - Reason: ${evolutionNeed.reason}`);
        
        await this.triggerEvolution(
          instanceKey,
          memoryInstance,
          evolutionNeed,
          performanceData
        );
      }
      
      // Update performance tracking
      await this.updatePerformanceTracking(instanceKey, performanceData);
      
    } catch (error) {
      console.error('[ERROR] [MemoryEvolution] Evolution evaluation failed:', error);
    }
  }
  
  /**
   * Collect performance data from memory instance
   */
  async collectPerformanceData(memoryInstance) {
    const data = {
      timestamp: new Date(),
      agentId: memoryInstance.agentId,
      userId: memoryInstance.userId,
      
      // Memory type performance
      memoryPerformance: {
        working: memoryInstance.working.getStats(),
        episodic: memoryInstance.episodic.getStats(),
        semantic: memoryInstance.semantic.getStats(),
        procedural: memoryInstance.procedural.getStats()
      },
      
      // Overall system performance
      systemPerformance: {
        totalMemories: 0,
        averageResponseTime: 0,
        hitRate: 0,
        evolutionGeneration: this.metrics.currentGeneration
      }
    };
    
    // Calculate aggregate metrics
    const memoryStats = Object.values(data.memoryPerformance);
    data.systemPerformance.totalMemories = memoryStats.reduce(
      (sum, stats) => sum + (stats.totalItems || stats.totalKnowledgeEntries || stats.totalBehaviors || 0), 0
    );
    
    data.systemPerformance.averageResponseTime = memoryStats.reduce(
      (sum, stats) => sum + (stats.averageResponseTime || stats.vectorSearchTime || 0), 0
    ) / memoryStats.length;
    
    data.systemPerformance.hitRate = memoryStats.reduce(
      (sum, stats) => sum + (stats.cacheHitRate || stats.behaviorSuccessRate || 50), 0
    ) / memoryStats.length;
    
    return data;
  }
  
  /**
   * Analyze current strategy effectiveness
   */
  async analyzeStrategyEffectiveness(instanceKey, performanceData) {
    const effectiveness = {};
    
    for (const [strategyName, strategy] of this.strategies) {
      effectiveness[strategyName] = await this.evaluateStrategyFitness(
        strategyName,
        strategy,
        performanceData
      );
    }
    
    return effectiveness;
  }
  
  /**
   * Evaluate strategy fitness
   */
  async evaluateStrategyFitness(strategyName, strategy, performanceData) {
    let fitness = 0;
    
    switch (strategyName) {
      case 'memory_allocation':
        fitness = this.evaluateMemoryAllocationFitness(strategy, performanceData);
        break;
        
      case 'retrieval_weighting':
        fitness = this.evaluateRetrievalWeightingFitness(strategy, performanceData);
        break;
        
      case 'pattern_recognition':
        fitness = this.evaluatePatternRecognitionFitness(strategy, performanceData);
        break;
        
      case 'memory_consolidation':
        fitness = this.evaluateMemoryConsolidationFitness(strategy, performanceData);
        break;
        
      default:
        fitness = 0.5; // Default neutral fitness
    }
    
    // Update strategy fitness
    strategy.fitness = (strategy.fitness * 0.8) + (fitness * 0.2); // Exponential smoothing
    
    return fitness;
  }
  
  /**
   * Fitness evaluation functions for different strategies
   */
  evaluateMemoryAllocationFitness(strategy, performanceData) {
    const memoryPerf = performanceData.memoryPerformance;
    let fitness = 0;
    
    // Evaluate balance between memory types
    const allocation = strategy.current;
    const totalUsage = 
      memoryPerf.working.totalItems +
      memoryPerf.episodic.totalEpisodes +
      memoryPerf.semantic.totalKnowledgeEntries +
      memoryPerf.procedural.totalBehaviors;
    
    if (totalUsage === 0) return 0.5; // No data
    
    // Calculate actual vs intended allocation
    const actualAllocation = {
      working: memoryPerf.working.totalItems / totalUsage,
      episodic: memoryPerf.episodic.totalEpisodes / totalUsage,
      semantic: memoryPerf.semantic.totalKnowledgeEntries / totalUsage,
      procedural: memoryPerf.procedural.totalBehaviors / totalUsage
    };
    
    // Fitness based on how well allocation serves performance
    Object.keys(allocation).forEach(memoryType => {
      const intended = allocation[memoryType];
      const actual = actualAllocation[memoryType] || 0;
      const performance = memoryPerf[memoryType]?.averageResponseTime || 1000;
      
      // Better performance with lower response times
      const performanceScore = Math.max(0, 1 - (performance / 1000));
      
      // Balance between intention and performance
      const allocationFit = 1 - Math.abs(intended - actual);
      
      fitness += (performanceScore * 0.7 + allocationFit * 0.3) * intended;
    });
    
    return Math.max(0, Math.min(1, fitness));
  }
  
  evaluateRetrievalWeightingFitness(strategy, performanceData) {
    const weights = strategy.current;
    let fitness = 0;
    
    // Evaluate based on retrieval success rates
    const memoryPerf = performanceData.memoryPerformance;
    const avgHitRate = performanceData.systemPerformance.hitRate / 100;
    const avgResponseTime = performanceData.systemPerformance.averageResponseTime;
    
    // Fitness based on retrieval performance
    const hitRateScore = avgHitRate; // Higher hit rate = better
    const responseTimeScore = Math.max(0, 1 - (avgResponseTime / 1000)); // Lower response time = better
    
    fitness = hitRateScore * 0.6 + responseTimeScore * 0.4;
    
    // Penalty for extreme weights (prefer balanced approaches)
    const weightBalance = 1 - Math.max(...Object.values(weights));
    fitness *= (0.8 + weightBalance * 0.2);
    
    return Math.max(0, Math.min(1, fitness));
  }
  
  evaluatePatternRecognitionFitness(strategy, performanceData) {
    // This would evaluate based on pattern discovery success
    // For now, return baseline fitness
    return 0.5 + (Math.random() * 0.2 - 0.1); // Slight randomness for evolution
  }
  
  evaluateMemoryConsolidationFitness(strategy, performanceData) {
    const consolidationParams = strategy.current;
    const memoryPerf = performanceData.memoryPerformance;
    
    let fitness = 0;
    
    // Evaluate semantic memory promotion rate
    const semanticMemories = memoryPerf.semantic.totalKnowledgeEntries || 0;
    const episodicMemories = memoryPerf.episodic.totalEpisodes || 1;
    const promotionRate = semanticMemories / episodicMemories;
    
    // Good consolidation should have reasonable promotion rate
    const idealPromotionRate = 0.1; // 10% of episodes become semantic
    const promotionFit = 1 - Math.abs(promotionRate - idealPromotionRate) / idealPromotionRate;
    
    fitness = Math.max(0, Math.min(1, promotionFit));
    
    return fitness;
  }
  
  /**
   * Assess if evolution is needed
   */
  assessEvolutionNeed(instanceKey, strategyEffectiveness, performanceData) {
    let shouldEvolve = false;
    let reason = '';
    let priority = 0;
    
    // Check overall performance
    const avgFitness = Object.values(strategyEffectiveness).reduce((a, b) => a + b, 0) / 
                       Object.keys(strategyEffectiveness).length;
    
    if (avgFitness < this.config.performanceThreshold) {
      shouldEvolve = true;
      reason = 'Low average fitness';
      priority += 0.5;
    }
    
    // Check for performance degradation
    const history = this.evolutionHistory.get(instanceKey) || [];
    if (history.length > 0) {
      const lastPerformance = history[history.length - 1].avgFitness;
      if (avgFitness < lastPerformance * 0.9) { // 10% degradation
        shouldEvolve = true;
        reason += (reason ? ', ' : '') + 'Performance degradation';
        priority += 0.3;
      }
    }
    
    // Check if enough time has passed since last evolution
    const lastEvolution = history.length > 0 ? history[history.length - 1].timestamp : 0;
    const timeSinceEvolution = Date.now() - new Date(lastEvolution).getTime();
    
    if (timeSinceEvolution > this.config.evolutionInterval) {
      shouldEvolve = true;
      reason += (reason ? ', ' : '') + 'Scheduled evolution';
      priority += 0.2;
    }
    
    return {
      shouldEvolve,
      reason: reason || 'No evolution needed',
      priority,
      avgFitness,
      performanceData
    };
  }
  
  /**
   * Trigger evolution process
   */
  async triggerEvolution(instanceKey, memoryInstance, evolutionNeed, performanceData) {
    try {
      console.log(`🧬 [MemoryEvolution] Starting evolution for ${instanceKey}...`);
      
      // Create new generation of strategies
      const newStrategies = await this.evolveStrategies(performanceData);
      
      // Evaluate new strategies
      const evaluationResults = await this.evaluateNewStrategies(
        newStrategies,
        memoryInstance,
        performanceData
      );
      
      // Select best strategies
      const selectedStrategies = this.selectBestStrategies(evaluationResults);
      
      // Apply selected strategies
      await this.applyEvolutionaryChanges(memoryInstance, selectedStrategies);
      
      // Record evolution
      await this.recordEvolution(
        instanceKey,
        evolutionNeed,
        selectedStrategies,
        evaluationResults
      );
      
      this.metrics.totalEvolutions++;
      this.metrics.successfulEvolutions++;
      this.metrics.currentGeneration++;
      this.metrics.lastEvolution = new Date();
      
      console.log(`[OK] [MemoryEvolution] Evolution complete - Generation ${this.metrics.currentGeneration}`);
      
      this.emit('evolutionCompleted', {
        instanceKey,
        generation: this.metrics.currentGeneration,
        strategies: selectedStrategies
      });
      
    } catch (error) {
      console.error('[ERROR] [MemoryEvolution] Evolution failed:', error);
      this.metrics.totalEvolutions++;
      // Don't increment successful evolutions
    }
  }
  
  /**
   * Evolve strategies using genetic algorithm principles
   */
  async evolveStrategies(performanceData) {
    const newStrategies = new Map();
    
    for (const [strategyName, currentStrategy] of this.strategies) {
      // Create variations of current strategy
      const variations = this.createStrategyVariations(currentStrategy);
      
      // Add some random mutations
      const mutations = this.createRandomMutations(currentStrategy);
      
      // Combine variations and mutations
      const candidates = [...variations, ...mutations];
      
      newStrategies.set(strategyName, {
        current: currentStrategy.current,
        candidates: candidates,
        generation: currentStrategy.generation + 1
      });
    }
    
    return newStrategies;
  }
  
  /**
   * Create strategy variations
   */
  createStrategyVariations(strategy) {
    const variations = [];
    const params = Object.keys(strategy.current);
    
    // Create variations by adjusting each parameter
    params.forEach(param => {
      const currentValue = strategy.current[param];
      
      // Create multiple variations
      for (let i = 0; i < 3; i++) {
        const variation = { ...strategy.current };
        
        // Adjust parameter by small amounts
        const adjustmentFactor = (Math.random() - 0.5) * 0.2; // ±10%
        
        if (typeof currentValue === 'number') {
          variation[param] = Math.max(0, Math.min(1, currentValue + adjustmentFactor));
        } else if (typeof currentValue === 'object') {
          // Handle nested objects
          const subParams = Object.keys(currentValue);
          const subParam = subParams[Math.floor(Math.random() * subParams.length)];
          variation[param] = { ...currentValue };
          variation[param][subParam] = Math.max(0, Math.min(1, 
            currentValue[subParam] + adjustmentFactor
          ));
        }
        
        variations.push(variation);
      }
    });
    
    return variations;
  }
  
  /**
   * Create random mutations
   */
  createRandomMutations(strategy) {
    const mutations = [];
    
    // Create a few random mutations
    for (let i = 0; i < 2; i++) {
      const mutation = JSON.parse(JSON.stringify(strategy.current));
      
      // Apply random changes
      const params = Object.keys(mutation);
      const paramToMutate = params[Math.floor(Math.random() * params.length)];
      
      if (typeof mutation[paramToMutate] === 'number') {
        mutation[paramToMutate] = Math.random();
      } else if (typeof mutation[paramToMutate] === 'object') {
        const subParams = Object.keys(mutation[paramToMutate]);
        const subParam = subParams[Math.floor(Math.random() * subParams.length)];
        mutation[paramToMutate][subParam] = Math.random();
      }
      
      mutations.push(mutation);
    }
    
    return mutations;
  }
  
  /**
   * Evaluate new strategies (simplified simulation)
   */
  async evaluateNewStrategies(newStrategies, memoryInstance, performanceData) {
    const evaluationResults = new Map();
    
    for (const [strategyName, strategyData] of newStrategies) {
      const candidateResults = [];
      
      for (const candidate of strategyData.candidates) {
        // Simulate strategy performance
        const simulatedFitness = await this.simulateStrategyPerformance(
          strategyName,
          candidate,
          performanceData
        );
        
        candidateResults.push({
          strategy: candidate,
          fitness: simulatedFitness,
          generation: strategyData.generation
        });
      }
      
      evaluationResults.set(strategyName, candidateResults);
    }
    
    return evaluationResults;
  }
  
  /**
   * Simulate strategy performance
   */
  async simulateStrategyPerformance(strategyName, candidateStrategy, performanceData) {
    // Simulate performance based on strategy
    let baseFitness = 0.5;
    
    switch (strategyName) {
      case 'memory_allocation':
        // Simulate based on allocation balance
        const allocation = candidateStrategy;
        const balance = 1 - Math.abs(Object.values(allocation).reduce((a, b) => a - b, 0));
        baseFitness = 0.3 + (balance * 0.4);
        break;
        
      case 'retrieval_weighting':
        // Simulate based on weight distribution
        const weights = candidateStrategy;
        const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
        const normalizedWeights = Object.values(weights).map(w => w / weightSum);
        const entropy = normalizedWeights.reduce((sum, w) => sum - (w * Math.log2(w || 0.001)), 0);
        baseFitness = 0.2 + (entropy / Math.log2(Object.keys(weights).length)) * 0.6;
        break;
        
      default:
        baseFitness = 0.4 + Math.random() * 0.2; // Random with slight bias
    }
    
    // Add some noise to simulation
    const noise = (Math.random() - 0.5) * 0.1;
    return Math.max(0, Math.min(1, baseFitness + noise));
  }
  
  /**
   * Select best strategies from evaluation results
   */
  selectBestStrategies(evaluationResults) {
    const selectedStrategies = new Map();
    
    for (const [strategyName, candidateResults] of evaluationResults) {
      // Sort candidates by fitness
      const sortedCandidates = candidateResults.sort((a, b) => b.fitness - a.fitness);
      
      // Select best candidate
      const bestCandidate = sortedCandidates[0];
      
      // Only select if it's better than current strategy
      const currentStrategy = this.strategies.get(strategyName);
      if (bestCandidate.fitness > currentStrategy.fitness) {
        selectedStrategies.set(strategyName, bestCandidate);
      }
    }
    
    return selectedStrategies;
  }
  
  /**
   * Apply evolutionary changes to memory system
   */
  async applyEvolutionaryChanges(memoryInstance, selectedStrategies) {
    for (const [strategyName, strategyData] of selectedStrategies) {
      try {
        await this.applyStrategyChange(memoryInstance, strategyName, strategyData);
        
        // Update strategy in our registry
        this.strategies.set(strategyName, {
          current: strategyData.strategy,
          fitness: strategyData.fitness,
          generation: strategyData.generation
        });
        
        console.log(`[LOADING] [MemoryEvolution] Applied ${strategyName} evolution - Fitness: ${strategyData.fitness.toFixed(3)}`);
        
      } catch (error) {
        console.error(`[ERROR] [MemoryEvolution] Failed to apply ${strategyName} evolution:`, error);
      }
    }
  }
  
  /**
   * Apply specific strategy change
   */
  async applyStrategyChange(memoryInstance, strategyName, strategyData) {
    switch (strategyName) {
      case 'memory_allocation':
        // This would adjust memory allocation ratios
        // For now, just log the change
        console.log(`[DATA] [MemoryEvolution] Memory allocation evolved:`, strategyData.strategy);
        break;
        
      case 'retrieval_weighting':
        // This would adjust retrieval weighting in memory modules
        console.log(`⚖️ [MemoryEvolution] Retrieval weighting evolved:`, strategyData.strategy);
        break;
        
      case 'pattern_recognition':
        // This would adjust pattern recognition parameters
        console.log(`[TARGET] [MemoryEvolution] Pattern recognition evolved:`, strategyData.strategy);
        break;
        
      case 'memory_consolidation':
        // This would adjust consolidation thresholds
        console.log(`[LOADING] [MemoryEvolution] Memory consolidation evolved:`, strategyData.strategy);
        break;
        
      default:
        console.log(`🧬 [MemoryEvolution] Unknown strategy evolved: ${strategyName}`);
    }
  }
  
  /**
   * Record evolution in history
   */
  async recordEvolution(instanceKey, evolutionNeed, selectedStrategies, evaluationResults) {
    try {
      const evolutionRecord = {
        timestamp: new Date(),
        generation: this.metrics.currentGeneration,
        reason: evolutionNeed.reason,
        avgFitness: evolutionNeed.avgFitness,
        strategiesChanged: selectedStrategies.size,
        strategies: Object.fromEntries(selectedStrategies),
        performanceImprovement: 0 // Would calculate based on before/after
      };
      
      // Store in memory history
      if (!this.evolutionHistory.has(instanceKey)) {
        this.evolutionHistory.set(instanceKey, []);
      }
      
      const history = this.evolutionHistory.get(instanceKey);
      history.push(evolutionRecord);
      
      // Keep history manageable
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }
      
      // Store in database
      await neonDB.query(`
        INSERT INTO memory_evolution_log (
          instance_key, generation, timestamp, reason, strategies_changed, 
          avg_fitness, evolution_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        instanceKey,
        this.metrics.currentGeneration,
        evolutionRecord.timestamp,
        evolutionRecord.reason,
        selectedStrategies.size,
        evolutionRecord.avgFitness,
        JSON.stringify(evolutionRecord)
      ]);
      
    } catch (error) {
      console.error('[ERROR] [MemoryEvolution] Evolution recording failed:', error);
    }
  }
  
  /**
   * Setup and utility methods
   */
  setupEvolutionCycles() {
    if (this.config.evolutionEnabled) {
      setInterval(async () => {
        await this.performGlobalEvolutionCycle();
      }, this.config.evolutionInterval);
      
      console.log(`[LOADING] [MemoryEvolution] Evolution cycles scheduled every ${this.config.evolutionInterval}ms`);
    }
  }
  
  setupFitnessTracking() {
    // Track fitness metrics over time
    setInterval(() => {
      this.updateGlobalFitnessMetrics();
    }, 60 * 1000); // Every minute
  }
  
  async performGlobalEvolutionCycle() {
    console.log('🌍 [MemoryEvolution] Performing global evolution cycle...');
    
    // This would trigger evolution evaluation for all active memory instances
    // For now, just update global metrics
    
    this.updateGlobalFitnessMetrics();
  }
  
  updateGlobalFitnessMetrics() {
    const fitnessValues = Array.from(this.strategies.values()).map(s => s.fitness);
    
    if (fitnessValues.length > 0) {
      this.metrics.averageFitness = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
      this.metrics.bestFitness = Math.max(...fitnessValues);
    }
    
    this.metrics.strategiesEvaluated = this.strategies.size;
  }
  
  async loadEvolutionHistory() {
    try {
      const result = await neonDB.query(`
        SELECT 
          COUNT(*) as total_evolutions,
          MAX(generation) as max_generation,
          AVG(avg_fitness) as avg_fitness
        FROM memory_evolution_log
      `);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.metrics.totalEvolutions = parseInt(row.total_evolutions) || 0;
        this.metrics.currentGeneration = parseInt(row.max_generation) || 1;
        this.metrics.averageFitness = parseFloat(row.avg_fitness) || 0.5;
      }
      
    } catch (error) {
      console.error('[ERROR] [MemoryEvolution] Failed to load evolution history:', error);
    }
  }
  
  async loadPerformanceBaselines() {
    // Load performance baselines for comparison
    console.log('[DATA] [MemoryEvolution] Performance baselines loaded');
  }
  
  async updatePerformanceTracking(instanceKey, performanceData) {
    if (!this.performanceMetrics.has(instanceKey)) {
      this.performanceMetrics.set(instanceKey, []);
    }
    
    const metrics = this.performanceMetrics.get(instanceKey);
    metrics.push(performanceData);
    
    // Keep last 100 performance measurements
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }
  
  /**
   * Get evolution statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      ...this.metrics,
      strategies: Object.fromEntries(
        Array.from(this.strategies.entries()).map(([name, strategy]) => [
          name, 
          {
            fitness: strategy.fitness,
            generation: strategy.generation,
            parameters: Object.keys(strategy.current).length
          }
        ])
      ),
      activeInstances: this.evolutionHistory.size,
      config: this.config
    };
  }
  
  /**
   * Get evolution history for instance
   */
  getEvolutionHistory(instanceKey) {
    return this.evolutionHistory.get(instanceKey) || [];
  }
  
  /**
   * Get current strategies
   */
  getCurrentStrategies() {
    return Object.fromEntries(
      Array.from(this.strategies.entries()).map(([name, strategy]) => [
        name,
        {
          current: strategy.current,
          fitness: strategy.fitness,
          generation: strategy.generation
        }
      ])
    );
  }
}

module.exports = MemoryEvolution;