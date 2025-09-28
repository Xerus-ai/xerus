/**
 * Master Prompt Orchestrator
 * Intelligently composes final prompts by integrating:
 * - Agent's system prompt (from database)
 * - LangGraph context strategy decisions
 * - Relevant context sources (KB, screenshots, tools)
 * - User query
 * - Professional Xerus prompt templates
 * 
 * This replaces the simple prompt concatenation with intelligent context integration
 */

const { profilePrompts } = require('../prompts/promptTemplates');

class MasterPromptOrchestrator {
  constructor() {
    this.initialized = true;
    console.log('[TARGET] [MasterPrompt] Master Prompt Orchestrator initialized');
  }

  /**
   * Create the final system prompt for the agent's LLM
   * Integrates context based on LangGraph's intelligent decisions
   * 
   * @param {Object} agent - Database agent record
   * @param {Object} context - Enhanced context with strategy (includes isTTS flag)
   * @param {string} query - User's query
   * @returns {string} Final orchestrated system prompt
   */
  orchestratePrompt(agent, context, query) {
    try {
      // 🔊 TTS MODE: Use specialized prompts for voice responses
      if (context.isTTS === true) {
        return this.createTTSPrompt(agent, context, query);
      }
      
      // 1. Start with agent's base system prompt - PRESERVE AGENT PERSONALITY
      let systemPrompt = agent.system_prompt || "You are a helpful AI assistant.";
      
      // 2. Add vision capability notice and context integration guidance
      const hasVisual = context.includeScreenshot || context.screenshot || context.image || context.imageContext;
      const hasKnowledge = context.strategy?.useKnowledge && context.ragResults?.length > 0;
      
      if (context.strategy?.useScreenshot && hasVisual) {
        if (hasKnowledge) {
          systemPrompt += "\n\n## Multi-Modal Analysis\nYou can analyze the provided screenshot AND have access to relevant knowledge base information. **Combine both visual analysis and knowledge base content** to provide comprehensive, well-informed responses.";
        } else {
          systemPrompt += "\n\n## Visual Analysis Capability\nYou can analyze the provided screenshot. Use visual information to enhance your response.";
        }
      }
      
      // 3. Integrate context sources ONLY (without changing personality)
      if (context.strategy) {
        systemPrompt += this.integrateContextSourcesMinimal(context);
      }
      
      console.log(`[TARGET] [MasterPrompt] Orchestrated prompt for ${agent.name}: ${systemPrompt.length} chars (PRESERVING AGENT PERSONALITY)`);
      console.log(`[TASKS] [MasterPrompt] Context strategy: KB=${context.strategy?.useKnowledge}, Screenshot=${context.strategy?.useScreenshot}, Tools=${context.strategy?.useTools}`);
      
      // Debug: Show context integration without personality override
      const contextAdded = [];
      if (context.strategy?.useKnowledge && context.ragResults?.length > 0) contextAdded.push(`Knowledge(${context.ragResults.length} items)`);
      if (context.strategy?.useScreenshot && hasVisual) contextAdded.push('Screenshot capability');
      if (context.strategy?.useTools && context.tools?.length > 0) contextAdded.push(`Tools(${context.tools.length})`);
      console.log(`[TOOL] [MasterPrompt] Context added: ${contextAdded.length > 0 ? contextAdded.join(', ') : 'None - using agent personality only'}`);
      
      return systemPrompt;
      
    } catch (error) {
      console.error('[ERROR] [MasterPrompt] Failed to orchestrate prompt:', error);
      
      // Fallback to basic prompt
      return agent.system_prompt + "\n\nPlease provide a helpful response to the user's query.";
    }
  }

  /**
   * Create specialized TTS-optimized prompt for voice responses
   * Uses conversation-aware prompts with screen context intelligence
   * 
   * @param {Object} agent - Database agent record  
   * @param {Object} context - Enhanced context with strategy
   * @param {string} query - User's query
   * @returns {string} TTS-optimized system prompt
   */
  createTTSPrompt(agent, context, query) {
    console.log(`🔊 [MasterPrompt] Creating TTS-optimized prompt for ${agent.name}`);
    
    // Enhanced context detection - check all possible screenshot sources
    const hasVisual = !!(context.includeScreenshot || context.screenshot || context.image || context.imageContext || context.strategy?.useScreenshot);
    const hasKnowledge = context.strategy?.useKnowledge && context.ragResults?.length > 0;
    const hasConversation = !!(context.conversationHistory || context.transcript);
    
    console.log(`🔊 [MasterPrompt] TTS Context:`, {
      includeScreenshot: context.includeScreenshot,
      includeKnowledge: context.includeKnowledge,
      hasScreenshot: hasVisual,
      hasRAGResults: context.ragResults?.length > 0,
      useKnowledge: context.strategy?.useKnowledge,
      useScreenshot: context.strategy?.useScreenshot,
      hasConversation: hasConversation,
      queryLength: query?.length || 0,
      queryPreview: query?.substring(0, 50) + '...'
    });
    
    // Conversation-aware TTS prompt structure
    let ttsPrompt = `You are ${agent.name}, providing voice responses in an ongoing conversation.

## Context Analysis Instructions
Below is a conversation thread with the user. The latest message in the thread indicates what the user is trying to know or discuss.

There are 2 approaches to respond:
1. **Conversation-based**: Answer based on the conversation history and latest message if the context is sufficient
2. **Screen-enhanced**: If the conversation context isn't clear or could benefit from visual information, reference the screenshot of the user's current screen to provide a more complete answer

## Decision Logic
- First, analyze if the conversation thread provides enough context to answer meaningfully
- If the user's screen information would be relevant to their query, incorporate visual observations
- If screen information isn't relevant to the question, focus on the conversational context
- Always prioritize being helpful and contextually appropriate`;
    
    // Add context data with conversation-aware structure
    if (hasConversation) {
      ttsPrompt += "\n\n## Conversation Context\nThe ongoing conversation provides important context for understanding the user's current need.";
    }
    
    if (hasVisual) {
      ttsPrompt += "\n\n## Visual Context\nA screenshot of the user's current screen is available to enhance your response when relevant.";
    }
    
    if (hasKnowledge) {
      ttsPrompt += "\n\n## Knowledge Context\nRelevant information from the knowledge base is available to supplement your response.";
    }
    
    // Add context data (enhanced for conversation awareness)
    if (context.strategy) {
      ttsPrompt += this.integrateTTSContextSources(context);
    }
    
    // TTS response guidelines
    ttsPrompt += `\n\n## Voice Response Guidelines
- Keep responses under 30 seconds (approximately 75 words)
- Use conversational, natural language that flows with the conversation
- Be direct and helpful while maintaining conversation continuity
- Reference screen content only when it adds value to your response
- If the user's query is simple and conversational, respond naturally without forcing screen references
- End with a natural conversational flow`;

    console.log(`🔊 [MasterPrompt] Conversation-aware TTS prompt created: ${ttsPrompt.length} chars`);
    console.log(`[TASKS] [MasterPrompt] TTS context: Conversation=${hasConversation}, Screenshot=${hasVisual}, Knowledge=${hasKnowledge}`);
    
    return ttsPrompt;
  }

  /**
   * Get base TTS personality prompt based on agent type
   * 
   * @param {Object} agent - Database agent record
   * @returns {string} Base TTS personality prompt
   */
  getTTSBasePrompt(agent) {
    // Map agent personalities to TTS-optimized versions
    const ttsPersonalities = {
      'assistant': 'You are a helpful AI assistant providing quick, conversational responses. Be friendly and direct.',
      'technical': 'You are a technical expert giving clear, concise explanations. Use simple language for complex topics.',
      'creative': 'You are a creative advisor offering inspiring, engaging suggestions. Be enthusiastic but brief.',
      'tutor': 'You are a patient tutor explaining concepts clearly. Break down complex ideas into simple terms.',
      'executive': 'You are a professional advisor providing strategic insights. Be confident and decisive.',
      'research': 'You are a research assistant sharing key findings. Focus on the most important insights.'
    };
    
    // Use agent's personality type to get TTS-optimized prompt, fallback to agent's system prompt essence
    const personalityType = agent.personality_type?.toLowerCase();
    
    if (ttsPersonalities[personalityType]) {
      return ttsPersonalities[personalityType];
    }
    
    // Fallback: Create TTS version of agent's system prompt
    const originalPrompt = agent.system_prompt || "You are a helpful AI assistant.";
    return `You are providing a quick voice response. ${originalPrompt.split('.')[0]}. Keep responses conversational and under 30 seconds.`;
  }

  /**
   * Integrate context sources for TTS with concise formatting
   * 
   * @param {Object} context - Enhanced context with strategy
   * @returns {string} TTS-optimized context integration
   */
  integrateTTSContextSources(context) {
    let contextInstructions = "";
    
    // Concise Knowledge Base Context for TTS
    if (context.strategy?.useKnowledge && context.ragResults?.length > 0) {
      contextInstructions += "\n\n## Relevant Knowledge\n";
      contextInstructions += this.buildTTSKnowledgeContent(context.ragResults);
    }
    
    // Concise Tools Context for TTS  
    if (context.strategy?.useTools && context.tools?.length > 0) {
      contextInstructions += "\n\n## Available Actions\n";
      contextInstructions += this.buildTTSToolsContent(context.tools);
    }
    
    return contextInstructions;
  }

  /**
   * Build concise knowledge content for TTS
   * 
   * @param {Array} ragResults - RAG search results
   * @returns {string} TTS-optimized knowledge content
   */
  buildTTSKnowledgeContent(ragResults) {
    let content = "Key information from your knowledge base:\n\n";
    
    // Limit to top 3 results and summarize briefly
    ragResults.slice(0, 3).forEach((result, index) => {
      const snippet = result.content.substring(0, 150) + (result.content.length > 150 ? '...' : '');
      content += `• **${result.title}**: ${snippet}\n`;
    });
    
    return content.trim();
  }

  /**
   * Build concise tools content for TTS
   * 
   * @param {Array} tools - Available tools
   * @returns {string} TTS-optimized tools content
   */
  buildTTSToolsContent(tools) {
    let content = "You can help with:\n";
    
    // Limit to most relevant tools and simplify descriptions
    tools.slice(0, 4).forEach(tool => {
      const simpleDesc = tool.description.split('.')[0]; // First sentence only
      content += `• ${tool.name}: ${simpleDesc}\n`;
    });
    
    return content.trim();
  }

  /**
   * Dynamic context integration instructions based on Xerus professional templates
   */
  getMasterContextInstructions() {
    return `

${profilePrompts.xerus_analysis.intro}

## Context Integration Strategy

${profilePrompts.xerus_analysis.formatRequirements.split('<screen_problem_solving_priority>')[0]}

You have been provided with context sources that an intelligent system determined would be helpful for this query. Execute the Xerus priority hierarchy for optimal response generation.`;
  }

  /**
   * Integrate context sources minimally without changing agent personality
   */
  integrateContextSourcesMinimal(context) {
    let contextInstructions = "";
    
    // Only add context data, not personality instructions
    
    // Dynamic Knowledge Base Context
    if (context.strategy?.useKnowledge && context.ragResults?.length > 0) {
      contextInstructions += "\n\n## Relevant Knowledge\n";
      const knowledgeContent = this.buildKnowledgeBaseContent(context.ragResults);
      contextInstructions += knowledgeContent;
      
    } else {
    }
    
    // Dynamic Tools Context
    if (context.strategy?.useTools && context.tools?.length > 0) {
      contextInstructions += "\n\n## Available Tools\n";
      contextInstructions += this.buildToolsContent(context.tools);
    }
    
    return contextInstructions;
  }

  /**
   * DEPRECATED: Legacy method that overwrote agent personality
   * Integrate specific context sources using structured tags based on LangGraph strategy
   */
  integrateContextSources(context) {
    let contextInstructions = "\n\n## Available Context\n";
    
    // Dynamic Knowledge Base Context
    if (context.strategy?.useKnowledge && context.ragResults?.length > 0) {
      contextInstructions += "\n<knowledge base>\n";
      contextInstructions += this.buildKnowledgeBaseContent(context.ragResults);
      contextInstructions += "\n</knowledge base>\n";
    }
    
    // Dynamic Visual Context - check multiple possible fields
    const hasVisualContent = context.includeScreenshot || context.screenshot || context.image || context.imageContext;
    if (context.strategy?.useScreenshot && hasVisualContent) {
      contextInstructions += "\n<visual context>\n";
      contextInstructions += this.buildVisualContent(context);
      contextInstructions += "\n</visual context>\n";
    }
    
    // Dynamic Tools Context
    if (context.strategy?.useTools && context.tools?.length > 0) {
      contextInstructions += "\n<tools>\n";
      contextInstructions += this.buildToolsContent(context.tools);
      contextInstructions += "\n</tools>\n";
    }
    
    // Context Strategy Explanation
    if (context.strategy?.reasoning) {
      contextInstructions += `\n**Context Strategy:** ${context.strategy.reasoning}`;
    }
    
    return contextInstructions;
  }

  /**
   * Build Knowledge Base content for structured tags
   */
  buildKnowledgeBaseContent(ragResults) {
    let content = "Relevant information from your knowledge base:\n\n";
    
    ragResults.slice(0, 5).forEach((result, index) => {
      content += `**${result.title}** (Relevance: ${Math.round(result.similarity * 100)}%)\n`;
      content += `${result.content}\n\n`;
    });
    
    return content.trim();
  }

  /**
   * Build Visual content for structured tags using Xerus screen analysis guidelines
   */
  buildVisualContent(context) {
    const screenGuidelines = profilePrompts.xerus_analysis.formatRequirements
      .split('<screen_problem_solving_priority>')[1]
      ?.split('</screen_problem_solving_priority>')[0] || '';
    
    return `A screenshot has been provided for visual analysis.

${screenGuidelines}

As a vision-capable AI following Xerus priority hierarchy:
- Analyze what's visible in the screenshot
- **Always combine visual analysis with relevant knowledge base information when both are available**
- Use both sources to provide comprehensive, accurate responses
- Enhance visual observations with knowledge base context and details`;
  }

  /**
   * Build Tools content for structured tags
   */
  buildToolsContent(tools) {
    let content = `You have access to ${tools.length} tools:\n\n`;
    
    tools.forEach(tool => {
      content += `- **${tool.name}**: ${tool.description}\n`;
    });
    
    return content.trim();
  }

  /**
   * Add query context without hardcoded guidance
   */
  getQueryGuidance(query, context) {
    let guidance = "\n\n## User Query\n";
    guidance += `"${query}"\n`;
    
    if (context.strategy?.reasoning) {
      guidance += `\n**Context Strategy:** ${context.strategy.reasoning}\n`;
    }
    
    return guidance;
  }

  // REMOVED: No longer needed - let the agent use its intelligence

  /**
   * Minimal response standards - let agent use natural intelligence
   */
  getResponseQualityStandards() {
    return `

Provide a helpful, accurate response based on the available context and your expertise.`;
  }

  /**
   * Generate a concise prompt summary for debugging
   */
  getPromptSummary(agent, context) {
    const hasVisual = context.includeScreenshot || context.screenshot || context.image || context.imageContext;
    const contextSources = [];
    if (context.strategy?.useKnowledge) contextSources.push(`KB(${context.ragResults?.length || 0} items)`);
    if (context.strategy?.useScreenshot && hasVisual) contextSources.push('Screenshot');
    if (context.strategy?.useTools) contextSources.push(`Tools(${context.tools?.length || 0})`);
    
    return {
      agent: agent.name,
      personality: `${agent.personality_type} (preserved)`,
      contextSources: contextSources.join(', ') || 'Agent personality only',
      strategy: 'Context addition without personality override',
      promptLength: 0 // Will be filled in by caller
    };
  }
}

module.exports = new MasterPromptOrchestrator();