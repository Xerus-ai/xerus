// performanceMonitor.js - Real-time STT performance monitoring and optimization
const { createLogger } = require('../../../common/services/logger.js');

const logger = createLogger('STTPerformanceMonitor');

/**
 * Monitors and optimizes STT performance in real-time
 * Tracks latency, accuracy, network usage, and provides adaptive optimizations
 */
class STTPerformanceMonitor {
    constructor() {
        this.isEnabled = true;
        this.metrics = this.resetMetrics();
        this.startTime = Date.now();
        
        // Performance thresholds
        this.thresholds = {
            latency: {
                excellent: 150,    // <150ms
                good: 300,         // 150-300ms  
                acceptable: 500,   // 300-500ms
                poor: 1000        // >500ms
            },
            accuracy: {
                excellent: 0.95,   // >95%
                good: 0.90,        // 90-95%
                acceptable: 0.85,  // 85-90%
                poor: 0.80        // <85%
            },
            networkReduction: {
                target: 70,        // 70% reduction via VAD
                minimum: 50       // 50% minimum
            }
        };
        
        // Adaptive optimization settings
        this.optimizations = {
            vadEnabled: true,
            adaptiveChunkSize: true,
            providerFallback: true,
            qualityAdjustment: true
        };
        
        // Performance history for trend analysis
        this.history = {
            latency: [],
            accuracy: [],
            networkUsage: []
        };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        return {
            // Latency metrics
            totalTranscriptions: 0,
            totalLatency: 0,
            averageLatency: 0,
            minLatency: Infinity,
            maxLatency: 0,
            
            // Accuracy metrics (estimated)
            wordsProcessed: 0,
            estimatedAccuracy: 1.0,
            
            // Network efficiency
            totalAudioChunks: 0,
            vadFilteredChunks: 0,
            networkReduction: 0,
            
            // Provider performance
            deepgramRequests: 0,
            openaiRequests: 0,
            whisperRequests: 0,
            
            // Error tracking
            connectionErrors: 0,
            transcriptionErrors: 0,
            
            // Real-time status
            currentProvider: null,
            currentLatency: 0,
            isOptimal: true
        };
    }

    /**
     * Record transcription start
     * @param {string} provider - STT provider name
     * @param {string} audioType - 'mic' or 'system'
     */
    recordTranscriptionStart(provider, audioType = 'unknown') {
        const timestamp = Date.now();
        
        this.metrics.currentProvider = provider;
        this.metrics[`${provider}Requests`] = (this.metrics[`${provider}Requests`] || 0) + 1;
        
        // Store start time for latency calculation
        this.pendingTranscriptions = this.pendingTranscriptions || new Map();
        this.pendingTranscriptions.set(`${audioType}_${timestamp}`, {
            provider,
            audioType,
            startTime: timestamp
        });
        
        logger.debug('Transcription started:', { provider, audioType, timestamp });
    }

    /**
     * Record transcription completion
     * @param {string} text - Transcribed text
     * @param {string} audioType - 'mic' or 'system'
     * @param {number} confidence - Confidence score (0-1)
     */
    recordTranscriptionComplete(text, audioType = 'unknown', confidence = 1.0) {
        const endTime = Date.now();
        
        // Find matching start time
        const key = Array.from(this.pendingTranscriptions?.keys() || [])
            .find(k => k.startsWith(audioType));
            
        if (!key) {
            logger.warn('No matching transcription start found for:', audioType);
            return;
        }
        
        const startData = this.pendingTranscriptions.get(key);
        this.pendingTranscriptions.delete(key);
        
        const latency = endTime - startData.startTime;
        
        // Update metrics
        this.metrics.totalTranscriptions++;
        this.metrics.totalLatency += latency;
        this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.totalTranscriptions;
        this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
        this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
        this.metrics.currentLatency = latency;
        
        // Estimate accuracy (simple heuristic based on confidence and text quality)
        this.metrics.wordsProcessed += text.split(' ').length;
        this.updateAccuracyEstimate(text, confidence);
        
        // Add to history for trend analysis
        this.addToHistory('latency', latency);
        this.addToHistory('accuracy', confidence);
        
        // Check if performance is optimal
        this.metrics.isOptimal = this.isPerformanceOptimal();
        
        logger.debug('Transcription completed:', {
            provider: startData.provider,
            audioType,
            latency,
            confidence,
            text: text.substring(0, 50) + '...'
        });
        
        // Trigger adaptive optimizations if needed
        if (!this.metrics.isOptimal) {
            this.triggerOptimizations();
        }
    }

    /**
     * Record audio chunk processing (for VAD efficiency tracking)
     * @param {boolean} wasFiltered - Whether chunk was filtered by VAD
     */
    recordAudioChunk(wasFiltered = false) {
        this.metrics.totalAudioChunks++;
        if (wasFiltered) {
            this.metrics.vadFilteredChunks++;
        }
        
        // Update network reduction percentage
        this.metrics.networkReduction = this.metrics.totalAudioChunks > 0 ?
            (this.metrics.vadFilteredChunks / this.metrics.totalAudioChunks * 100) : 0;
            
        this.addToHistory('networkUsage', this.metrics.networkReduction);
    }

    /**
     * Record error
     * @param {string} errorType - 'connection' or 'transcription'
     * @param {Error} error - Error object
     */
    recordError(errorType, error) {
        if (errorType === 'connection') {
            this.metrics.connectionErrors++;
        } else if (errorType === 'transcription') {
            this.metrics.transcriptionErrors++;
        }
        
        logger.warn('STT error recorded:', { errorType, error: error.message });
        
        // Trigger fallback if too many errors
        const totalErrors = this.metrics.connectionErrors + this.metrics.transcriptionErrors;
        if (totalErrors > 5 && this.optimizations.providerFallback) {
            this.triggerProviderFallback();
        }
    }

    /**
     * Update accuracy estimate based on text quality and confidence
     * @param {string} text - Transcribed text
     * @param {number} confidence - Confidence score
     */
    updateAccuracyEstimate(text, confidence) {
        // Simple heuristic: consider text length, confidence, and common patterns
        let qualityScore = confidence;
        
        // Penalize very short or very long transcriptions
        const textLength = text.trim().length;
        if (textLength < 5 || textLength > 200) {
            qualityScore *= 0.9;
        }
        
        // Penalize transcriptions with unusual character patterns
        const hasRepeatingChars = /(.)\1{3,}/.test(text);
        const hasGibberish = /[^a-zA-Z0-9\s.,!?-]{3,}/.test(text);
        if (hasRepeatingChars || hasGibberish) {
            qualityScore *= 0.8;
        }
        
        // Running average of accuracy
        const weight = 0.1; // How much new samples affect the average
        this.metrics.estimatedAccuracy = 
            (1 - weight) * this.metrics.estimatedAccuracy + weight * qualityScore;
    }

    /**
     * Add value to performance history
     * @param {string} metric - Metric name
     * @param {number} value - Value to add
     */
    addToHistory(metric, value) {
        if (!this.history[metric]) this.history[metric] = [];
        
        this.history[metric].push({
            timestamp: Date.now(),
            value
        });
        
        // Keep only last 100 data points
        if (this.history[metric].length > 100) {
            this.history[metric].shift();
        }
    }

    /**
     * Check if current performance is optimal
     * @returns {boolean}
     */
    isPerformanceOptimal() {
        const avgLatency = this.metrics.averageLatency;
        const accuracy = this.metrics.estimatedAccuracy;
        const networkReduction = this.metrics.networkReduction;
        
        return avgLatency <= this.thresholds.latency.good &&
               accuracy >= this.thresholds.accuracy.good &&
               networkReduction >= this.thresholds.networkReduction.minimum;
    }

    /**
     * Get performance grade
     * @returns {string} - 'excellent', 'good', 'acceptable', or 'poor'
     */
    getPerformanceGrade() {
        const avgLatency = this.metrics.averageLatency;
        const accuracy = this.metrics.estimatedAccuracy;
        
        if (avgLatency <= this.thresholds.latency.excellent && 
            accuracy >= this.thresholds.accuracy.excellent) {
            return 'excellent';
        } else if (avgLatency <= this.thresholds.latency.good && 
                   accuracy >= this.thresholds.accuracy.good) {
            return 'good';
        } else if (avgLatency <= this.thresholds.latency.acceptable && 
                   accuracy >= this.thresholds.accuracy.acceptable) {
            return 'acceptable';
        } else {
            return 'poor';
        }
    }

    /**
     * Trigger adaptive optimizations based on performance
     */
    triggerOptimizations() {
        const avgLatency = this.metrics.averageLatency;
        const networkReduction = this.metrics.networkReduction;
        
        logger.info('Triggering performance optimizations:', {
            latency: avgLatency,
            networkReduction,
            grade: this.getPerformanceGrade()
        });
        
        // If latency is high, suggest provider change or chunk size adjustment
        if (avgLatency > this.thresholds.latency.acceptable) {
            logger.warn('High latency detected, consider switching to Deepgram or reducing chunk size');
        }
        
        // If network reduction is low, suggest VAD tuning
        if (networkReduction < this.thresholds.networkReduction.minimum) {
            logger.warn('Low network reduction, consider tuning VAD sensitivity');
        }
    }

    /**
     * Trigger provider fallback
     */
    triggerProviderFallback() {
        logger.warn('Too many errors detected, recommending provider fallback');
        // This would trigger switching from current provider to backup
    }

    /**
     * Get comprehensive performance report
     * @returns {Object}
     */
    getPerformanceReport() {
        const uptime = Date.now() - this.startTime;
        const grade = this.getPerformanceGrade();
        
        return {
            // Overall performance
            grade,
            isOptimal: this.metrics.isOptimal,
            uptime: Math.round(uptime / 1000), // seconds
            
            // Latency metrics
            latency: {
                average: Math.round(this.metrics.averageLatency),
                min: Math.round(this.metrics.minLatency),
                max: Math.round(this.metrics.maxLatency),
                current: Math.round(this.metrics.currentLatency)
            },
            
            // Accuracy metrics
            accuracy: {
                estimated: Math.round(this.metrics.estimatedAccuracy * 100), // percentage
                wordsProcessed: this.metrics.wordsProcessed
            },
            
            // Network efficiency
            network: {
                totalChunks: this.metrics.totalAudioChunks,
                filteredChunks: this.metrics.vadFilteredChunks,
                reductionPercentage: Math.round(this.metrics.networkReduction)
            },
            
            // Provider usage
            providers: {
                current: this.metrics.currentProvider,
                deepgram: this.metrics.deepgramRequests || 0,
                openai: this.metrics.openaiRequests || 0,
                whisper: this.metrics.whisperRequests || 0
            },
            
            // Error tracking
            errors: {
                connection: this.metrics.connectionErrors,
                transcription: this.metrics.transcriptionErrors
            },
            
            // Performance recommendations
            recommendations: this.generateRecommendations()
        };
    }

    /**
     * Generate performance recommendations
     * @returns {Array<string>}
     */
    generateRecommendations() {
        const recommendations = [];
        const avgLatency = this.metrics.averageLatency;
        const accuracy = this.metrics.estimatedAccuracy;
        const networkReduction = this.metrics.networkReduction;
        
        if (avgLatency > this.thresholds.latency.good) {
            recommendations.push('Consider switching to Deepgram for lower latency');
        }
        
        if (accuracy < this.thresholds.accuracy.good) {
            recommendations.push('Consider using higher quality model or checking audio input quality');
        }
        
        if (networkReduction < this.thresholds.networkReduction.minimum) {
            recommendations.push('Adjust VAD sensitivity to reduce network usage');
        }
        
        if (this.metrics.connectionErrors > 3) {
            recommendations.push('Check network connection or try different provider');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Performance is optimal!');
        }
        
        return recommendations;
    }

    /**
     * Enable/disable monitoring
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        logger.info(`STT Performance monitoring ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Reset all metrics and history
     */
    reset() {
        this.metrics = this.resetMetrics();
        this.history = { latency: [], accuracy: [], networkUsage: [] };
        this.startTime = Date.now();
        this.pendingTranscriptions = new Map();
        logger.info('Performance monitor reset');
    }
}

// Export singleton instance
const performanceMonitor = new STTPerformanceMonitor();

module.exports = {
    STTPerformanceMonitor,
    performanceMonitor
};