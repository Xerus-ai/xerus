/**
 * XERUS AGENT PERSONALITY MANAGER
 * Manages AI agent personalities and behavioral configurations
 * 
 * Features:
 * - Multiple personality profiles for different use cases
 * - Dynamic personality switching based on context
 * - Behavioral parameter tuning
 * - Personality trait management
 * - Context-aware personality adaptation
 * - User preference learning
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../../common/services/logger.js');

const logger = createLogger('Agent-personality-manager');

// Import agent data manager to fetch dynamic agents from backend
let agentDataManager = null;
const loadAgentDataManager = async () => {
    if (!agentDataManager) {
        const { agentDataManager: manager } = require('./agent-data-manager.js');
        agentDataManager = manager;
        
        // Ensure it's initialized
        if (!agentDataManager.state?.isInitialized) {
            await agentDataManager.initialize();
        }
    }
    return agentDataManager;
};

class AgentPersonalityManager extends EventEmitter {
    constructor() {
        super();
        
        this.state = {
            currentPersonality: 'assistant',
            currentPersonalityDbId: 1, // Default to database ID 1 (Knowledge Base Expert)
            isAdaptive: true,
            adaptationLevel: 'medium',
            userPreferences: {},
            contextFactors: {
                taskType: 'general',
                userMood: 'neutral',
                complexity: 'medium',
                urgency: 'normal'
            }
        };
        
        this.personalities = new Map();
        this.behaviorProfiles = new Map();
        this.contextAdaptationRules = new Map();
        
        // Dynamic mapping will be built from backend agent data
        this.agentIdToPersonalityMap = new Map();
        this.backendAgents = new Map(); // Store full agent data from backend
        
        this.initialized = false;
        this._initializing = false; // Track concurrent initialization attempts
        this.initializePersonalities();
        
        logger.info('[AgentPersonalityManager] Personality manager created');
    }

    /**
     * Load agents from backend and create dynamic personality mapping
     */
    async loadAndMapBackendAgents() {
        try {
            logger.info('[AgentPersonalityManager] Loading agents from backend...');
            
            const manager = await loadAgentDataManager();
            const agents = await manager.getAllAgents();
            
            logger.info(`[AgentPersonalityManager] Loaded ${agents.length} agents from backend`);
            
            // Clear existing mapping
            this.agentIdToPersonalityMap.clear();
            this.backendAgents.clear();
            
            // Map agents by their personality type or name patterns
            for (const agent of agents) {
                this.backendAgents.set(agent.id, agent);
                
                // Map agent personality_type to our personality profiles
                let personalityId = this.mapAgentToPersonality(agent);
                
                this.agentIdToPersonalityMap.set(agent.id, personalityId);
                logger.info(`[AgentPersonalityManager] Mapped agent ID ${agent.id} (${agent.name}) to personality '${personalityId}'`);
            }
            
            logger.info(`[AgentPersonalityManager] Created dynamic mapping for ${agents.length} agents`);
            return agents.length > 0;
            
        } catch (error) {
            logger.error('[AgentPersonalityManager] Failed to load backend agents:', { error });
            
            // Fallback to default mapping if backend fails
            logger.warn('[AgentPersonalityManager] Using fallback default mapping');
            this.agentIdToPersonalityMap.set(1, 'assistant');
            return false;
        }
    }
    
    /**
     * Map backend agent to personality type based on agent properties
     */
    mapAgentToPersonality(agent) {
        // Check if agent has explicit personality_type field
        if (agent.personality_type) {
            // Map common backend personality types to our personality profiles
            const personalityTypeMap = {
                'assistant': 'assistant',
                'general_assistant': 'assistant', 
                'technical_expert': 'technical_expert',
                'tech_expert': 'technical_expert',
                'developer': 'technical_expert',
                'creative_assistant': 'creative_assistant',
                'creative': 'creative_assistant',
                'tutor': 'tutor',
                'teacher': 'tutor',
                'educator': 'tutor',
                'executive_assistant': 'executive_assistant',
                'business': 'executive_assistant',
                'research_assistant': 'research_assistant',
                'researcher': 'research_assistant',
                'analyst': 'research_assistant'
            };
            
            const mappedType = personalityTypeMap[agent.personality_type.toLowerCase()];
            if (mappedType) {
                return mappedType;
            }
        }
        
        // Fallback: map based on agent name patterns
        const nameLower = agent.name ? agent.name.toLowerCase() : '';
        
        if (nameLower.includes('technical') || nameLower.includes('developer') || nameLower.includes('engineer')) {
            return 'technical_expert';
        } else if (nameLower.includes('creative') || nameLower.includes('writer') || nameLower.includes('design')) {
            return 'creative_assistant';
        } else if (nameLower.includes('tutor') || nameLower.includes('teacher') || nameLower.includes('educator')) {
            return 'tutor';
        } else if (nameLower.includes('executive') || nameLower.includes('business') || nameLower.includes('manager')) {
            return 'executive_assistant';
        } else if (nameLower.includes('research') || nameLower.includes('analyst') || nameLower.includes('knowledge')) {
            return 'research_assistant';
        }
        
        // Default fallback
        return 'assistant';
    }

    /**
     * Initialize all personality profiles
     */
    initializePersonalities() {
        logger.info('[AgentPersonalityManager] Initializing personalities...');
        
        // Assistant - Default balanced personality
        this.registerPersonality({
            id: 'assistant',
            name: 'General Assistant',
            description: 'Balanced, helpful AI assistant for general tasks',
            traits: {
                helpfulness: 0.9,
                formality: 0.6,
                verbosity: 0.7,
                creativity: 0.6,
                patience: 0.8,
                proactivity: 0.7,
                empathy: 0.7,
                technical_depth: 0.6,
                humor: 0.3,
                assertiveness: 0.5
            },
            communicationStyle: {
                tone: 'friendly_professional',
                responseLength: 'medium',
                explanationLevel: 'balanced',
                exampleUsage: 'contextual',
                questionAsking: 'moderate'
            },
            domainExpertise: {
                general: 0.8,
                technical: 0.7,
                creative: 0.6,
                analytical: 0.7,
                educational: 0.7
            },
            adaptationRules: {
                increaseHelpfulness: ['user_frustrated', 'task_complex'],
                decreaseVerbosity: ['user_experienced', 'task_urgent'],
                increaseTechnicalDepth: ['technical_context', 'expert_user'],
                increasePatience: ['user_learning', 'beginner_context']
            }
        });

        // Technical Expert - For development and technical tasks
        this.registerPersonality({
            id: 'technical_expert',
            name: 'Technical Expert',
            description: 'Knowledgeable technical specialist for development tasks',
            traits: {
                helpfulness: 0.8,
                formality: 0.4,
                verbosity: 0.6,
                creativity: 0.7,
                patience: 0.7,
                proactivity: 0.8,
                empathy: 0.5,
                technical_depth: 0.95,
                humor: 0.4,
                assertiveness: 0.7
            },
            communicationStyle: {
                tone: 'technical_direct',
                responseLength: 'detailed',
                explanationLevel: 'technical',
                exampleUsage: 'code_heavy',
                questionAsking: 'targeted'
            },
            domainExpertise: {
                general: 0.6,
                technical: 0.95,
                creative: 0.5,
                analytical: 0.9,
                educational: 0.8
            },
            adaptationRules: {
                increaseVerbosity: ['complex_problem', 'debugging_context'],
                decreaseFormality: ['casual_user', 'quick_question'],
                increaseCreativity: ['architecture_design', 'optimization_task'],
                increaseAssertiveness: ['wrong_approach', 'security_issue']
            }
        });

        // Creative Assistant - For creative and content tasks
        this.registerPersonality({
            id: 'creative_assistant',
            name: 'Creative Assistant',
            description: 'Imaginative and inspiring assistant for creative work',
            traits: {
                helpfulness: 0.9,
                formality: 0.3,
                verbosity: 0.8,
                creativity: 0.95,
                patience: 0.9,
                proactivity: 0.8,
                empathy: 0.8,
                technical_depth: 0.4,
                humor: 0.7,
                assertiveness: 0.4
            },
            communicationStyle: {
                tone: 'enthusiastic_supportive',
                responseLength: 'rich',
                explanationLevel: 'inspirational',
                exampleUsage: 'creative_examples',
                questionAsking: 'exploratory'
            },
            domainExpertise: {
                general: 0.7,
                technical: 0.4,
                creative: 0.95,
                analytical: 0.5,
                educational: 0.6
            },
            adaptationRules: {
                increaseCreativity: ['brainstorming', 'design_task'],
                increaseEmpathy: ['user_stuck', 'creative_block'],
                increaseVerbosity: ['inspiration_needed', 'exploration_phase'],
                decreaseFormality: ['casual_creative', 'fun_project']
            }
        });

        // Tutor - For educational and learning tasks
        this.registerPersonality({
            id: 'tutor',
            name: 'Patient Tutor',
            description: 'Educational assistant focused on learning and growth',
            traits: {
                helpfulness: 0.95,
                formality: 0.5,
                verbosity: 0.8,
                creativity: 0.6,
                patience: 0.95,
                proactivity: 0.6,
                empathy: 0.9,
                technical_depth: 0.7,
                humor: 0.5,
                assertiveness: 0.3
            },
            communicationStyle: {
                tone: 'encouraging_patient',
                responseLength: 'explanatory',
                explanationLevel: 'step_by_step',
                exampleUsage: 'educational',
                questionAsking: 'socratic'
            },
            domainExpertise: {
                general: 0.8,
                technical: 0.7,
                creative: 0.6,
                analytical: 0.7,
                educational: 0.95
            },
            adaptationRules: {
                increasePatience: ['user_struggling', 'complex_concept'],
                increaseEmpathy: ['user_frustrated', 'learning_difficulty'],
                adjustVerbosity: ['user_level_beginner', 'concept_difficulty'],
                increaseEncouragement: ['user_progress', 'milestone_reached']
            }
        });

        // Executive Assistant - For business and productivity tasks
        this.registerPersonality({
            id: 'executive_assistant',
            name: 'Executive Assistant',
            description: 'Professional assistant for business and productivity',
            traits: {
                helpfulness: 0.9,
                formality: 0.8,
                verbosity: 0.6,
                creativity: 0.5,
                patience: 0.7,
                proactivity: 0.9,
                empathy: 0.6,
                technical_depth: 0.6,
                humor: 0.2,
                assertiveness: 0.8
            },
            communicationStyle: {
                tone: 'professional_efficient',
                responseLength: 'concise',
                explanationLevel: 'business_focused',
                exampleUsage: 'practical',
                questionAsking: 'strategic'
            },
            domainExpertise: {
                general: 0.8,
                technical: 0.6,
                creative: 0.5,
                analytical: 0.8,
                educational: 0.6
            },
            adaptationRules: {
                increaseProactivity: ['deadline_approach', 'project_management'],
                increaseAssertiveness: ['decision_needed', 'priority_conflict'],
                decreaseVerbosity: ['executive_user', 'time_pressure'],
                increaseFormality: ['external_communication', 'official_document']
            }
        });

        // Research Assistant - For analysis and research tasks
        this.registerPersonality({
            id: 'research_assistant',
            name: 'Research Assistant',
            description: 'Analytical assistant for research and investigation',
            traits: {
                helpfulness: 0.9,
                formality: 0.7,
                verbosity: 0.8,
                creativity: 0.6,
                patience: 0.8,
                proactivity: 0.7,
                empathy: 0.6,
                technical_depth: 0.8,
                humor: 0.3,
                assertiveness: 0.6
            },
            communicationStyle: {
                tone: 'analytical_thorough',
                responseLength: 'comprehensive',
                explanationLevel: 'detailed',
                exampleUsage: 'evidence_based',
                questionAsking: 'investigative'
            },
            domainExpertise: {
                general: 0.7,
                technical: 0.8,
                creative: 0.5,
                analytical: 0.95,
                educational: 0.8
            },
            adaptationRules: {
                increaseVerbosity: ['research_depth', 'analysis_needed'],
                increaseTechnicalDepth: ['scientific_context', 'data_analysis'],
                increasePatience: ['complex_research', 'long_investigation'],
                increaseAnalytical: ['fact_checking', 'verification_needed']
            }
        });

        logger.info('Initialized  personality profiles');
    }

    /**
     * Register a new personality profile
     */
    registerPersonality(personalityConfig) {
        const personality = {
            ...personalityConfig,
            id: personalityConfig.id,
            dateCreated: new Date().toISOString(),
            version: '1.0.0',
            usage: {
                activationCount: 0,
                totalActiveTime: 0,
                averageSessionTime: 0,
                userSatisfactionScore: 0,
                adaptationEvents: []
            },
            currentTraits: { ...personalityConfig.traits }, // Allow runtime modification
            currentCommunicationStyle: { ...personalityConfig.communicationStyle }
        };

        this.personalities.set(personality.id, personality);
        logger.info(`Registered personality: ${personality.name} (${personality.id})`);
        
        this.emit('personalityRegistered', { personality });
    }

    /**
     * Set personality (alias for switchPersonality for external API compatibility)
     */
    async setPersonality(personalityId, options = {}) {
        return await this.switchPersonality(personalityId, options);
    }

    /**
     * Switch to a different personality
     */
    async switchPersonality(personalityId, options = {}) {
        // Handle both numeric database IDs and string personality IDs
        let targetPersonalityId = personalityId;
        let dbAgentId = personalityId;
        
        // If it's a numeric ID, map it to personality string
        if (typeof personalityId === 'number') {
            const mappedPersonality = this.agentIdToPersonalityMap.get(personalityId);
            if (mappedPersonality) {
                targetPersonalityId = mappedPersonality;
                dbAgentId = personalityId;
                logger.info(`Mapped database agent ID ${personalityId} to personality '${targetPersonalityId}'`);
            } else {
                // Fallback to default if mapping not found
                targetPersonalityId = 'assistant';
                dbAgentId = 1;
                logger.warn(`No mapping found for agent ID ${personalityId}, using default 'assistant'`);
            }
        } else {
            // If it's already a string, find the corresponding database ID
            for (const [dbId, personality] of this.agentIdToPersonalityMap.entries()) {
                if (personality === personalityId) {
                    dbAgentId = dbId;
                    break;
                }
            }
        }

        const personality = this.personalities.get(targetPersonalityId);
        if (!personality) {
            throw new Error(`Personality not found: ${targetPersonalityId} (original ID: ${personalityId})`);
        }

        const previousPersonality = this.state.currentPersonality;
        
        try {
            logger.info(`Switching personality: ${previousPersonality} → ${targetPersonalityId} (dbId: ${dbAgentId})`);
            
            // Update usage statistics for previous personality
            if (previousPersonality !== targetPersonalityId) {
                await this.updatePersonalityUsage(previousPersonality);
            }

            // Update state with both string personality ID and numeric database ID
            this.state.currentPersonality = targetPersonalityId;
            this.state.currentPersonalityDbId = dbAgentId;
            
            // Apply personality to current context
            await this.applyPersonalityToContext(personality, options);
            
            // Update usage statistics for new personality
            personality.usage.activationCount++;
            personality.usage.lastActivated = Date.now();
            
            this.emit('personalitySwitched', {
                previous: previousPersonality,
                current: targetPersonalityId,
                dbAgentId: dbAgentId,
                personality,
                options
            });
            
            logger.info('Personality switched successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to switch personality:', { 
                error: error.message, 
                stack: error.stack,
                personalityId,
                targetPersonalityId,
                dbAgentId,
                previousPersonality 
            });
            throw error;
        }
    }

    /**
     * Apply personality traits to current context
     */
    async applyPersonalityToContext(personality, options = {}) {
        try {
            // Apply adaptive modifications based on context
            if (this.state.isAdaptive) {
                personality.currentTraits = await this.adaptPersonalityToContext(
                    personality, 
                    this.state.contextFactors
                );
            }

            // Notify systems about personality change
            this.emit('personalityApplied', {
                personality,
                traits: personality.currentTraits,
                communicationStyle: personality.currentCommunicationStyle,
                context: this.state.contextFactors
            });
            
        } catch (error) {
            logger.error('Failed to apply personality to context:', { 
                error: error.message, 
                stack: error.stack,
                personality: personality?.id 
            });
            throw error;
        }
    }

    /**
     * Adapt personality traits based on context
     */
    async adaptPersonalityToContext(personality, contextFactors) {
        let adaptedTraits = { ...personality.traits };
        const adaptationRules = personality.adaptationRules;
        
        // Apply context-based adaptations
        for (const [adaptation, triggers] of Object.entries(adaptationRules)) {
            const shouldApply = triggers.some(trigger => 
                this.checkContextTrigger(trigger, contextFactors)
            );
            
            if (shouldApply) {
                adaptedTraits = this.applyAdaptation(adaptedTraits, adaptation);
            }
        }
        
        // Apply user preference modifications
        if (this.state.userPreferences) {
            adaptedTraits = this.applyUserPreferences(adaptedTraits, this.state.userPreferences);
        }
        
        return adaptedTraits;
    }

    /**
     * Check if a context trigger is active
     */
    checkContextTrigger(trigger, contextFactors) {
        const triggerMappings = {
            'user_frustrated': contextFactors.userMood === 'frustrated',
            'task_complex': contextFactors.complexity === 'high',
            'user_experienced': contextFactors.userLevel === 'expert',
            'task_urgent': contextFactors.urgency === 'high',
            'technical_context': contextFactors.taskType === 'technical',
            'expert_user': contextFactors.userLevel === 'expert',
            'user_learning': contextFactors.taskType === 'educational',
            'beginner_context': contextFactors.userLevel === 'beginner',
            'complex_problem': contextFactors.complexity === 'high',
            'debugging_context': contextFactors.taskType === 'debugging',
            'casual_user': contextFactors.userLevel === 'casual',
            'quick_question': contextFactors.urgency === 'high',
            'architecture_design': contextFactors.taskType === 'design',
            'optimization_task': contextFactors.taskType === 'optimization',
            'wrong_approach': contextFactors.feedback === 'negative',
            'security_issue': contextFactors.taskType === 'security',
            'brainstorming': contextFactors.taskType === 'brainstorming',
            'design_task': contextFactors.taskType === 'design',
            'user_stuck': contextFactors.userMood === 'stuck',
            'creative_block': contextFactors.userMood === 'blocked',
            'inspiration_needed': contextFactors.userMood === 'uninspired',
            'exploration_phase': contextFactors.taskPhase === 'exploration',
            'casual_creative': contextFactors.formality === 'casual',
            'fun_project': contextFactors.projectType === 'fun',
            'user_struggling': contextFactors.userMood === 'struggling',
            'complex_concept': contextFactors.complexity === 'high',
            'learning_difficulty': contextFactors.difficultyLevel === 'high',
            'user_progress': contextFactors.feedback === 'positive',
            'milestone_reached': contextFactors.achievement === 'milestone',
            'deadline_approach': contextFactors.urgency === 'high',
            'project_management': contextFactors.taskType === 'management',
            'decision_needed': contextFactors.taskType === 'decision',
            'priority_conflict': contextFactors.conflicts === 'priority',
            'executive_user': contextFactors.userLevel === 'executive',
            'time_pressure': contextFactors.urgency === 'high',
            'external_communication': contextFactors.audience === 'external',
            'official_document': contextFactors.documentType === 'official',
            'research_depth': contextFactors.depth === 'deep',
            'analysis_needed': contextFactors.taskType === 'analysis',
            'scientific_context': contextFactors.domain === 'scientific',
            'data_analysis': contextFactors.taskType === 'data_analysis',
            'complex_research': contextFactors.complexity === 'high',
            'long_investigation': contextFactors.duration === 'long',
            'fact_checking': contextFactors.taskType === 'fact_checking',
            'verification_needed': contextFactors.taskType === 'verification'
        };
        
        return triggerMappings[trigger] || false;
    }

    /**
     * Apply specific trait adaptations
     */
    applyAdaptation(traits, adaptation) {
        const adaptedTraits = { ...traits };
        const adaptationValue = 0.1; // Standard adjustment amount
        
        switch (adaptation) {
            case 'increaseHelpfulness':
                adaptedTraits.helpfulness = Math.min(1.0, adaptedTraits.helpfulness + adaptationValue);
                break;
            case 'decreaseVerbosity':
                adaptedTraits.verbosity = Math.max(0.1, adaptedTraits.verbosity - adaptationValue);
                break;
            case 'increaseTechnicalDepth':
                adaptedTraits.technical_depth = Math.min(1.0, adaptedTraits.technical_depth + adaptationValue);
                break;
            case 'increasePatience':
                adaptedTraits.patience = Math.min(1.0, adaptedTraits.patience + adaptationValue);
                break;
            case 'increaseVerbosity':
                adaptedTraits.verbosity = Math.min(1.0, adaptedTraits.verbosity + adaptationValue);
                break;
            case 'decreaseFormality':
                adaptedTraits.formality = Math.max(0.1, adaptedTraits.formality - adaptationValue);
                break;
            case 'increaseCreativity':
                adaptedTraits.creativity = Math.min(1.0, adaptedTraits.creativity + adaptationValue);
                break;
            case 'increaseAssertiveness':
                adaptedTraits.assertiveness = Math.min(1.0, adaptedTraits.assertiveness + adaptationValue);
                break;
            case 'increaseEmpathy':
                adaptedTraits.empathy = Math.min(1.0, adaptedTraits.empathy + adaptationValue);
                break;
            case 'increaseProactivity':
                adaptedTraits.proactivity = Math.min(1.0, adaptedTraits.proactivity + adaptationValue);
                break;
            case 'adjustVerbosity':
                // Context-specific verbosity adjustment
                if (this.state.contextFactors.userLevel === 'beginner') {
                    adaptedTraits.verbosity = Math.min(1.0, adaptedTraits.verbosity + adaptationValue);
                } else {
                    adaptedTraits.verbosity = Math.max(0.1, adaptedTraits.verbosity - adaptationValue);
                }
                break;
            case 'increaseEncouragement':
                adaptedTraits.empathy = Math.min(1.0, adaptedTraits.empathy + adaptationValue);
                adaptedTraits.patience = Math.min(1.0, adaptedTraits.patience + adaptationValue);
                break;
            case 'increaseAnalytical':
                adaptedTraits.technical_depth = Math.min(1.0, adaptedTraits.technical_depth + adaptationValue);
                adaptedTraits.patience = Math.min(1.0, adaptedTraits.patience + adaptationValue);
                break;
        }
        
        return adaptedTraits;
    }

    /**
     * Apply user preferences to personality traits
     */
    applyUserPreferences(traits, preferences) {
        const adaptedTraits = { ...traits };
        
        // Apply user-specific preferences
        if (preferences.preferredVerbosity) {
            adaptedTraits.verbosity = this.interpolateTraitValue(
                adaptedTraits.verbosity, 
                preferences.preferredVerbosity, 
                0.3
            );
        }
        
        if (preferences.preferredFormality) {
            adaptedTraits.formality = this.interpolateTraitValue(
                adaptedTraits.formality, 
                preferences.preferredFormality, 
                0.3
            );
        }
        
        if (preferences.preferredTechnicalDepth) {
            adaptedTraits.technical_depth = this.interpolateTraitValue(
                adaptedTraits.technical_depth, 
                preferences.preferredTechnicalDepth, 
                0.3
            );
        }
        
        if (preferences.preferredHumor) {
            adaptedTraits.humor = this.interpolateTraitValue(
                adaptedTraits.humor, 
                preferences.preferredHumor, 
                0.3
            );
        }
        
        return adaptedTraits;
    }

    /**
     * Interpolate between current and target trait values
     */
    interpolateTraitValue(current, target, weight) {
        return current + (target - current) * weight;
    }

    /**
     * Update context factors that influence personality adaptation
     */
    updateContextFactors(contextFactors) {
        this.state.contextFactors = { ...this.state.contextFactors, ...contextFactors };
        
        // Re-apply current personality with new context
        if (this.state.isAdaptive) {
            this.adaptCurrentPersonality();
        }
        
        this.emit('contextFactorsUpdated', {
            contextFactors: this.state.contextFactors
        });
        
        logger.info('[AgentPersonalityManager] Context factors updated');
    }

    /**
     * Adapt current personality to updated context
     */
    async adaptCurrentPersonality() {
        const personality = this.personalities.get(this.state.currentPersonality);
        if (!personality) {
            return;
        }
        
        try {
            await this.applyPersonalityToContext(personality);
        } catch (error) {
            logger.error('Failed to adapt current personality:', { error });
        }
    }

    /**
     * Get system prompt based on current personality
     */
    getSystemPrompt() {
        const personality = this.personalities.get(this.state.currentPersonality);
        if (!personality) {
            return 'You are Xerus Glass, a helpful AI assistant.';
        }
        
        const traits = personality.currentTraits;
        const style = personality.currentCommunicationStyle;
        
        let systemPrompt = `You are Xerus Glass, embodying the "${personality.name}" personality. ${personality.description}

Your current behavioral traits:
- Helpfulness: ${this.traitToDescription(traits.helpfulness, 'helpful')}
- Formality: ${this.traitToDescription(traits.formality, 'formal')}
- Verbosity: ${this.traitToDescription(traits.verbosity, 'verbose')}
- Creativity: ${this.traitToDescription(traits.creativity, 'creative')}
- Patience: ${this.traitToDescription(traits.patience, 'patient')}
- Technical Depth: ${this.traitToDescription(traits.technical_depth, 'technical')}
- Empathy: ${this.traitToDescription(traits.empathy, 'empathetic')}

Communication Style:
- Tone: ${style.tone.replace('_', ' ')}
- Response Length: ${style.responseLength}
- Explanation Level: ${style.explanationLevel.replace('_', ' ')}

Adapt your responses to match these traits and style preferences while maintaining helpfulness and accuracy.`;
        
        // Add context-specific instructions
        if (this.state.contextFactors.taskType !== 'general') {
            systemPrompt += `\n\nCurrent context: ${this.state.contextFactors.taskType} task`;
        }
        
        if (this.state.contextFactors.userLevel) {
            systemPrompt += `\nUser expertise level: ${this.state.contextFactors.userLevel}`;
        }
        
        return systemPrompt;
    }

    /**
     * Convert trait value to human-readable description
     */
    traitToDescription(value, trait) {
        const level = value >= 0.8 ? 'very' : value >= 0.6 ? 'moderately' : value >= 0.4 ? 'somewhat' : 'minimally';
        return `${level} ${trait}`;
    }

    /**
     * Get personality recommendations based on task type
     */
    getPersonalityRecommendations(taskType, userLevel = 'intermediate') {
        const recommendations = {
            'technical': ['technical_expert', 'research_assistant'],
            'creative': ['creative_assistant', 'assistant'],
            'educational': ['tutor', 'assistant'],
            'business': ['executive_assistant', 'research_assistant'],
            'research': ['research_assistant', 'technical_expert'],
            'writing': ['creative_assistant', 'assistant'],
            'debugging': ['technical_expert', 'research_assistant'],
            'design': ['creative_assistant', 'technical_expert'],
            'analysis': ['research_assistant', 'technical_expert'],
            'general': ['assistant', 'tutor']
        };
        
        const suggested = recommendations[taskType] || recommendations['general'];
        
        // Adjust recommendations based on user level
        if (userLevel === 'beginner') {
            suggested.unshift('tutor');
        } else if (userLevel === 'expert') {
            suggested.unshift('technical_expert');
        }
        
        return suggested.slice(0, 3).map(id => ({
            id,
            personality: this.personalities.get(id),
            suitabilityScore: this.calculateSuitabilityScore(id, taskType, userLevel)
        }));
    }

    /**
     * Calculate suitability score for personality-task combination
     */
    calculateSuitabilityScore(personalityId, taskType, userLevel) {
        const personality = this.personalities.get(personalityId);
        if (!personality) return 0;
        
        const domainMapping = {
            'technical': 'technical',
            'creative': 'creative',
            'educational': 'educational',
            'business': 'analytical',
            'research': 'analytical',
            'writing': 'creative',
            'debugging': 'technical',
            'design': 'creative',
            'analysis': 'analytical',
            'general': 'general'
        };
        
        const primaryDomain = domainMapping[taskType] || 'general';
        const domainScore = personality.domainExpertise[primaryDomain] || 0.5;
        
        // Adjust for user level
        const userLevelAdjustment = {
            'beginner': personality.traits.patience * 0.3,
            'intermediate': 0,
            'expert': personality.traits.technical_depth * 0.2
        };
        
        const adjustment = userLevelAdjustment[userLevel] || 0;
        
        return Math.min(1.0, domainScore + adjustment);
    }

    /**
     * Learn from user feedback to improve personality adaptation
     */
    learnFromFeedback(feedback) {
        const { rating, personalityId, contextFactors, suggestions } = feedback;
        
        const personality = this.personalities.get(personalityId);
        if (!personality) {
            return;
        }
        
        // Update satisfaction score
        const currentCount = personality.usage.activationCount;
        const currentScore = personality.usage.userSatisfactionScore;
        
        personality.usage.userSatisfactionScore = 
            (currentScore * (currentCount - 1) + rating) / currentCount;
        
        // Learn user preferences
        if (suggestions) {
            this.updateUserPreferences(suggestions);
        }
        
        // Record adaptation event
        personality.usage.adaptationEvents.push({
            timestamp: Date.now(),
            rating,
            contextFactors,
            suggestions
        });
        
        this.emit('feedbackLearned', {
            personalityId,
            rating,
            updatedScore: personality.usage.userSatisfactionScore
        });
        
        logger.info('Learned from feedback:  (rating: )');
    }

    /**
     * Update user preferences based on feedback
     */
    updateUserPreferences(suggestions) {
        this.state.userPreferences = {
            ...this.state.userPreferences,
            ...suggestions
        };
        
        this.emit('userPreferencesUpdated', {
            preferences: this.state.userPreferences
        });
    }

    /**
     * Update personality usage statistics
     */
    async updatePersonalityUsage(personalityId) {
        const personality = this.personalities.get(personalityId);
        if (!personality) {
            return;
        }
        
        const sessionTime = Date.now() - (personality.usage.lastActivated || Date.now());
        personality.usage.totalActiveTime += sessionTime;
        
        const activationCount = personality.usage.activationCount;
        personality.usage.averageSessionTime = 
            (personality.usage.averageSessionTime * (activationCount - 1) + sessionTime) / activationCount;
    }

    /**
     * Get all available personalities
     */
    getAvailablePersonalities() {
        return Array.from(this.personalities.values()).map(personality => ({
            id: personality.id,
            name: personality.name,
            description: personality.description,
            traits: personality.traits,
            communicationStyle: personality.communicationStyle,
            domainExpertise: personality.domainExpertise,
            usage: personality.usage
        }));
    }

    /**
     * Get current personality status
     */
    getCurrentPersonalityStatus() {
        const personality = this.personalities.get(this.state.currentPersonality);
        if (!personality) {
            return null;
        }
        
        return {
            id: this.state.currentPersonalityDbId, // Return the numeric database ID, not the string personality ID
            personalityId: personality.id, // Keep the string personality ID for reference
            name: personality.name,
            description: personality.description,
            currentTraits: personality.currentTraits,
            currentCommunicationStyle: personality.currentCommunicationStyle,
            isAdaptive: this.state.isAdaptive,
            contextFactors: this.state.contextFactors,
            systemPrompt: this.getSystemPrompt()
        };
    }

    /**
     * Get personality analytics
     */
    getPersonalityAnalytics() {
        const personalities = Array.from(this.personalities.values());
        const totalActivations = personalities.reduce((sum, p) => sum + p.usage.activationCount, 0);
        
        return {
            totalPersonalities: personalities.length,
            totalActivations,
            currentPersonality: this.state.currentPersonality,
            isAdaptive: this.state.isAdaptive,
            mostUsedPersonality: personalities.reduce((prev, current) => 
                prev.usage.activationCount > current.usage.activationCount ? prev : current
            ).id,
            averageSatisfactionScore: personalities.reduce((sum, p) => 
                sum + p.usage.userSatisfactionScore, 0) / personalities.length,
            userPreferences: this.state.userPreferences,
            contextFactors: this.state.contextFactors
        };
    }

    /**
     * Configure personality manager settings
     */
    updateConfig(config) {
        const { isAdaptive, adaptationLevel } = config;
        
        if (isAdaptive !== undefined) {
            this.state.isAdaptive = isAdaptive;
        }
        
        if (adaptationLevel !== undefined) {
            this.state.adaptationLevel = adaptationLevel;
        }
        
        this.emit('configUpdated', {
            isAdaptive: this.state.isAdaptive,
            adaptationLevel: this.state.adaptationLevel
        });
        
        logger.info('[AgentPersonalityManager] Configuration updated');
    }

    /**
     * Get backend agent information by ID
     */
    getBackendAgentById(agentId) {
        return this.backendAgents.get(agentId) || null;
    }
    
    /**
     * Get all backend agents
     */
    getAllBackendAgents() {
        return Array.from(this.backendAgents.values());
    }
    
    /**
     * Get agent mapping information
     */
    getAgentMapping() {
        return Array.from(this.agentIdToPersonalityMap.entries()).map(([agentId, personalityId]) => ({
            agentId,
            personalityId,
            backendAgent: this.backendAgents.get(agentId)
        }));
    }

    /**
     * Get current state
     */
    getState() {
        return {
            currentPersonality: this.state.currentPersonality,
            isAdaptive: this.state.isAdaptive,
            adaptationLevel: this.state.adaptationLevel,
            contextFactors: this.state.contextFactors,
            userPreferences: this.state.userPreferences,
            availablePersonalities: this.getAvailablePersonalities().map(p => ({
                id: p.id,
                name: p.name,
                description: p.description
            })),
            backendAgentsCount: this.backendAgents.size,
            mappingCount: this.agentIdToPersonalityMap.size
        };
    }

    /**
     * Initialize the personality manager (singleton pattern)
     */
    async initialize() {
        // Prevent multiple concurrent initializations
        if (this.initialized) {
            logger.info('[AgentPersonalityManager] Already initialized, skipping');
            return;
        }
        
        if (this._initializing) {
            logger.info('[AgentPersonalityManager] Already initializing, waiting...');
            return new Promise((resolve, reject) => {
                this.once('initialized', resolve);
                this.once('initializationFailed', reject);
            });
        }
        
        this._initializing = true;
        
        try {
            logger.info('[AgentPersonalityManager] Initializing personality manager...');
            
            // Load backend agents and create dynamic mapping
            const hasBackendAgents = await this.loadAndMapBackendAgents();
            
            // Set default personality - use first available agent or fallback to ID 1
            let defaultAgentId = 1;
            if (hasBackendAgents && this.agentIdToPersonalityMap.size > 0) {
                // Use the first agent from the backend
                defaultAgentId = Array.from(this.agentIdToPersonalityMap.keys())[0];
                logger.info(`[AgentPersonalityManager] Using first available agent as default: ${defaultAgentId}`);
            } else {
                logger.warn('[AgentPersonalityManager] No backend agents available, using fallback agent ID 1');
            }
            
            await this.switchPersonality(defaultAgentId);
            
            this.initialized = true;
            this._initializing = false;
            logger.info('[AgentPersonalityManager] Personality manager initialized');
            
            this.emit('initialized');
            
        } catch (error) {
            this._initializing = false;
            logger.error('Failed to initialize personality manager:', { 
                error: error.message, 
                stack: error.stack 
            });
            this.emit('initializationFailed', error);
            throw error;
        }
    }

    /**
     * Shutdown the personality manager
     */
    async shutdown() {
        logger.info('[AgentPersonalityManager] Shutting down personality manager...');
        
        // Update usage for current personality
        if (this.state.currentPersonality) {
            await this.updatePersonalityUsage(this.state.currentPersonality);
        }
        
        this.removeAllListeners();
        this.initialized = false;
        
        logger.info('[AgentPersonalityManager] Personality manager shutdown completed');
    }
}

// Export singleton instance
const agentPersonalityManager = new AgentPersonalityManager();

module.exports = {
    agentPersonalityManager,
    AgentPersonalityManager
};