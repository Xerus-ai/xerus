const { BrowserWindow } = require('electron');
// Use simple prompt builder instead of domain prompt manager
const { getSystemPrompt } = require('../../../common/prompts/promptBuilder.js');
const { createLLM } = require('../../../common/ai/factory');
const sessionRepository = require('../../../common/repositories/session');
const summaryRepository = require('./repositories');
const modelStateService = require('../../../common/services/modelStateService');
const { createLogger } = require('../../../common/services/logger.js');

const logger = createLogger('SummaryService');
// const { getStoredApiKey, getStoredProvider, getCurrentModelInfo } = require('../../../window/windowManager.js');

class SummaryService {
    constructor() {
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        this.conversationHistory = [];
        this.currentSessionId = null;
        
        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
    }

    setCallbacks({ onAnalysisComplete, onStatusUpdate }) {
        this.onAnalysisComplete = onAnalysisComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    addConversationTurn(speaker, text) {
        const conversationText = `${speaker.toLowerCase()}: ${text.trim()}`;
        this.conversationHistory.push(conversationText);
        logger.info(`[CHAT] Added conversation text: ${conversationText}`);
        logger.info(`📈 Total conversation history: ${this.conversationHistory.length} texts`);

        // Debug: show the actual conversation history
        console.log('DEBUG conversation history:', this.conversationHistory.map((text, i) => `${i+1}: ${text.substring(0, 50)}...`));

        // Trigger analysis if needed
        this.triggerAnalysisIfNeeded();
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    resetConversationHistory() {
        this.conversationHistory = [];
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        logger.info('[LOADING] Conversation history and analysis state reset');
    }

    /**
     * Converts conversation history into text to include in the prompt.
     * @param {Array<string>} conversationTexts - Array of conversation texts ["me: ~~~", "them: ~~~", ...]
     * @param {number} maxTurns - Maximum number of recent turns to include
     * @returns {string} - Formatted conversation string for the prompt
     */
    formatConversationForPrompt(conversationTexts, maxTurns = 30) {
        if (conversationTexts.length === 0) return '';
        return conversationTexts.slice(-maxTurns).join('\n');
    }

    async makeOutlineAndRequests(conversationTexts, maxTurns = 30) {
        logger.info(`[SEARCH] makeOutlineAndRequests called - conversationTexts: ${conversationTexts.length}`);

        if (conversationTexts.length === 0) {
            logger.info('[WARNING] No conversation texts available for analysis');
            return null;
        }

        const recentConversation = this.formatConversationForPrompt(conversationTexts, maxTurns);

        // [Korean comment translated] [Korean comment translated] Result[Korean comment translated] [Korean comment translated] [Korean comment translated]
        let contextualPrompt = '';
        if (this.previousAnalysisResult) {
            contextualPrompt = `
Previous Analysis Context:
- Main Topic: ${this.previousAnalysisResult.topic.header}
- Key Points: ${this.previousAnalysisResult.summary.slice(0, 3).join(', ')}
- Last Actions: ${this.previousAnalysisResult.actions.slice(0, 2).join(', ')}

Please build upon this context while analyzing the new conversation segments.
`;
        }

        const systemPrompt = getSystemPrompt('xerus_analysis', contextualPrompt, false)
            .replace('{{CONVERSATION_HISTORY}}', recentConversation);

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            const modelInfo = modelStateService.getCurrentModelInfo('llm');
            console.log('DEBUG LLM modelInfo:', { 
                hasModelInfo: !!modelInfo, 
                provider: modelInfo?.provider, 
                model: modelInfo?.model, 
                hasApiKey: !!modelInfo?.apiKey 
            });
            
            if (!modelInfo || !modelInfo.apiKey) {
                console.log('ERROR: LLM analysis failing - no model or API key');
                throw new Error('AI model or API key is not configured.');
            }
            logger.info(`[AI] Sending analysis request to ${modelInfo.provider} using model ${modelInfo.model}`);
            
            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: `${contextualPrompt}

Analyze the conversation and provide a structured summary. Format your response as follows:

**Summary Overview**
- Main discussion point with context

**Key Topic: [Topic Name]**
- First key insight
- Second key insight
- Third key insight

**Extended Explanation**
Provide 2-3 sentences explaining the context and implications.

**Suggested Questions**
1. First follow-up question?
2. Second follow-up question?
3. Third follow-up question?

Keep all points concise and build upon previous analysis if provided.`,
                },
            ];

            logger.info('[AI] Sending analysis request to AI...');

            const llm = createLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 1024,
                usePortkey: false,
                portkeyVirtualKey: undefined,
            });

            const completion = await llm.chat(messages);

            const responseText = completion.content;
            logger.info(`[OK] Analysis response received: ${responseText}`);
            const structuredData = this.parseResponseText(responseText, this.previousAnalysisResult);

            if (this.currentSessionId) {
                try {
                    summaryRepository.saveSummary({
                        sessionId: this.currentSessionId,
                        text: responseText,
                        tldr: structuredData.summary.join('\n'),
                        bullet_json: JSON.stringify(structuredData.topic.bullets),
                        action_json: JSON.stringify(structuredData.actions),
                        model: modelInfo.model
                    });
                } catch (err) {
                    logger.error('Failed to save summary:', { err });
                }
            }

            // [Korean comment translated] Result Save
            this.previousAnalysisResult = structuredData;
            this.analysisHistory.push({
                timestamp: Date.now(),
                data: structuredData,
                conversationLength: conversationTexts.length,
            });

            if (this.analysisHistory.length > 10) {
                this.analysisHistory.shift();
            }

            return structuredData;
        } catch (error) {
            logger.error('[ERROR] Error during analysis generation:', { message: error.message });
            return this.previousAnalysisResult; // [Korean comment translated] [Korean comment translated] [Korean comment translated] Result [Korean comment translated]
        }
    }

    parseResponseText(responseText, previousResult) {
        const structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: ['✉️ Draft a follow-up email', '[OK] Generate action items', '[TEXT] Show summary'],
        };

        // [Korean comment translated] Result[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
        if (previousResult) {
            structuredData.topic.header = previousResult.topic.header;
            structuredData.summary = [...previousResult.summary];
        }

        try {
            const lines = responseText.split('\n');
            let currentSection = '';
            let isCapturingTopic = false;
            let topicName = '';

            for (const line of lines) {
                const trimmedLine = line.trim();

                // [Korean comment translated] [Korean comment translated] [Korean comment translated]
                if (trimmedLine.startsWith('**Summary Overview**')) {
                    currentSection = 'summary-overview';
                    continue;
                } else if (trimmedLine.startsWith('**Key Topic:')) {
                    currentSection = 'topic';
                    isCapturingTopic = true;
                    topicName = trimmedLine.match(/\*\*Key Topic: (.+?)\*\*/)?.[1] || '';
                    if (topicName) {
                        structuredData.topic.header = topicName + ':';
                    }
                    continue;
                } else if (trimmedLine.startsWith('**Extended Explanation**')) {
                    currentSection = 'explanation';
                    continue;
                } else if (trimmedLine.startsWith('**Suggested Questions**')) {
                    currentSection = 'questions';
                    continue;
                }

                // [Korean comment translated] [Korean comment translated]
                if (trimmedLine.startsWith('-') && currentSection === 'summary-overview') {
                    const summaryPoint = trimmedLine.substring(1).trim();
                    if (summaryPoint && !structuredData.summary.includes(summaryPoint)) {
                        // [Korean comment translated] summary Update ([Korean comment translated] 5[Korean comment translated] [Korean comment translated])
                        structuredData.summary.unshift(summaryPoint);
                        if (structuredData.summary.length > 5) {
                            structuredData.summary.pop();
                        }
                    }
                } else if (trimmedLine.startsWith('-') && currentSection === 'topic') {
                    const bullet = trimmedLine.substring(1).trim();
                    if (bullet && structuredData.topic.bullets.length < 3) {
                        structuredData.topic.bullets.push(bullet);
                    }
                } else if (currentSection === 'explanation' && trimmedLine) {
                    // explanation[Korean comment translated] topic bullets[Korean comment translated] [Korean comment translated] ([Korean comment translated] [Korean comment translated])
                    const sentences = trimmedLine
                        .split(/\.\s+/)
                        .filter(s => s.trim().length > 0)
                        .map(s => s.trim() + (s.endsWith('.') ? '' : '.'));

                    sentences.forEach(sentence => {
                        if (structuredData.topic.bullets.length < 3 && !structuredData.topic.bullets.includes(sentence)) {
                            structuredData.topic.bullets.push(sentence);
                        }
                    });
                } else if (trimmedLine.match(/^\d+\./) && currentSection === 'questions') {
                    const question = trimmedLine.replace(/^\d+\.\s*/, '').trim();
                    if (question && question.includes('?')) {
                        structuredData.actions.push(`❓ ${question}`);
                    }
                }
            }

            // [Korean comment translated] [Korean comment translated] [Korean comment translated]
            const defaultActions = ['✨ What should I say next?', '[CHAT] Suggest follow-up questions'];
            defaultActions.forEach(action => {
                if (!structuredData.actions.includes(action)) {
                    structuredData.actions.push(action);
                }
            });

            // [Korean comment translated] [Korean comment translated] [Korean comment translated]
            structuredData.actions = structuredData.actions.slice(0, 5);

            // [Korean comment translated] Validation [Korean comment translated] [Korean comment translated] Data [Korean comment translated]
            if (structuredData.summary.length === 0 && previousResult) {
                structuredData.summary = previousResult.summary;
            }
            if (structuredData.topic.bullets.length === 0 && previousResult) {
                structuredData.topic.bullets = previousResult.topic.bullets;
            }
        } catch (error) {
            logger.error('Error occurred:', { error });
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] Result [Korean comment translated]
            return (
                previousResult || {
                    summary: [],
                    topic: { header: 'Analysis in progress', bullets: [] },
                    actions: ['✨ What should I say next?', '[CHAT] Suggest follow-up questions'],
                    followUps: ['✉️ Draft a follow-up email', '[OK] Generate action items', '[TEXT] Show summary'],
                }
            );
        }

        logger.info('[DATA] Final structured data:', JSON.stringify(structuredData, null, 2));
        return structuredData;
    }

    /**
     * Triggers analysis more frequently for better live insights experience.
     * Now triggers at 3, 6, 10, 15, 20, etc. turns for more responsive insights.
     */
    async triggerAnalysisIfNeeded() {
        const length = this.conversationHistory.length;
        
        // Trigger analysis at strategic intervals for responsive insights
        const shouldTrigger = 
            length === 5 ||  // First insights after 5 turns
            length === 10 ||  // Second update
            (length >= 15 && length % 5 === 0);  // Then every 5 turns
        
        if (shouldTrigger) {
            logger.info(`Triggering analysis - ${length} conversation texts accumulated`);

            const data = await this.makeOutlineAndRequests(this.conversationHistory);
            
            if (data) {
                logger.info('Sending structured data to renderer');
                console.log('DEBUG sending summary-update to renderer:', JSON.stringify(data, null, 2));
                this.sendToRenderer('summary-update', data);
                
                // Notify callback
                if (this.onAnalysisComplete) {
                    this.onAnalysisComplete(data);
                }
            } else {
                logger.info('No analysis data returned');
            }
        }
    }

    getCurrentAnalysisData() {
        return {
            previousResult: this.previousAnalysisResult,
            history: this.analysisHistory,
            conversationLength: this.conversationHistory.length,
        };
    }

    /**
     * Debug method to manually trigger analysis for testing
     */
    async forceAnalysis() {
        logger.info(`[TOOL] Force triggering analysis - ${this.conversationHistory.length} conversation texts`);
        
        if (this.conversationHistory.length === 0) {
            logger.warn('No conversation history available for analysis');
            return null;
        }

        const data = await this.makeOutlineAndRequests(this.conversationHistory);
        if (data) {
            logger.info('[OK] Force analysis completed, sending to renderer');
            this.sendToRenderer('summary-update', data);
            
            // Notify callback
            if (this.onAnalysisComplete) {
                this.onAnalysisComplete(data);
            }
            return data;
        } else {
            logger.warn('[ERROR] Force analysis returned no data');
            return null;
        }
    }
}

module.exports = SummaryService; 