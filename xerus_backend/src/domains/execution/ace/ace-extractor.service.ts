// ACE Extractor Service
// Analyzes session transcripts to extract behavioral insights for the playbook.
// Implements ReflectorService interface from ace-reflection.trigger.ts.
//
// Two analysis modes:
// 1. Heuristic analysis (always runs): Counts tool calls, detects error patterns,
//    identifies domains, calculates quality scores from signals.
// 2. LLM-based extraction (when LLMClient provided): Calls Haiku to extract
//    nuanced insights, success patterns, and user preferences.
//
// Heuristic mode ensures the service works without an LLM connection (e.g., tests,
// development). LLM mode produces richer insights for production.

import type {
    ReflectorService,
    ReflectorAnalysis,
    QualityScores,
    ReflectorInsight,
    ReflectorError,
} from './ace-reflection.trigger';

// -----------------------------------------------------------------------------
// LLM Client Interface
// -----------------------------------------------------------------------------

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMClient {
    complete(params: {
        model: string;
        messages: LLMMessage[];
    }): Promise<{ content: string }>;
}

// -----------------------------------------------------------------------------
// Extractor Config
// -----------------------------------------------------------------------------

export interface AceExtractorConfig {
    model: string;
    maxResponseLength: number;
}

const DEFAULT_CONFIG: AceExtractorConfig = {
    model: 'anthropic/claude-3.5-haiku',
    maxResponseLength: 5000,
};

// -----------------------------------------------------------------------------
// Tool Call Shape (minimal for analysis)
// -----------------------------------------------------------------------------

interface ToolCallInfo {
    name?: string;
    success?: boolean;
    error?: string;
}

// -----------------------------------------------------------------------------
// ACE Extractor Service
// -----------------------------------------------------------------------------

export class AceExtractorService implements ReflectorService {
    private readonly llmClient: LLMClient | null;
    private readonly config: AceExtractorConfig;

    constructor(llmClient?: LLMClient, config?: Partial<AceExtractorConfig>) {
        this.llmClient = llmClient ?? null;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async analyze(params: {
        agent_id: number;
        session_id: string;
        response?: string;
        tool_calls?: unknown[];
    }): Promise<ReflectorAnalysis> {
        const toolCalls = normalizeToolCalls(params.tool_calls);
        const heuristic = analyzeHeuristic(params.response, toolCalls);

        if (this.llmClient && params.response) {
            const llmInsights = await this.extractWithLLM(params.response, toolCalls);
            return mergeAnalysis(heuristic, llmInsights);
        }

        return heuristic;
    }

    private async extractWithLLM(
        response: string,
        toolCalls: ToolCallInfo[],
    ): Promise<ReflectorInsight[]> {
        const truncated = response.slice(0, this.config.maxResponseLength);
        const toolSummary = toolCalls
            .map(tc => `- ${tc.name || 'unknown'}${tc.success === false ? ' [FAILED]' : ''}`)
            .join('\n');

        const prompt = [
            'Analyze this agent session and extract behavioral insights.',
            'Return JSON array of insights. Each insight has: type, content, confidence (0-1), domain, keywords[].',
            '',
            'Insight types: success_pattern, error_prevention, user_preference, workflow',
            'Domains: general, productivity, technical, creative',
            '',
            `Agent Response:\n${truncated}`,
            toolSummary ? `\nTools Used:\n${toolSummary}` : '',
            '',
            'Return ONLY a JSON array, no other text.',
        ].join('\n');

        const result = await this.llmClient!.complete({
            model: this.config.model,
            messages: [
                { role: 'system', content: 'You extract behavioral insights from AI agent sessions. Return valid JSON only.' },
                { role: 'user', content: prompt },
            ],
        });

        return parseLLMInsights(result.content);
    }
}

// -----------------------------------------------------------------------------
// Heuristic Analysis (pure functions)
// -----------------------------------------------------------------------------

function normalizeToolCalls(raw?: unknown[]): ToolCallInfo[] {
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map(tc => {
        if (typeof tc === 'object' && tc !== null) {
            const obj = tc as Record<string, unknown>;
            return {
                name: typeof obj.name === 'string' ? obj.name : undefined,
                success: typeof obj.success === 'boolean' ? obj.success : undefined,
                error: typeof obj.error === 'string' ? obj.error : undefined,
            };
        }
        return {};
    });
}

function analyzeHeuristic(response?: string, toolCalls: ToolCallInfo[] = []): ReflectorAnalysis {
    const qualityScores = calculateQualityScores(response, toolCalls);
    const insights = extractHeuristicInsights(response, toolCalls);
    const errors = detectErrors(toolCalls);
    const patterns = detectPatterns(response, toolCalls);

    return {
        qualityScores,
        insights,
        errors,
        patterns,
        timestamp: new Date().toISOString(),
    };
}

function calculateQualityScores(response?: string, toolCalls: ToolCallInfo[] = []): QualityScores {
    const hasResponse = !!response && response.length > 0;
    const responseLength = response?.length ?? 0;
    const failedCalls = toolCalls.filter(tc => tc.success === false).length;
    const totalCalls = toolCalls.length;

    // Completeness: Has response + reasonable length
    const completeness = hasResponse
        ? Math.min(1, responseLength / 200)
        : 0;

    // Relevance: Used tools (agents that use tools are engaging with the task)
    const relevance = totalCalls > 0
        ? Math.min(1, totalCalls / 5)
        : hasResponse ? 0.3 : 0;

    // Accuracy: Ratio of successful tool calls
    const accuracy = totalCalls > 0
        ? (totalCalls - failedCalls) / totalCalls
        : hasResponse ? 0.5 : 0;

    // Overall: weighted combination
    const overall = completeness * 0.3 + relevance * 0.3 + accuracy * 0.4;

    return {
        overall: clamp(overall),
        relevance: clamp(relevance),
        completeness: clamp(completeness),
        accuracy: clamp(accuracy),
    };
}

function extractHeuristicInsights(response?: string, toolCalls: ToolCallInfo[] = []): ReflectorInsight[] {
    const insights: ReflectorInsight[] = [];

    // Detect multi-tool workflow pattern
    if (toolCalls.length >= 3) {
        const toolNames = toolCalls
            .map(tc => tc.name)
            .filter((name): name is string => !!name);
        const uniqueTools = new Set(toolNames);

        if (uniqueTools.size >= 2) {
            insights.push({
                type: 'workflow',
                content: `Used ${uniqueTools.size} different tools in sequence: ${[...uniqueTools].join(', ')}`,
                confidence: 0.6,
                domain: 'general',
                keywords: [...uniqueTools],
            });
        }
    }

    // Detect successful completion pattern
    const allSucceeded = toolCalls.length > 0 && toolCalls.every(tc => tc.success !== false);
    if (allSucceeded && response && response.length > 100) {
        insights.push({
            type: 'success_pattern',
            content: 'Session completed successfully with all tool calls succeeding',
            confidence: 0.7,
            domain: 'general',
            keywords: ['success', 'completion'],
        });
    }

    return insights;
}

function detectErrors(toolCalls: ToolCallInfo[]): ReflectorError[] {
    const errors: ReflectorError[] = [];
    const failedCalls = toolCalls.filter(tc => tc.success === false);

    for (const call of failedCalls) {
        const sanitizedError = call.error ? call.error.slice(0, 200) : undefined;
        errors.push({
            type: 'tool_failure',
            severity: 'warning',
            description: `Tool ${call.name || 'unknown'} failed${sanitizedError ? `: ${sanitizedError}` : ''}`,
            prevention: `Validate inputs before calling ${call.name || 'this tool'}`,
        });
    }

    return errors;
}

function detectPatterns(response?: string, toolCalls: ToolCallInfo[] = []): ReflectorAnalysis['patterns'] {
    const toolNames = toolCalls.map(tc => tc.name).filter(Boolean);

    let domain: string | undefined;
    if (toolNames.some(n => n === 'WebSearch' || n === 'WebFetch')) {
        domain = 'technical';
    } else if (toolNames.some(n => n === 'Write' || n === 'Edit')) {
        domain = 'creative';
    }

    return {
        domain,
        responseLength: response?.length,
        usedPlaybookEntries: false,
    };
}

// -----------------------------------------------------------------------------
// LLM Response Parsing
// -----------------------------------------------------------------------------

function parseLLMInsights(content: string): ReflectorInsight[] {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
        throw new Error(`LLM returned non-array response: ${typeof parsed}`);
    }

    return parsed
        .filter((item: unknown): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null && 'type' in item,
        )
        .map((item) => ({
            type: String(item.type),
            content: typeof item.content === 'string' ? item.content : undefined,
            confidence: typeof item.confidence === 'number' ? clamp(item.confidence) : undefined,
            domain: typeof item.domain === 'string' ? item.domain : undefined,
            keywords: Array.isArray(item.keywords)
                ? item.keywords.filter((k: unknown): k is string => typeof k === 'string')
                : undefined,
        }));
}

function mergeAnalysis(heuristic: ReflectorAnalysis, llmInsights: ReflectorInsight[]): ReflectorAnalysis {
    return {
        ...heuristic,
        insights: [...heuristic.insights, ...llmInsights],
    };
}

function clamp(value: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, value));
}
