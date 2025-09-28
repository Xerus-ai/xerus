/**
 * AI Provider Service - Backend AI Integration
 * Connects agents to AI providers (OpenAI, Claude, Gemini, etc.)
 */

const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [AIProvider]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'backend.log' })
  ]
});

class AIProviderService {
  constructor() {
    this.providers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize AI providers based on available API keys
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing AI Provider Service...');

    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        this.providers.set('openai', {
          client: openai,
          models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
        });
        logger.info('OpenAI provider initialized');
      } catch (error) {
        logger.error('Failed to initialize OpenAI:', { error: error.message });
      }
    }

    // Initialize Anthropic (Claude)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        this.providers.set('anthropic', {
          client: anthropic,
          models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
        });
        logger.info('Anthropic provider initialized');
      } catch (error) {
        logger.error('Failed to initialize Anthropic:', { error: error.message });
      }
    }

    // Initialize Google Gemini
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        this.providers.set('gemini', {
          client: genAI,
          models: ['gemini-pro', 'gemini-pro-vision']
        });
        logger.info('Gemini provider initialized');
      } catch (error) {
        logger.error('Failed to initialize Gemini:', { error: error.message });
      }
    }

    this.initialized = true;
    logger.info('AI Provider Service initialized with providers:', Array.from(this.providers.keys()));
  }

  /**
   * Generate AI response based on agent configuration
   * @param {Object} agent - Agent configuration from database
   * @param {string} input - User input
   * @param {Object} context - Additional context (RAG results, tools, etc.)
   * @returns {Promise<Object>} AI response with metadata
   */
  async generateResponse(agent, input, context = {}) {
    await this.initialize();

    const { ai_model, system_prompt, personality_type } = agent;
    const provider = this.getProviderForModel(ai_model);

    if (!provider) {
      throw new Error(`No provider available for model: ${ai_model}`);
    }

    logger.info('Generating response', { 
      agentId: agent.id, 
      model: ai_model,
      personality: personality_type,
      hasRAGContext: !!context.ragResults,
      hasTools: !!context.tools?.length,
      ragResultsCount: context.ragResults?.length || 0,
      toolsCount: context.tools?.length || 0
    });
    
    console.log('[AI] AI Provider received context:', {
      ragResults: context.ragResults?.length || 0,
      tools: context.tools?.length || 0,
      systemPrompt: agent.system_prompt?.substring(0, 100) + '...'
    });

    try {
      // Build the full prompt with system message, RAG context, and tools
      const messages = this.buildMessages(agent, input, context);
      
      // Generate response based on provider
      let response;
      const startTime = Date.now();

      switch (provider.type) {
        case 'openai':
          response = await this.generateOpenAIResponse(provider.client, ai_model, messages, context.tools);
          break;
        case 'anthropic':
          response = await this.generateAnthropicResponse(provider.client, ai_model, messages, context.tools);
          break;
        case 'gemini':
          response = await this.generateGeminiResponse(provider.client, ai_model, messages, context.tools);
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        response: response.content,
        execution_time: executionTime,
        tokens_used: response.tokens || 0,
        model_used: ai_model,
        tools_called: response.toolCalls || [],
        success: true
      };

    } catch (error) {
      logger.error('AI generation failed:', { error: error.message, model: ai_model });
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Build messages array with advanced prompt orchestration
   */
  buildMessages(agent, input, context) {
    // Check if we have advanced multi-modal prompt orchestration
    if (context.promptOrchestration && context.modalityDecision) {
      logger.info('Using Advanced Prompt Orchestration System', {
        modality: context.modalityDecision.primary,
        confidence: Math.round(context.modalityDecision.confidence * 100) + '%',
        tokenCount: context.promptOrchestration.tokenCount,
        sections: Object.keys(context.promptOrchestration.sections).filter(k => context.promptOrchestration.sections[k]).length
      });
      
      return this.buildAdvancedMessages(agent, input, context);
    }

    // Fallback to legacy method if advanced system not available
    logger.info('Using legacy message construction (fallback mode)');
    return this.buildMessagesLegacy(agent, input, context);
  }

  /**
   * ADVANCED MESSAGE BUILDING
   * Uses orchestrated system prompts with proper modality handling
   */
  buildAdvancedMessages(agent, input, context) {
    const messages = [];
    const { modalityDecision, promptOrchestration } = context;

    // 1. USE ORCHESTRATED SYSTEM PROMPT (pre-built and optimized)
    messages.push({ 
      role: 'system', 
      content: promptOrchestration.systemPrompt 
    });

    // 2. BUILD USER MESSAGE WITH PROPER MODALITY HANDLING
    const userMessage = {
      role: 'user',
      content: []
    };

    // CRITICAL FIX: Format input for structured requests (like "explain in 5 steps")
    let formattedInput = input;
    
    // Detect if this is a structured request (numbered steps, bullet points, etc.)
    const isStructuredRequest = /\b(\d+\s+steps?|steps?\s+\d+|bullet\s+points?|list|enumerate|explain|describe|analyze)\b/i.test(input);
    
    if (isStructuredRequest && modalityDecision.useScreenshot) {
      // Add context marker like frontend does for better AI understanding
      formattedInput = `[Analyzing visual content from the screen]\n\n${input}`;
    } else if (isStructuredRequest && modalityDecision.useKnowledge) {
      formattedInput = `[Using knowledge base information]\n\n${input}`;
    } else if (isStructuredRequest && modalityDecision.primary === 'hybrid') {
      formattedInput = `[Analyzing both visual content and knowledge base]\n\n${input}`;
    }
    
    // Add text content with formatted input
    userMessage.content.push({
      type: 'text',
      text: formattedInput
    });

    // ONLY add image if modality decision explicitly requires it
    if (modalityDecision.useScreenshot && 
        context.screenshot && 
        context.screenshot.success && 
        context.screenshot.base64) {
      
      userMessage.content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${context.screenshot.base64}`,
          detail: 'auto'
        }
      });

      logger.info('Image included based on advanced modality decision', {
        modality: modalityDecision.primary,
        confidence: Math.round(modalityDecision.confidence * 100) + '%'
      });
    }

    // Simplify message format if only text
    if (userMessage.content.length === 1) {
      userMessage.content = input;
    }

    messages.push(userMessage);

    logger.info('Advanced messages built', {
      systemPromptTokens: promptOrchestration.tokenCount,
      includesImage: modalityDecision.useScreenshot,
      includesKnowledge: modalityDecision.useKnowledge,
      modality: modalityDecision.primary
    });

    return messages;
  }

  /**
   * Legacy message building with linear concatenation (fallback)
   */
  buildMessagesLegacy(agent, input, context) {
    const messages = [];

    // System message with personality and instructions
    let systemMessage = agent.system_prompt || this.getDefaultSystemPrompt(agent.personality_type);
    
    // INTELLIGENT CONTEXT INTEGRATION
    const contextDecision = context.contextDecision;
    
    if (contextDecision) {
      // Add priority-focused context instructions
      systemMessage += '\n\n## Response Instructions:\n';
      
      if (contextDecision.primary === 'visual') {
        systemMessage += `🎯 **PRIMARY FOCUS: VISUAL CONTENT** - Answer primarily based on what you can see in the provided image.\n`;
        systemMessage += `- Describe what you observe in the image first\n`;
        systemMessage += `- Use visual details to support your explanation\n`;
        systemMessage += `- Reference knowledge base only to enhance visual observations\n`;
      } else if (contextDecision.primary === 'knowledge') {
        systemMessage += `📚 **PRIMARY FOCUS: KNOWLEDGE BASE** - Answer primarily using the provided knowledge base information.\n`;
        systemMessage += `- Base your response on the knowledge base content\n`;
        systemMessage += `- Use visual context only to supplement knowledge base information\n`;
      } else if (contextDecision.primary === 'hybrid') {
        systemMessage += `⚖️ **HYBRID APPROACH** - Combine both visual and knowledge contexts.\n`;
        systemMessage += `- Integrate information from both the image and knowledge base\n`;
        systemMessage += `- Explain how visual content relates to knowledge base information\n`;
      }
      
      systemMessage += `\nContext Selection Reasoning: ${contextDecision.reasoning}\n`;
      
      // Add query-specific guidance
      if (/\b(what.*screen|on.*screen|see.*screen|describe.*screen|explain.*screen)\b/i.test(input)) {
        systemMessage += `\n🖥️ **SCREEN QUERY DETECTED**: This is explicitly asking about screen content. Prioritize visual analysis and describe what you see in detail.\n`;
      } else if (/\b(how.*work|what.*is|explain.*process|documentation|guide)\b/i.test(input)) {
        systemMessage += `\n📋 **KNOWLEDGE QUERY DETECTED**: This appears to be asking for conceptual/procedural information. Prioritize knowledge base content if available.\n`;
      }
    }
    
    // Add Knowledge Base context with weighted importance
    if (context.ragResults && context.ragResults.length > 0) {
      const kbRelevance = contextDecision?.kbRelevance?.score || 0.5;
      const importance = kbRelevance > 0.7 ? 'HIGH' : kbRelevance > 0.4 ? 'MEDIUM' : 'LOW';
      
      systemMessage += '\n\n## Knowledge Base Context:\n';
      systemMessage += `The following information from the knowledge base has been determined to be ${importance} relevance (${Math.round(kbRelevance * 100)}%) for answering this question:\n`;
      
      context.ragResults.forEach((result, index) => {
        // Normalize similarity scores: PostgreSQL text search scores are naturally low (0.01-0.1)
        // but represent good matches. Normalize to 60-95% range for better AI interpretation.
        const normalizedScore = Math.min(95, Math.max(60, result.similarity * 2000));
        systemMessage += `\n### Knowledge Base Entry ${index + 1} (Relevance: ${Math.round(normalizedScore)}%)\n`;
        if (result.title) {
          systemMessage += `**Title:** ${result.title}\n`;
        }
        systemMessage += `**Content:**\n${result.content}\n`;
      });
      
      if (importance === 'HIGH') {
        systemMessage += '\n🔥 **HIGH PRIORITY:** This knowledge base information is highly relevant to the query. Use it as your primary information source and cite specific details from it.';
      } else if (importance === 'MEDIUM') {
        systemMessage += '\n📋 **MODERATE PRIORITY:** This knowledge base information is relevant. Incorporate it into your response where appropriate.';
      } else {
        systemMessage += '\n📝 **LOW PRIORITY:** This knowledge base information has limited relevance. Use it only for background context if needed.';
      }
    }
    
    // ONLY add Screen Analysis context if context intelligence determined it should be used
    if (contextDecision?.useScreenshot && context.screenAnalysis) {
      systemMessage += '\n\n## Visual Context Analysis:\n';
      systemMessage += `Screen content detected and relevant for this query:\n`;
      systemMessage += `- Content Type: ${context.screenAnalysis.contentType}\n`;
      systemMessage += `- Screen Content: ${context.screenAnalysis.text}\n`;
      
      if (context.screenAnalysis.hasLists) {
        systemMessage += `- Contains Lists: Yes\n`;
      }
      if (context.screenAnalysis.hasData) {
        systemMessage += `- Contains Structured Data: Yes\n`;
      }
      
      systemMessage += '\n👁️ **VISUAL ANALYSIS:** Focus on describing and analyzing what you see in the image.';
    }

    // Add tool descriptions if available
    if (context.tools && context.tools.length > 0) {
      systemMessage += '\n\n## Available Tools:\n';
      context.tools.forEach(tool => {
        systemMessage += `\n- **${tool.name}**: ${tool.description}`;
        if (tool.parameters) {
          systemMessage += `\n  Parameters: ${JSON.stringify(tool.parameters)}`;
        }
      });
      systemMessage += '\n\nYou can use these tools by specifying the tool name and parameters in your response.';
    }

    // Build message array
    messages.push({ role: 'system', content: systemMessage });
    
    // User message
    const userMessage = {
      role: 'user',
      content: []
    };
    
    // Add text content
    userMessage.content.push({
      type: 'text',
      text: input
    });
    
    // ONLY add screenshot image if context intelligence explicitly determined it should be used
    if (contextDecision?.useScreenshot && context.screenshot && context.screenshot.success && context.screenshot.base64) {
      userMessage.content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${context.screenshot.base64}`,
          detail: 'auto'
        }
      });
      
      logger.info('Screenshot included in message based on context intelligence decision');
    }
    
    // If only text content, simplify the message format
    if (userMessage.content.length === 1) {
      userMessage.content = input;
    }
    
    messages.push(userMessage);

    return messages;
  }

  /**
   * Generate AI response with Context Assembly Engine integration
   * @param {Object} agent - Agent configuration from database
   * @param {string} input - User input
   * @param {Object} context - Context with Assembly Engine results
   * @param {Object} enhancedContextService - Enhanced Context Intelligence Service
   * @returns {Promise<Object>} AI response with metadata
   */
  async generateResponseWithAssembly(agent, input, context, enhancedContextService = null) {
    await this.initialize();

    const { ai_model, system_prompt, personality_type } = agent;
    const provider = this.getProviderForModel(ai_model);

    if (!provider) {
      throw new Error(`No provider available for model: ${ai_model}`);
    }

    logger.info('[FAST] Generating response with optimized context', { 
      agentId: agent.id, 
      model: ai_model,
      personality: personality_type,
      hasRAGContext: !!context.ragResults,
      hasTools: !!context.tools?.length,
      contextOptimized: !!context.optimized,
      buildTime: context.buildTime + 'ms'
    });

    try {
      // Use the optimized buildMessages method (no broken enhanced context service dependency)
      const messages = this.buildMessages(agent, input, context);
      
      // Generate response based on provider
      let response;
      const startTime = Date.now();

      switch (provider.type) {
        case 'openai':
          response = await this.generateOpenAIResponse(provider.client, ai_model, messages, context.tools);
          break;
        case 'anthropic':
          response = await this.generateAnthropicResponse(provider.client, ai_model, messages, context.tools);
          break;
        case 'gemini':
          response = await this.generateGeminiResponse(provider.client, ai_model, messages, context.tools);
          break;
        default:
          throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        response: response.content,
        execution_time: executionTime,
        tokens_used: response.tokens || 0,
        model_used: ai_model,
        tools_called: response.toolCalls || [],
        success: true,
        
        // Context metadata 
        context_strategy: context.contextDecision?.primary || 'fast',
        context_confidence: Math.round((context.contextDecision?.confidence || 0.8) * 100) + '%',
        context_reasoning: context.contextDecision?.reasoning || 'Fast intelligent context selection',
        fast_context_used: true
      };

    } catch (error) {
      logger.error('[FAST] AI generation failed:', { error: error.message, model: ai_model });
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  /**
   * Generate response using OpenAI
   */
  async generateOpenAIResponse(client, model, messages, tools) {
    const completion = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
      tools: tools ? this.convertToolsToOpenAIFormat(tools) : undefined,
      tool_choice: tools ? 'auto' : undefined
    });

    const choice = completion.choices[0];
    
    return {
      content: choice.message.content,
      tokens: completion.usage?.total_tokens,
      toolCalls: choice.message.tool_calls
    };
  }

  /**
   * Generate response using Anthropic Claude
   */
  async generateAnthropicResponse(client, model, messages, tools) {
    // Convert messages to Anthropic format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await client.messages.create({
      model: model,
      max_tokens: 2000,
      temperature: 0.7,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    });

    return {
      content: response.content[0].text,
      tokens: response.usage?.input_tokens + response.usage?.output_tokens
    };
  }

  /**
   * Generate response using Google Gemini
   */
  async generateGeminiResponse(client, model, messages, tools) {
    const genModel = client.getGenerativeModel({ model: model });
    
    // Convert messages to Gemini format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    
    const prompt = `${systemMessage}\n\nUser: ${userMessage}`;
    
    const result = await genModel.generateContent(prompt);
    const response = result.response;

    return {
      content: response.text(),
      tokens: 0 // Gemini doesn't provide token count in the same way
    };
  }

  /**
   * Get provider for a specific model
   */
  getProviderForModel(model) {
    // OpenAI models
    if (model.startsWith('gpt-') && this.providers.has('openai')) {
      return { type: 'openai', client: this.providers.get('openai').client };
    }
    
    // Anthropic models
    if (model.startsWith('claude-') && this.providers.has('anthropic')) {
      return { type: 'anthropic', client: this.providers.get('anthropic').client };
    }
    
    // Gemini models
    if (model.startsWith('gemini-') && this.providers.has('gemini')) {
      return { type: 'gemini', client: this.providers.get('gemini').client };
    }

    // Fallback to OpenAI if available
    if (this.providers.has('openai')) {
      logger.warn(`Model ${model} not found, falling back to OpenAI`);
      return { type: 'openai', client: this.providers.get('openai').client };
    }

    return null;
  }

  /**
   * Get default system prompt based on personality type
   */
  getDefaultSystemPrompt(personalityType) {
    const prompts = {
      assistant: 'You are a helpful, harmless, and honest AI assistant.',
      technical: 'You are a technical expert specializing in software development and engineering.',
      creative: 'You are a creative assistant focused on imagination and innovation.',
      tutor: 'You are a patient and encouraging tutor who helps users learn effectively.',
      executive: 'You are a professional executive assistant focused on efficiency and organization.',
      research: 'You are a thorough research assistant providing well-researched, fact-based responses.'
    };

    return prompts[personalityType] || prompts.assistant;
  }

  /**
   * Convert tools to OpenAI function calling format
   */
  convertToolsToOpenAIFormat(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }));
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a specific model is available
   */
  isModelAvailable(model) {
    return !!this.getProviderForModel(model);
  }
}

// Create singleton instance
const aiProviderService = new AIProviderService();

module.exports = {
  AIProviderService,
  aiProviderService
};