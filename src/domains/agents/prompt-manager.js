/**
 * XERUS PROMPT MANAGEMENT SERVICE
 * Enhanced prompt building and template management for AI agents
 * 
 * Features:
 * - Dynamic prompt template management
 * - Agent-specific prompt customization
 * - Context-aware prompt building
 * - Personality-based prompt adaptation
 * - Multi-language prompt support
 * - Template validation and optimization
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../../common/services/logger.js');

// Import existing prompt templates
const { profilePrompts } = require('../../common/prompts/promptTemplates.js');

const logger = createLogger('Prompt-manager');

class PromptManager extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            enablePersonalityAdaptation: true,
            enableContextualPrompts: true,
            enableMultiLanguage: false,
            enablePromptOptimization: true,
            defaultProfile: 'xerus',
            maxPromptLength: 12000, // Increased to accommodate xerus_analysis template
            templateCacheSize: 100,
            validationLevel: 'lenient' // Changed to allow placeholders during initialization
        };
        
        // Template storage
        this.templates = new Map();
        this.agentTemplates = new Map(); // agentId -> customized templates
        this.templateCache = new Map();
        this.personalityPrompts = new Map();
        
        // Prompt building state
        this.state = {
            initialized: false,
            lastTemplateUpdate: null,
            templateCount: 0,
            cacheHitRate: 0,
            averageBuildTime: 0
        };
        
        // Performance metrics
        this.metrics = {
            totalBuilds: 0,
            successfulBuilds: 0,
            cacheHits: 0,
            averageBuildTime: 0,
            templateValidations: 0,
            validationFailures: 0
        };
        
        logger.info('[PromptManager] Prompt manager created');
    }
    
    /**
     * Initialize the prompt manager
     */
    async initialize() {
        if (this.state.initialized) {
            return;
        }
        
        try {
            logger.info('[PromptManager] Initializing prompt manager...');
            
            // Load default prompt templates
            await this.loadDefaultTemplates();
            
            // Initialize personality-specific prompts
            this.initializePersonalityPrompts();
            
            // Validate all templates
            if (this.config.validationLevel !== 'none') {
                await this.validateAllTemplates();
            }
            
            this.state.initialized = true;
            this.state.lastTemplateUpdate = Date.now();
            
            logger.info('[PromptManager] Prompt manager initialized successfully');
            this.emit('initialized');
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize prompt manager:', { error });
            throw error;
        }
    }
    
    /**
     * Load default prompt templates from existing files
     */
    async loadDefaultTemplates() {
        try {
            // Load templates from profilePrompts
            for (const [profileId, template] of Object.entries(profilePrompts)) {
                this.templates.set(profileId, {
                    id: profileId,
                    name: this.getProfileDisplayName(profileId),
                    template: template,
                    category: this.getProfileCategory(profileId),
                    language: 'en',
                    version: '1.0.0',
                    lastModified: Date.now(),
                    metadata: {
                        author: 'Xerus',
                        description: this.getProfileDescription(profileId),
                        tags: this.getProfileTags(profileId),
                        usage: {
                            totalBuilds: 0,
                            successRate: 1.0,
                            averageLength: 0
                        }
                    }
                });
            }
            
            this.state.templateCount = this.templates.size;
            logger.info(`[PromptManager] Loaded ${this.state.templateCount} default templates`);
            
        } catch (error) {
            logger.error('Failed to load default templates:', { error });
            throw error;
        }
    }
    
    /**
     * Initialize personality-specific prompt configurations
     */
    initializePersonalityPrompts() {
        const personalityConfigs = [
            {
                id: 'assistant',
                prompts: ['xerus', 'meeting', 'interview'],
                adaptations: {
                    tone: 'helpful',
                    verbosity: 'moderate',
                    formality: 'professional'
                }
            },
            {
                id: 'technical_expert',
                prompts: ['xerus'],
                adaptations: {
                    tone: 'technical',
                    verbosity: 'detailed',
                    formality: 'technical'
                }
            },
            {
                id: 'professional',
                prompts: ['meeting', 'presentation', 'negotiation'],
                adaptations: {
                    tone: 'professional',
                    verbosity: 'concise',
                    formality: 'formal'
                }
            },
            {
                id: 'analytical',
                prompts: ['xerus_analysis'],
                adaptations: {
                    tone: 'analytical',
                    verbosity: 'detailed',
                    formality: 'academic'
                }
            },
            {
                id: 'sales_focused',
                prompts: ['sales', 'negotiation'],
                adaptations: {
                    tone: 'persuasive',
                    verbosity: 'concise',
                    formality: 'professional'
                }
            }
        ];
        
        for (const config of personalityConfigs) {
            this.personalityPrompts.set(config.id, config);
        }
        
        logger.info('[PromptManager] Initialized personality-specific prompt configurations');
    }
    
    /**
     * Build system prompt with enhanced features
     */
    buildSystemPrompt(options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                profile = this.config.defaultProfile,
                customPrompt = '',
                googleSearchEnabled = true,
                agentId = null,
                personalityId = null,
                context = {},
                language = 'en'
            } = options;
            
            // Check cache first
            const cacheKey = this.generateCacheKey(options);
            const cached = this.templateCache.get(cacheKey);
            if (cached && this.config.enablePromptOptimization) {
                this.metrics.cacheHits++;
                this.updateCacheHitRate();
                return cached;
            }
            
            // Get base template
            let template = this.getTemplate(profile);
            if (!template) {
                template = this.getTemplate(this.config.defaultProfile);
            }
            
            if (!template) {
                throw new Error(`No template found for profile: ${profile}`);
            }
            
            // Apply agent-specific customizations
            if (agentId && this.agentTemplates.has(agentId)) {
                template = this.applyAgentCustomizations(template, agentId);
            }
            
            // Apply personality adaptations
            if (personalityId && this.config.enablePersonalityAdaptation) {
                template = this.applyPersonalityAdaptations(template, personalityId, context);
            }
            
            // Build the prompt
            const prompt = this.buildPromptFromTemplate(template, {
                customPrompt,
                googleSearchEnabled,
                context,
                language
            });
            
            // Validate prompt
            if (this.config.validationLevel !== 'none') {
                this.validatePrompt(prompt, template);
            }
            
            // Cache the result
            if (this.config.enablePromptOptimization) {
                this.cachePrompt(cacheKey, prompt);
            }
            
            // Update metrics
            this.updateMetrics(startTime, true, prompt.length);
            
            // Update template usage
            this.updateTemplateUsage(profile, true, prompt.length);
            
            this.emit('promptBuilt', {
                profile,
                agentId,
                personalityId,
                length: prompt.length,
                buildTime: Date.now() - startTime,
                cached: false
            });
            
            return prompt;
            
        } catch (error) {
            this.updateMetrics(startTime, false);
            logger.error('Failed to build system prompt:', { error, options });
            throw error;
        }
    }
    
    /**
     * Build prompt from template with enhanced context
     */
    buildPromptFromTemplate(template, options = {}) {
        const {
            customPrompt = '',
            googleSearchEnabled = true,
            context = {},
            language = 'en'
        } = options;
        
        const promptParts = template.template;
        const sections = [];
        
        // Intro section
        if (promptParts.intro) {
            sections.push(promptParts.intro);
        }
        
        // Format requirements
        if (promptParts.formatRequirements) {
            sections.push('\n\n', promptParts.formatRequirements);
        }
        
        // Search usage (if enabled)
        if (googleSearchEnabled && promptParts.searchUsage) {
            sections.push('\n\n', promptParts.searchUsage);
        }
        
        // Main content
        if (promptParts.content) {
            sections.push('\n\n', promptParts.content);
        }
        
        // Custom prompt section
        if (customPrompt && customPrompt.trim().length > 0) {
            sections.push('\n\nUser-provided context\n-----\n', customPrompt, '\n-----\n');
        }
        
        // Context-specific additions
        if (context.conversationHistory && context.conversationHistory.length > 0) {
            sections.push('\n\nConversation History:\n');
            sections.push(this.formatConversationHistory(context.conversationHistory));
        }
        
        if (context.screenData) {
            sections.push('\n\nScreen Context:\n');
            sections.push(this.formatScreenContext(context.screenData));
        }
        
        // Output instructions
        if (promptParts.outputInstructions) {
            sections.push('\n\n', promptParts.outputInstructions);
        }
        
        const prompt = sections.join('');
        
        // Apply language-specific formatting if needed
        if (language !== 'en' && this.config.enableMultiLanguage) {
            return this.applyLanguageFormatting(prompt, language);
        }
        
        return prompt;
    }
    
    /**
     * Apply agent-specific customizations to template
     */
    applyAgentCustomizations(template, agentId) {
        const customizations = this.agentTemplates.get(agentId);
        if (!customizations) {
            return template;
        }
        
        const customizedTemplate = JSON.parse(JSON.stringify(template));
        
        // Apply custom intro
        if (customizations.intro) {
            customizedTemplate.template.intro = customizations.intro;
        }
        
        // Apply custom instructions
        if (customizations.outputInstructions) {
            customizedTemplate.template.outputInstructions = customizations.outputInstructions;
        }
        
        // Apply custom content sections
        if (customizations.contentAdditions) {
            for (const addition of customizations.contentAdditions) {
                customizedTemplate.template.content += `\n\n${addition}`;
            }
        }
        
        return customizedTemplate;
    }
    
    /**
     * Apply personality adaptations to template
     */
    applyPersonalityAdaptations(template, personalityId, context = {}) {
        const personalityConfig = this.personalityPrompts.get(personalityId);
        if (!personalityConfig) {
            return template;
        }
        
        const adaptedTemplate = JSON.parse(JSON.stringify(template));
        const { adaptations } = personalityConfig;
        
        // Apply tone adaptations
        if (adaptations.tone) {
            adaptedTemplate.template.intro = this.adaptTone(
                adaptedTemplate.template.intro,
                adaptations.tone
            );
        }
        
        // Apply verbosity adaptations
        if (adaptations.verbosity) {
            adaptedTemplate.template = this.adaptVerbosity(
                adaptedTemplate.template,
                adaptations.verbosity
            );
        }
        
        // Apply formality adaptations
        if (adaptations.formality) {
            adaptedTemplate.template = this.adaptFormality(
                adaptedTemplate.template,
                adaptations.formality
            );
        }
        
        return adaptedTemplate;
    }
    
    /**
     * Adapt tone of prompt sections
     */
    adaptTone(text, tone) {
        if (!text) return text;
        
        switch (tone) {
            case 'technical':
                return text.replace(/you are/gi, 'you are a technical expert and');
            case 'professional':
                return text.replace(/you are/gi, 'you are a professional and');
            case 'analytical':
                return text.replace(/you are/gi, 'you are an analytical expert and');
            case 'persuasive':
                return text.replace(/you are/gi, 'you are a persuasive and');
            default:
                return text;
        }
    }
    
    /**
     * Adapt verbosity of prompt sections
     */
    adaptVerbosity(template, verbosity) {
        switch (verbosity) {
            case 'concise':
                if (template.formatRequirements) {
                    template.formatRequirements += '\n- Keep responses SHORT and CONCISE (1-2 sentences max)';
                }
                break;
            case 'detailed':
                if (template.formatRequirements) {
                    template.formatRequirements += '\n- Provide DETAILED explanations with examples and context';
                }
                break;
            default:
                break;
        }
        
        return template;
    }
    
    /**
     * Adapt formality of prompt sections
     */
    adaptFormality(template, formality) {
        switch (formality) {
            case 'formal':
                // Replace casual language with formal alternatives
                template.intro = template.intro
                    ?.replace(/you are/gi, 'you serve as')
                    ?.replace(/help/gi, 'assist');
                break;
            case 'technical':
                // Add technical precision requirements
                if (template.formatRequirements) {
                    template.formatRequirements += '\n- Use precise technical terminology and cite specific standards when applicable';
                }
                break;
            case 'academic':
                // Add academic writing requirements
                if (template.formatRequirements) {
                    template.formatRequirements += '\n- Follow academic writing conventions with proper citation and evidence-based reasoning';
                }
                break;
            default:
                break;
        }
        
        return template;
    }
    
    /**
     * Format conversation history for prompt inclusion
     */
    formatConversationHistory(history) {
        return history
            .slice(-10) // Last 10 exchanges
            .map(item => `${item.speaker}: ${item.message}`)
            .join('\n');
    }
    
    /**
     * Format screen context for prompt inclusion
     */
    formatScreenContext(screenData) {
        if (screenData.text) {
            return `Visible on screen: ${screenData.text.substring(0, 500)}...`;
        }
        if (screenData.elements) {
            return `Screen elements: ${screenData.elements.slice(0, 5).join(', ')}`;
        }
        return 'Screen content available for analysis';
    }
    
    /**
     * Apply language-specific formatting
     */
    applyLanguageFormatting(prompt, language) {
        // This would implement language-specific adaptations
        // For now, return the original prompt
        return prompt;
    }
    
    /**
     * Generate cache key for prompt caching
     */
    generateCacheKey(options) {
        const keyParts = [
            options.profile || 'default',
            options.agentId || 'none',
            options.personalityId || 'none',
            options.googleSearchEnabled ? 'search' : 'nosearch',
            options.language || 'en',
            this.hashString(options.customPrompt || ''),
            this.hashString(JSON.stringify(options.context || {}))
        ];
        
        return keyParts.join('|');
    }
    
    /**
     * Simple string hashing for cache keys
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
    
    /**
     * Cache prompt result
     */
    cachePrompt(cacheKey, prompt) {
        if (this.templateCache.size >= this.config.templateCacheSize) {
            // Remove oldest entries
            const keysToDelete = Array.from(this.templateCache.keys()).slice(0, 10);
            keysToDelete.forEach(key => this.templateCache.delete(key));
        }
        
        this.templateCache.set(cacheKey, prompt);
    }
    
    /**
     * Validate prompt against template and constraints
     */
    validatePrompt(prompt, template) {
        this.metrics.templateValidations++;
        
        try {
            // Check length constraints
            if (prompt.length > this.config.maxPromptLength) {
                throw new Error(`Prompt exceeds maximum length: ${prompt.length} > ${this.config.maxPromptLength}`);
            }
            
            // Check for required sections
            if (template.template.intro && !prompt.includes(template.template.intro.substring(0, 50))) {
                logger.warn('Prompt validation: intro section may be missing or modified');
            }
            
            // Check for placeholder consistency (skip during initialization)
            const placeholders = prompt.match(/\{\{[^}]+\}\}/g);
            if (placeholders && placeholders.length > 0) {
                if (this.config.validationLevel === 'strict') {
                    throw new Error(`Unresolved placeholders found: ${placeholders.join(', ')}`);
                } else {
                    // In lenient mode, just log placeholders for info
                    logger.debug(`Template contains placeholders (expected): ${placeholders.join(', ')}`);
                }
            }
            
            return true;
            
        } catch (error) {
            this.metrics.validationFailures++;
            if (this.config.validationLevel === 'strict') {
                throw error;
            } else {
                logger.warn('Prompt validation warning:', { error });
                return false;
            }
        }
    }
    
    /**
     * Validate all templates
     */
    async validateAllTemplates() {
        let validCount = 0;
        let invalidCount = 0;
        
        for (const [templateId, template] of this.templates) {
            try {
                // Basic template structure validation
                if (!template.template) {
                    throw new Error('Template missing template property');
                }
                
                if (!template.template.intro) {
                    logger.warn(`Template ${templateId} missing intro section`);
                }
                
                // Test build with default parameters
                const testPrompt = this.buildPromptFromTemplate(template, {
                    customPrompt: 'test',
                    googleSearchEnabled: true
                });
                
                this.validatePrompt(testPrompt, template);
                validCount++;
                
            } catch (error) {
                invalidCount++;
                logger.error(`Template validation failed for ${templateId}:`, { error });
                
                if (this.config.validationLevel === 'strict') {
                    throw new Error(`Template validation failed for ${templateId}: ${error.message}`);
                }
            }
        }
        
        logger.info(`[PromptManager] Template validation complete: ${validCount} valid, ${invalidCount} invalid`);
    }
    
    /**
     * Get template by ID
     */
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
    
    /**
     * Set custom template for agent
     */
    setAgentTemplate(agentId, customizations) {
        this.agentTemplates.set(agentId, {
            ...customizations,
            lastModified: Date.now()
        });
        
        // Clear related cache entries
        this.clearAgentCache(agentId);
        
        logger.info(`[PromptManager] Set custom template for agent: ${agentId}`);
        this.emit('agentTemplateUpdated', { agentId, customizations });
    }
    
    /**
     * Get agent template customizations
     */
    getAgentTemplate(agentId) {
        return this.agentTemplates.get(agentId);
    }
    
    /**
     * Clear agent-specific cache entries
     */
    clearAgentCache(agentId) {
        const keysToDelete = [];
        for (const key of this.templateCache.keys()) {
            if (key.includes(`|${agentId}|`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.templateCache.delete(key));
    }
    
    /**
     * Update performance metrics
     */
    updateMetrics(startTime, success, promptLength = 0) {
        const buildTime = Date.now() - startTime;
        
        this.metrics.totalBuilds++;
        if (success) {
            this.metrics.successfulBuilds++;
        }
        
        // Update average build time
        this.metrics.averageBuildTime = 
            (this.metrics.averageBuildTime * (this.metrics.totalBuilds - 1) + buildTime) / this.metrics.totalBuilds;
        
        this.state.averageBuildTime = this.metrics.averageBuildTime;
    }
    
    /**
     * Update cache hit rate
     */
    updateCacheHitRate() {
        this.state.cacheHitRate = this.metrics.totalBuilds > 0 
            ? (this.metrics.cacheHits / this.metrics.totalBuilds) * 100 
            : 0;
    }
    
    /**
     * Update template usage statistics
     */
    updateTemplateUsage(templateId, success, promptLength) {
        const template = this.templates.get(templateId);
        if (!template) return;
        
        template.metadata.usage.totalBuilds++;
        
        if (success) {
            const successCount = template.metadata.usage.totalBuilds * template.metadata.usage.successRate;
            template.metadata.usage.successRate = (successCount + 1) / template.metadata.usage.totalBuilds;
            
            // Update average length
            template.metadata.usage.averageLength = 
                (template.metadata.usage.averageLength + promptLength) / 2;
        }
    }
    
    /**
     * Get profile display name
     */
    getProfileDisplayName(profileId) {
        const names = {
            'interview': 'Interview Assistant',
            'xerus': 'Xerus AI Assistant',
            'sales': 'Sales Assistant',
            'meeting': 'Meeting Assistant',
            'presentation': 'Presentation Coach',
            'negotiation': 'Negotiation Assistant',
            'xerus_analysis': 'Xerus Analysis Agent'
        };
        return names[profileId] || profileId;
    }
    
    /**
     * Get profile category
     */
    getProfileCategory(profileId) {
        const categories = {
            'interview': 'meetings',
            'xerus': 'general',
            'sales': 'business',
            'meeting': 'meetings',
            'presentation': 'business',
            'negotiation': 'business',
            'xerus_analysis': 'analysis'
        };
        return categories[profileId] || 'general';
    }
    
    /**
     * Get profile description
     */
    getProfileDescription(profileId) {
        const descriptions = {
            'interview': 'Live meeting co-pilot for interviews and discussions',
            'xerus': 'General-purpose AI assistant for various tasks',
            'sales': 'Sales call assistant for persuasive communication',
            'meeting': 'Professional meeting assistant for business discussions',
            'presentation': 'Presentation coach for public speaking',
            'negotiation': 'Business negotiation assistant',
            'xerus_analysis': 'Advanced analysis agent with decision hierarchy'
        };
        return descriptions[profileId] || 'AI assistant profile';
    }
    
    /**
     * Get profile tags
     */
    getProfileTags(profileId) {
        const tags = {
            'interview': ['meeting', 'interview', 'discussion'],
            'xerus': ['general', 'assistant', 'ai'],
            'sales': ['sales', 'business', 'persuasion'],
            'meeting': ['meeting', 'professional', 'business'],
            'presentation': ['presentation', 'public-speaking', 'business'],
            'negotiation': ['negotiation', 'business', 'deals'],
            'xerus_analysis': ['analysis', 'advanced', 'decision-making']
        };
        return tags[profileId] || ['general'];
    }
    
    /**
     * Get all available templates
     */
    getAllTemplates() {
        return Array.from(this.templates.values());
    }
    
    /**
     * Get templates by category
     */
    getTemplatesByCategory(category) {
        return Array.from(this.templates.values())
            .filter(template => template.category === category);
    }
    
    /**
     * Get prompt manager statistics
     */
    getStatistics() {
        return {
            state: this.state,
            metrics: this.metrics,
            templates: {
                total: this.templates.size,
                categories: this.getCategoryStats(),
                mostUsed: this.getMostUsedTemplates(5)
            },
            cache: {
                size: this.templateCache.size,
                hitRate: this.state.cacheHitRate,
                maxSize: this.config.templateCacheSize
            },
            agentCustomizations: this.agentTemplates.size
        };
    }
    
    /**
     * Get category statistics
     */
    getCategoryStats() {
        const stats = {};
        for (const template of this.templates.values()) {
            stats[template.category] = (stats[template.category] || 0) + 1;
        }
        return stats;
    }
    
    /**
     * Get most used templates
     */
    getMostUsedTemplates(limit = 5) {
        return Array.from(this.templates.values())
            .sort((a, b) => b.metadata.usage.totalBuilds - a.metadata.usage.totalBuilds)
            .slice(0, limit)
            .map(template => ({
                id: template.id,
                name: template.name,
                builds: template.metadata.usage.totalBuilds,
                successRate: template.metadata.usage.successRate
            }));
    }
    
    /**
     * Clear all caches
     */
    clearCache() {
        this.templateCache.clear();
        logger.info('[PromptManager] Template cache cleared');
        this.emit('cacheCleared');
    }
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('[PromptManager] Configuration updated');
        this.emit('configUpdated', this.config);
    }
    
    /**
     * Shutdown the prompt manager
     */
    async shutdown() {
        logger.info('[PromptManager] Shutting down prompt manager...');
        
        this.clearCache();
        this.removeAllListeners();
        this.state.initialized = false;
        
        logger.info('[PromptManager] Prompt manager shutdown completed');
    }
}

// Create singleton instance
const promptManager = new PromptManager();

module.exports = {
    PromptManager,
    promptManager,
    
    // Convenience functions that match existing API
    buildSystemPrompt(promptParts, customPrompt = '', googleSearchEnabled = true) {
        // Legacy function for backward compatibility
        return promptManager.buildPromptFromTemplate({ template: promptParts }, {
            customPrompt,
            googleSearchEnabled
        });
    },
    
    getSystemPrompt(profile, customPrompt = '', googleSearchEnabled = true) {
        // Legacy function for backward compatibility
        return promptManager.buildSystemPrompt({
            profile,
            customPrompt,
            googleSearchEnabled
        });
    }
};