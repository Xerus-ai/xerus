/**
 * XERUS DEMO/TUTORIAL GUIDANCE AGENT
 * Interactive tutorial and onboarding system for Xerus AI
 * 
 * Features:
 * - Step-by-step guided tutorials
 * - Interactive demonstrations
 * - Contextual help and tips
 * - Progress tracking and analytics
 * - Adaptive learning paths
 * - Voice-guided tutorials
 */

const { EventEmitter } = require('events');
// Remove direct import to avoid circular dependency - use dependency injection instead
// const { featureIntegrationService } = require('../services/feature-integration');
const { createLogger } = require('../common/services/logger.js');

const logger = createLogger('Demo-tutorial-agent');

class DemoTutorialAgent extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            enableVoiceGuidance: true,
            enableInteractiveMode: true,
            autoAdvanceTimeout: 30000, // 30 seconds
            skipIntroForReturningUsers: true,
            adaptiveDifficulty: true
        };
        
        this.state = {
            isActive: false,
            currentTutorial: null,
            currentStep: 0,
            userProgress: new Map(), // tutorial_id -> progress data
            completedTutorials: new Set(),
            userPreferences: {
                preferredPace: 'normal', // 'slow', 'normal', 'fast'
                preferredMode: 'visual', // 'visual', 'voice', 'mixed'
                skipBasics: false,
                enableHints: true
            }
        };
        
        this.tutorials = new Map();
        this.initializeTutorials();
        
        logger.info('[DemoTutorialAgent] Demo/Tutorial agent created');
    }

    /**
     * Initialize all available tutorials
     */
    initializeTutorials() {
        logger.info('[DemoTutorialAgent] Initializing tutorials...');
        
        // Basic Glass Introduction
        this.registerTutorial({
            id: 'glass_basics',
            title: 'Xerus AI Basics',
            description: 'Learn the fundamentals of using Xerus AI',
            difficulty: 'beginner',
            estimatedTime: '5 minutes',
            prerequisites: [],
            steps: [
                {
                    id: 'welcome',
                    title: 'Welcome to Xerus AI',
                    type: 'intro',
                    content: 'Welcome to Xerus! I\'m your AI assistant that can help you with various tasks. Let me show you around.',
                    action: 'display_welcome',
                    voiceGuidance: 'Welcome to Glass A.I.! I\'m your intelligent assistant. Let me give you a quick tour of my capabilities.',
                    hints: ['You can always say "help" to get assistance', 'Press Esc to exit any tutorial'],
                    interactiveElements: ['next_button']
                },
                {
                    id: 'transparency',
                    title: 'Window Transparency',
                    type: 'demonstration',
                    content: 'Glass has a unique liquid glass interface. You can adjust my transparency to make me more or less visible.',
                    action: 'demonstrate_transparency',
                    voiceGuidance: 'Try saying "more transparent" or "less transparent" to adjust my opacity.',
                    hints: ['Use voice commands for hands-free control', 'Transparency helps Glass blend with your workflow'],
                    interactiveElements: ['transparency_slider', 'voice_command_prompt'],
                    expectedVoiceCommands: ['more transparent', 'less transparent', 'adjust transparency'],
                    validation: {
                        type: 'voice_command_used',
                        commands: ['increase_transparency', 'decrease_transparency']
                    }
                },
                {
                    id: 'screen_capture',
                    title: 'Screen Capture',
                    type: 'hands_on',
                    content: 'I can capture your screen to help understand what you\'re working on. Let\'s try taking a screenshot.',
                    action: 'guide_screenshot',
                    voiceGuidance: 'Say "take screenshot" to capture your screen, or click the camera icon.',
                    hints: ['Screenshots help me provide better context-aware assistance'],
                    interactiveElements: ['screenshot_button', 'voice_command_prompt'],
                    expectedVoiceCommands: ['take screenshot', 'capture screen'],
                    validation: {
                        type: 'action_completed',
                        action: 'screenshot_taken'
                    }
                },
                {
                    id: 'ai_conversation',
                    title: 'AI Conversation',
                    type: 'hands_on',
                    content: 'Now let\'s have a conversation! Ask me anything - I can help with questions, web searches, calculations, and more.',
                    action: 'guide_conversation',
                    voiceGuidance: 'Try asking me "What\'s the weather like?" or "Help me write an email".',
                    hints: ['I can search the web, perform calculations, and access system information', 'Voice commands work alongside text input'],
                    interactiveElements: ['chat_input', 'voice_command_prompt'],
                    expectedVoiceCommands: ['ask *', 'help with *', 'search for *'],
                    validation: {
                        type: 'ai_response_received',
                        minLength: 10
                    }
                },
                {
                    id: 'completion',
                    title: 'Tutorial Complete!',
                    type: 'completion',
                    content: 'Congratulations! You\'ve learned the basics of Xerus AI. You\'re ready to start using me as your intelligent assistant.',
                    action: 'show_completion',
                    voiceGuidance: 'Great job! You\'ve completed the basic tutorial. I\'m here whenever you need assistance.',
                    hints: ['Say "help" anytime for guidance', 'Explore advanced features in the settings'],
                    interactiveElements: ['completion_celebration', 'next_tutorial_suggestions']
                }
            ]
        });

        // Voice Commands Tutorial
        this.registerTutorial({
            id: 'voice_commands',
            title: 'Voice Commands Mastery',
            description: 'Master hands-free control with voice commands',
            difficulty: 'beginner',
            estimatedTime: '7 minutes',
            prerequisites: ['glass_basics'],
            steps: [
                {
                    id: 'voice_intro',
                    title: 'Voice Commands Introduction',
                    type: 'intro',
                    content: 'Voice commands let you control Glass hands-free. I recognize over 15 different commands!',
                    action: 'display_voice_intro',
                    voiceGuidance: 'I can understand natural language commands. Let me teach you my favorite voice commands.',
                    hints: ['Speak clearly and naturally', 'Commands work even when typing'],
                    interactiveElements: ['voice_command_list']
                },
                {
                    id: 'window_control',
                    title: 'Window Management',
                    type: 'hands_on',
                    content: 'Control my window with your voice. Try "show settings", "hide window", or "minimize".',
                    action: 'guide_window_commands',
                    voiceGuidance: 'Try saying "show settings" to open my settings panel.',
                    hints: ['Window commands help manage Glass during your workflow'],
                    interactiveElements: ['voice_command_prompt'],
                    expectedVoiceCommands: ['show settings', 'hide window', 'minimize'],
                    validation: {
                        type: 'voice_command_used',
                        commands: ['show_settings', 'hide_window']
                    }
                },
                {
                    id: 'ai_voice_commands',
                    title: 'AI Voice Queries',
                    type: 'hands_on',
                    content: 'Ask me questions using voice! Try "ask what time is it" or "search for Python tutorials".',
                    action: 'guide_ai_voice',
                    voiceGuidance: 'Try asking me "What time is it?" or "Search for anything you\'re curious about".',
                    hints: ['Voice queries can include web searches and calculations', 'I remember context from our conversation'],
                    interactiveElements: ['voice_command_prompt'],
                    expectedVoiceCommands: ['ask *', 'search for *', 'what time is it'],
                    validation: {
                        type: 'voice_command_used',
                        commands: ['ask_question', 'search_web', 'get_time']
                    }
                },
                {
                    id: 'advanced_voice',
                    title: 'Advanced Voice Features',
                    type: 'demonstration',
                    content: 'I can also handle system commands like "system information" and UI controls like transparency adjustment.',
                    action: 'demonstrate_advanced_voice',
                    voiceGuidance: 'Try saying "system information" to see your computer details, or "more transparent" to adjust my appearance.',
                    hints: ['System commands provide useful computer information', 'UI commands help optimize Glass for your workflow'],
                    interactiveElements: ['voice_command_prompt'],
                    expectedVoiceCommands: ['system information', 'more transparent', 'less transparent'],
                    validation: {
                        type: 'voice_command_used',
                        commands: ['system_info', 'increase_transparency', 'decrease_transparency']
                    }
                }
            ]
        });

        // Advanced Features Tutorial
        this.registerTutorial({
            id: 'advanced_features',
            title: 'Advanced Glass Features',
            description: 'Explore powerful features like area selection, tools, and automation',
            difficulty: 'intermediate',
            estimatedTime: '10 minutes',
            prerequisites: ['glass_basics', 'voice_commands'],
            steps: [
                {
                    id: 'area_selection',
                    title: 'Area Selection',
                    type: 'hands_on',
                    content: 'I can capture specific areas of your screen for focused assistance. Let\'s try area selection.',
                    action: 'guide_area_selection',
                    voiceGuidance: 'Say "select area" to start area selection, then drag to select a specific region.',
                    hints: ['Area selection helps focus on specific content', 'Selected areas provide better context for assistance'],
                    interactiveElements: ['area_selection_demo'],
                    expectedVoiceCommands: ['select area', 'capture area'],
                    validation: {
                        type: 'action_completed',
                        action: 'area_selected'
                    }
                },
                {
                    id: 'web_search_tool',
                    title: 'Web Search Tool',
                    type: 'hands_on',
                    content: 'I can search the web for current information. Try asking me to search for something specific.',
                    action: 'guide_web_search',
                    voiceGuidance: 'Ask me to "search for the latest news about artificial intelligence" or any topic you\'re interested in.',
                    hints: ['Web search provides current, real-time information', 'Search results include summaries and sources'],
                    interactiveElements: ['search_demo'],
                    expectedVoiceCommands: ['search for *'],
                    validation: {
                        type: 'tool_used',
                        tool: 'web_search'
                    }
                },
                {
                    id: 'calculator_tool',
                    title: 'Calculator and Tools',
                    type: 'hands_on',
                    content: 'I have built-in tools for calculations, system information, and more. Let\'s try some calculations.',
                    action: 'guide_calculator',
                    voiceGuidance: 'Ask me to calculate something like "What\'s 15% of 250?" or "Convert 100 fahrenheit to celsius".',
                    hints: ['I can handle complex mathematical expressions', 'Tools work through natural language requests'],
                    interactiveElements: ['calculator_demo'],
                    expectedQueries: ['calculate *', 'what is *', 'convert *'],
                    validation: {
                        type: 'tool_used',
                        tool: 'calculate'
                    }
                }
            ]
        });

        // Productivity Workflow Tutorial
        this.registerTutorial({
            id: 'productivity_workflow',
            title: 'Productivity Workflow',
            description: 'Learn how to integrate Glass into your daily workflow',
            difficulty: 'intermediate',
            estimatedTime: '12 minutes',
            prerequisites: ['glass_basics', 'voice_commands'],
            steps: [
                {
                    id: 'workflow_intro',
                    title: 'Glass in Your Workflow',
                    type: 'intro',
                    content: 'Glass is designed to enhance your productivity without interrupting your flow. Let me show you how.',
                    action: 'display_workflow_intro',
                    voiceGuidance: 'I can help with research, writing, coding, and any task that benefits from AI assistance.',
                    hints: ['Glass works alongside your existing tools', 'Voice commands keep your hands on the keyboard'],
                    interactiveElements: ['workflow_overview']
                },
                {
                    id: 'research_assistant',
                    title: 'Research Assistant',
                    type: 'demonstration',
                    content: 'Need to research a topic? I can search multiple sources and summarize information for you.',
                    action: 'demonstrate_research',
                    voiceGuidance: 'Try asking me to research a topic you\'re working on. I\'ll search and provide a comprehensive summary.',
                    hints: ['I can search web sources and provide citations', 'Research results are formatted for easy reading'],
                    interactiveElements: ['research_demo'],
                    expectedQueries: ['research *', 'find information about *', 'search for *'],
                    validation: {
                        type: 'research_completed',
                        minSources: 2
                    }
                },
                {
                    id: 'writing_assistant',
                    title: 'Writing Assistant',
                    type: 'hands_on',
                    content: 'I can help with writing tasks - emails, documents, code comments, and more.',
                    action: 'guide_writing_assistance',
                    voiceGuidance: 'Ask me to help write something, like "Help me write a professional email" or "Suggest improvements for this text".',
                    hints: ['I can write, edit, and improve text', 'Provide context for better assistance'],
                    interactiveElements: ['writing_demo'],
                    expectedQueries: ['help me write *', 'improve this text', 'write a *'],
                    validation: {
                        type: 'writing_assistance_used',
                        minWords: 20
                    }
                },
                {
                    id: 'context_awareness',
                    title: 'Context Awareness',
                    type: 'demonstration',
                    content: 'I remember our conversation and can reference screenshots to provide contextual help.',
                    action: 'demonstrate_context',
                    voiceGuidance: 'I maintain context throughout our conversation and can reference visual information from screenshots.',
                    hints: ['Context helps me provide more relevant assistance', 'Screenshots give me visual understanding'],
                    interactiveElements: ['context_demo'],
                    validation: {
                        type: 'context_demonstrated'
                    }
                }
            ]
        });

        logger.info('Initialized  tutorials');
    }

    /**
     * Register a new tutorial
     */
    registerTutorial(tutorialConfig) {
        const tutorial = {
            ...tutorialConfig,
            id: tutorialConfig.id,
            dateCreated: new Date().toISOString(),
            version: '1.0.0',
            analytics: {
                startCount: 0,
                completionCount: 0,
                averageTime: 0,
                commonDropoffPoints: []
            }
        };

        this.tutorials.set(tutorial.id, tutorial);
        logger.info('Registered tutorial:');
    }

    /**
     * Start a tutorial session
     */
    async startTutorial(tutorialId, options = {}) {
        const tutorial = this.tutorials.get(tutorialId);
        if (!tutorial) {
            throw new Error(`Tutorial not found: ${tutorialId}`);
        }

        // Check prerequisites
        if (tutorial.prerequisites.length > 0) {
            const unmetPrereqs = tutorial.prerequisites.filter(prereq => 
                !this.state.completedTutorials.has(prereq)
            );
            
            if (unmetPrereqs.length > 0 && !options.skipPrerequisites) {
                throw new Error(`Missing prerequisites: ${unmetPrereqs.join(', ')}`);
            }
        }

        try {
            logger.info('Starting tutorial:');
            
            // Update state
            this.state.isActive = true;
            this.state.currentTutorial = tutorial;
            this.state.currentStep = 0;
            
            // Initialize progress tracking
            this.state.userProgress.set(tutorialId, {
                startTime: Date.now(),
                stepsCompleted: [],
                hintsUsed: [],
                voiceCommandsUsed: [],
                currentStepStartTime: Date.now()
            });

            // Update analytics
            tutorial.analytics.startCount++;

            // Emit start event
            this.emit('tutorialStarted', {
                tutorial,
                step: tutorial.steps[0],
                progress: this.getTutorialProgress(tutorialId)
            });

            // Begin first step
            await this.executeStep(tutorial.steps[0]);

            return true;
        } catch (error) {
            logger.error('Failed to start tutorial:', { error });
            this.state.isActive = false;
            this.state.currentTutorial = null;
            throw error;
        }
    }

    /**
     * Execute a tutorial step
     */
    async executeStep(step) {
        logger.info('Executing step:');
        
        try {
            // Update progress
            const progress = this.state.userProgress.get(this.state.currentTutorial.id);
            progress.currentStepStartTime = Date.now();

            // Emit step start event
            this.emit('stepStarted', {
                tutorial: this.state.currentTutorial,
                step,
                stepIndex: this.state.currentStep,
                progress: this.getTutorialProgress(this.state.currentTutorial.id)
            });

            // Execute step action
            await this.executeStepAction(step);

            // Provide voice guidance if enabled
            if (this.config.enableVoiceGuidance && step.voiceGuidance) {
                this.provideVoiceGuidance(step.voiceGuidance);
            }

            // Set up validation if required
            if (step.validation) {
                this.setupStepValidation(step);
            } else {
                // Auto-advance for demo steps
                if (step.type === 'intro' || step.type === 'demonstration') {
                    setTimeout(() => {
                        this.advanceToNextStep();
                    }, this.config.autoAdvanceTimeout);
                }
            }

        } catch (error) {
            logger.error('Error executing step:', { error });
            this.emit('stepError', {
                tutorial: this.state.currentTutorial,
                step,
                error: error.message
            });
        }
    }

    /**
     * Execute step-specific actions
     */
    async executeStepAction(step) {
        switch (step.action) {
            case 'display_welcome':
                this.emit('displayWelcome', {
                    title: step.title,
                    content: step.content,
                    hints: step.hints
                });
                break;

            case 'demonstrate_transparency':
                this.emit('demonstrateTransparency', {
                    title: step.title,
                    content: step.content,
                    expectedCommands: step.expectedVoiceCommands
                });
                break;

            case 'guide_screenshot':
                this.emit('guideScreenshot', {
                    title: step.title,
                    content: step.content,
                    showButton: true,
                    enableVoiceCommands: true
                });
                break;

            case 'guide_conversation':
                this.emit('guideConversation', {
                    title: step.title,
                    content: step.content,
                    suggestedQueries: [
                        'What\'s the weather like today?',
                        'Help me write an email',
                        'What can you help me with?'
                    ]
                });
                break;

            case 'show_completion':
                this.emit('showCompletion', {
                    title: step.title,
                    content: step.content,
                    nextTutorials: this.getRecommendedTutorials()
                });
                break;

            case 'guide_area_selection':
                this.emit('guideAreaSelection', {
                    title: step.title,
                    content: step.content,
                    enableAreaSelection: true
                });
                break;

            case 'guide_web_search':
                this.emit('guideWebSearch', {
                    title: step.title,
                    content: step.content,
                    suggestedSearches: [
                        'latest AI news',
                        'weather forecast',
                        'JavaScript tutorials'
                    ]
                });
                break;

            case 'demonstrate_research':
                this.emit('demonstrateResearch', {
                    title: step.title,
                    content: step.content,
                    showResearchDemo: true
                });
                break;

            default:
                logger.warn(`Unknown step action: ${step.action}'`);
        }
    }

    /**
     * Set up validation for interactive steps
     */
    setupStepValidation(step) {
        const validation = step.validation;
        
        switch (validation.type) {
            case 'voice_command_used':
                this.setupVoiceCommandValidation(validation.commands);
                break;
                
            case 'action_completed':
                this.setupActionValidation(validation.action);
                break;
                
            case 'ai_response_received':
                this.setupAIResponseValidation(validation.minLength);
                break;
                
            case 'tool_used':
                this.setupToolValidation(validation.tool);
                break;
                
            default:
                logger.warn(`Unknown validation type: ${validation.type}'`);
        }
    }

    /**
     * Set up voice command validation
     */
    setupVoiceCommandValidation(expectedCommands) {
        const validationHandler = (commandData) => {
            if (expectedCommands.includes(commandData.name)) {
                logger.info('Voice command validated:');
                this.completeStep();
                // Voice command processor has been removed
            }
        };

        // Voice command processor has been removed - skipping validation
    }

    /**
     * Set up action validation
     */
    setupActionValidation(expectedAction) {
        const validationHandler = (actionData) => {
            if (actionData.action === expectedAction) {
                logger.info('Action validated:');
                this.completeStep();
                this.off(expectedAction, validationHandler);
            }
        };

        this.on(expectedAction, validationHandler);
    }

    /**
     * Set up AI response validation
     */
    setupAIResponseValidation(minLength) {
        const validationHandler = (responseData) => {
            if (responseData.content && responseData.content.length >= minLength) {
                logger.info('AI response validated');
                this.completeStep();
                this.off('aiResponseReceived', validationHandler);
            }
        };

        this.on('aiResponseReceived', validationHandler);
    }

    /**
     * Set up tool validation
     */
    setupToolValidation(expectedTool) {
        const validationHandler = (toolData) => {
            if (toolData.name === expectedTool && toolData.success) {
                logger.info('Tool validated:');
                this.completeStep();
                toolManager.off('toolExecuted', validationHandler);
            }
        };

        // Assuming toolManager emits toolExecuted events
        toolManager.on?.('toolExecuted', validationHandler);
    }

    /**
     * Complete current step and advance
     */
    completeStep() {
        if (!this.state.isActive || !this.state.currentTutorial) {
            return;
        }

        const tutorial = this.state.currentTutorial;
        const step = tutorial.steps[this.state.currentStep];
        
        // Update progress
        const progress = this.state.userProgress.get(tutorial.id);
        const stepDuration = Date.now() - progress.currentStepStartTime;
        
        progress.stepsCompleted.push({
            stepId: step.id,
            completedAt: Date.now(),
            duration: stepDuration
        });

        logger.info('Step completed:  (ms)');

        // Emit step completion
        this.emit('stepCompleted', {
            tutorial,
            step,
            stepIndex: this.state.currentStep,
            duration: stepDuration,
            progress: this.getTutorialProgress(tutorial.id)
        });

        // Advance to next step
        this.advanceToNextStep();
    }

    /**
     * Advance to the next tutorial step
     */
    advanceToNextStep() {
        if (!this.state.isActive || !this.state.currentTutorial) {
            return;
        }

        const tutorial = this.state.currentTutorial;
        
        if (this.state.currentStep < tutorial.steps.length - 1) {
            // Move to next step
            this.state.currentStep++;
            const nextStep = tutorial.steps[this.state.currentStep];
            
            logger.info('Advancing to step:');
            this.executeStep(nextStep);
        } else {
            // Tutorial completed
            this.completeTutorial();
        }
    }

    /**
     * Complete the current tutorial
     */
    completeTutorial() {
        if (!this.state.isActive || !this.state.currentTutorial) {
            return;
        }

        const tutorial = this.state.currentTutorial;
        const progress = this.state.userProgress.get(tutorial.id);
        
        // Calculate completion metrics
        const totalDuration = Date.now() - progress.startTime;
        
        // Update tutorial analytics
        tutorial.analytics.completionCount++;
        tutorial.analytics.averageTime = (
            (tutorial.analytics.averageTime * (tutorial.analytics.completionCount - 1) + totalDuration) /
            tutorial.analytics.completionCount
        );

        // Mark as completed
        this.state.completedTutorials.add(tutorial.id);
        progress.completedAt = Date.now();
        progress.totalDuration = totalDuration;

        logger.info('Tutorial completed:  (ms)');

        // Emit completion event
        this.emit('tutorialCompleted', {
            tutorial,
            progress: this.getTutorialProgress(tutorial.id),
            totalDuration,
            recommendedNext: this.getRecommendedTutorials()
        });

        // Reset state
        this.state.isActive = false;
        this.state.currentTutorial = null;
        this.state.currentStep = 0;
    }

    /**
     * Provide voice guidance
     */
    provideVoiceGuidance(text) {
        if (!this.config.enableVoiceGuidance) {
            return;
        }

        this.emit('voiceGuidance', {
            text,
            timestamp: Date.now()
        });
    }

    /**
     * Get tutorial progress
     */
    getTutorialProgress(tutorialId) {
        const tutorial = this.tutorials.get(tutorialId);
        const progress = this.state.userProgress.get(tutorialId);
        
        if (!tutorial || !progress) {
            return null;
        }

        return {
            tutorialId,
            title: tutorial.title,
            currentStep: this.state.currentStep,
            totalSteps: tutorial.steps.length,
            completedSteps: progress.stepsCompleted.length,
            progressPercentage: Math.round((progress.stepsCompleted.length / tutorial.steps.length) * 100),
            startTime: progress.startTime,
            estimatedTimeRemaining: this.estimateTimeRemaining(tutorial, progress)
        };
    }

    /**
     * Estimate time remaining for tutorial
     */
    estimateTimeRemaining(tutorial, progress) {
        const remainingSteps = tutorial.steps.length - progress.stepsCompleted.length;
        const averageStepTime = progress.stepsCompleted.length > 0
            ? progress.stepsCompleted.reduce((sum, step) => sum + step.duration, 0) / progress.stepsCompleted.length
            : 60000; // Default 1 minute per step

        return remainingSteps * averageStepTime;
    }

    /**
     * Get recommended tutorials based on completed ones
     */
    getRecommendedTutorials() {
        const completed = this.state.completedTutorials;
        const available = Array.from(this.tutorials.values());
        
        return available.filter(tutorial => {
            // Not already completed
            if (completed.has(tutorial.id)) {
                return false;
            }
            
            // Prerequisites met
            const prereqsMet = tutorial.prerequisites.every(prereq => completed.has(prereq));
            
            return prereqsMet;
        }).sort((a, b) => {
            // Sort by difficulty and relevance
            const difficultyOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
            return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
        });
    }

    /**
     * Skip current tutorial
     */
    skipTutorial() {
        if (!this.state.isActive) {
            return false;
        }

        logger.info('Skipping tutorial:');
        
        this.emit('tutorialSkipped', {
            tutorial: this.state.currentTutorial,
            stepIndex: this.state.currentStep,
            progress: this.getTutorialProgress(this.state.currentTutorial.id)
        });

        // Reset state
        this.state.isActive = false;
        this.state.currentTutorial = null;
        this.state.currentStep = 0;

        return true;
    }

    /**
     * Pause current tutorial
     */
    pauseTutorial() {
        if (!this.state.isActive) {
            return false;
        }

        logger.info('Pausing tutorial:');
        
        this.emit('tutorialPaused', {
            tutorial: this.state.currentTutorial,
            stepIndex: this.state.currentStep,
            progress: this.getTutorialProgress(this.state.currentTutorial.id)
        });

        return true;
    }

    /**
     * Resume paused tutorial
     */
    resumeTutorial() {
        if (!this.state.isActive || !this.state.currentTutorial) {
            return false;
        }

        logger.info('Resuming tutorial:');
        
        this.emit('tutorialResumed', {
            tutorial: this.state.currentTutorial,
            stepIndex: this.state.currentStep,
            progress: this.getTutorialProgress(this.state.currentTutorial.id)
        });

        return true;
    }

    /**
     * Get all available tutorials
     */
    getAvailableTutorials() {
        return Array.from(this.tutorials.values()).map(tutorial => ({
            id: tutorial.id,
            title: tutorial.title,
            description: tutorial.description,
            difficulty: tutorial.difficulty,
            estimatedTime: tutorial.estimatedTime,
            prerequisites: tutorial.prerequisites,
            completed: this.state.completedTutorials.has(tutorial.id),
            analytics: tutorial.analytics
        }));
    }

    /**
     * Get tutorial analytics
     */
    getTutorialAnalytics() {
        const tutorials = Array.from(this.tutorials.values());
        const totalStarts = tutorials.reduce((sum, t) => sum + t.analytics.startCount, 0);
        const totalCompletions = tutorials.reduce((sum, t) => sum + t.analytics.completionCount, 0);
        
        return {
            totalTutorials: tutorials.length,
            totalStarts,
            totalCompletions,
            completionRate: totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0,
            averageCompletionTime: tutorials.reduce((sum, t) => sum + t.analytics.averageTime, 0) / tutorials.length,
            userProgress: {
                completedTutorials: this.state.completedTutorials.size,
                totalTutorials: tutorials.length,
                completionPercentage: (this.state.completedTutorials.size / tutorials.length) * 100
            }
        };
    }

    /**
     * Update user preferences
     */
    updateUserPreferences(preferences) {
        this.state.userPreferences = { ...this.state.userPreferences, ...preferences };
        
        this.emit('userPreferencesUpdated', {
            preferences: this.state.userPreferences
        });
        
        logger.info('[DemoTutorialAgent] User preferences updated');
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        this.emit('configUpdated', {
            config: this.config
        });
        
        logger.info('[DemoTutorialAgent] Configuration updated');
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isActive: this.state.isActive,
            currentTutorial: this.state.currentTutorial?.id || null,
            currentStep: this.state.currentStep,
            completedTutorials: Array.from(this.state.completedTutorials),
            userPreferences: this.state.userPreferences,
            progress: this.state.currentTutorial 
                ? this.getTutorialProgress(this.state.currentTutorial.id)
                : null
        };
    }

    /**
     * Shutdown the tutorial agent
     */
    async shutdown() {
        logger.info('[DemoTutorialAgent] Shutting down tutorial agent...');
        
        if (this.state.isActive) {
            this.skipTutorial();
        }
        
        this.removeAllListeners();
        
        logger.info('[DemoTutorialAgent] Tutorial agent shutdown completed');
    }
}

// Export singleton instance
const demoTutorialAgent = new DemoTutorialAgent();

module.exports = {
    demoTutorialAgent,
    DemoTutorialAgent
};