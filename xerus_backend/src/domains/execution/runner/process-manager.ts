// Process Manager
// Central registry of active SDK query() sessions
// Concurrency: one query() per agent slug at a time
// Message queuing when agent is busy (delivered at turn boundaries)
//
// Split: type definitions moved to process-manager.types.ts

import { EventEmitter } from 'events';
import { SessionManager } from './session-manager';
import { StdoutEmitter } from './stdout-emitter';
import { isSDKMessage, type SDKMessage, type SDKSystemInitMessage, type SDKStreamEventPayload, type SDKStreamDelta } from './sdk-message.types';
import { createPlatformMcpServer } from './platform-mcp-server';
import type { MetadataSyncFn } from './platform-mcp-handlers';
import { PERMISSION_MAP, type AutonomyLevel, AUTONOMY_LEVELS } from '../types';

// Import and re-export types from process-manager.types.ts
import {
    IDLE_WATCHDOG_INTERVAL_MS,
    IDLE_WATCHDOG_TIMEOUT_MS,
} from './process-manager.types';

import type { ActiveSession } from './process-manager.types';

export type { PresetSystemPrompt, SystemPrompt, AgentConfig } from './process-manager.types';
import type { AgentConfig } from './process-manager.types';

export class ProcessManager extends EventEmitter {
    private activeSessions = new Map<string, ActiveSession>();
    private sessionManager: SessionManager;
    private emitter: StdoutEmitter;
    private getQueryFn: (() => Promise<(opts: Record<string, unknown>) => AsyncIterable<unknown>>) | null = null;

    constructor(sessionManager: SessionManager, emitter: StdoutEmitter) {
        super();
        this.sessionManager = sessionManager;
        this.emitter = emitter;
    }

    setQueryProvider(fn: () => Promise<(opts: Record<string, unknown>) => AsyncIterable<unknown>>): void {
        this.getQueryFn = fn;
    }

    isAgentBusy(agentSlug: string): boolean {
        return this.activeSessions.has(agentSlug);
    }

    queueMessage(agentSlug: string, content: string): void {
        const session = this.activeSessions.get(agentSlug);
        if (!session) {
            throw new Error(`No active session for agent: ${agentSlug}`);
        }
        if (session.resolveNext) {
            session.resolveNext(content);
            session.resolveNext = null;
        } else {
            session.messageQueue.push(content);
        }
    }

    async executeAgent(config: AgentConfig, prompt: string): Promise<void> {
        if (this.activeSessions.has(config.agent_slug)) {
            this.queueMessage(config.agent_slug, prompt);
            return;
        }

        if (!this.getQueryFn) {
            throw new Error('Query provider not set. Call setQueryProvider() first.');
        }

        const abortController = new AbortController();
        const session: ActiveSession = {
            agentSlug: config.agent_slug,
            queryHandle: null,
            messageQueue: [],
            resolveNext: null,
            abortController,
            startTime: Date.now(),
        };
        this.activeSessions.set(config.agent_slug, session);

        const existingSessionId = this.sessionManager.getSessionId(config.agent_slug);

        // Idle watchdog: abort if no SDK messages for IDLE_WATCHDOG_TIMEOUT_MS
        let lastActivityTime = Date.now();
        const idleWatchdog = setInterval(() => {
            const idleMs = Date.now() - lastActivityTime;
            if (idleMs >= IDLE_WATCHDOG_TIMEOUT_MS) {
                console.warn(
                    `[ProcessManager] Agent '${config.agent_slug}' idle for ${Math.round(idleMs / 1000)}s, force-terminating`,
                );
                abortController.abort();
                clearInterval(idleWatchdog);
            }
        }, IDLE_WATCHDOG_INTERVAL_MS);

        try {
            const query = await this.getQueryFn();

            const sdkEnv: Record<string, string> = {};
            const SUBPROCESS_ENV_ALLOWLIST = [
                'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL',
                'OPENROUTER_API_KEY',
                'XERUS_WORKSPACE_ROOT', 'XERUS_AGENT_SLUG', 'XERUS_SESSION_ID',
                'XERUS_API_BASE_URL', 'XERUS_USER_ID',
                'NODE_ENV', 'PATH', 'HOME', 'SHELL', 'TERM',
                'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
            ];
            for (const key of SUBPROCESS_ENV_ALLOWLIST) {
                // Use 'in' check, not truthiness — ANTHROPIC_API_KEY is intentionally
                // empty string when using OpenRouter (AUTH_TOKEN carries the key instead).
                // Falsy check would skip it, causing "Not logged in" errors.
                if (key in process.env) sdkEnv[key] = process.env[key]!;
            }
            sdkEnv.XERUS_AGENT_SLUG = config.agent_slug;

            const autonomyLevel = config.autonomy_level as AutonomyLevel | undefined;
            if (autonomyLevel && !AUTONOMY_LEVELS.includes(autonomyLevel)) {
                throw new Error(`Invalid autonomy_level: ${autonomyLevel}`);
            }
            const resolvedAutonomy: AutonomyLevel = autonomyLevel || 'supervised';
            const permissionMode = PERMISSION_MAP[resolvedAutonomy];

            const options: Record<string, unknown> = {
                cwd: config.cwd,
                systemPrompt: config.system_prompt,
                model: config.model,
                allowedTools: config.tools.length > 0 ? config.tools : undefined,
                permissionMode,
                persistSession: true,
                maxTurns: config.max_turns,
                includePartialMessages: true,
                settingSources: ['project'],
                allowDangerouslySkipPermissions: resolvedAutonomy === 'autonomous',
                env: sdkEnv,
                abortController,
            };

            if (existingSessionId) {
                options.resume = existingSessionId;
            }
            if (config.mcp_servers) {
                options.mcpServers = await this.resolveMcpServers(config.mcp_servers, config.agent_slug);
            }
            if (config.hooks && Object.keys(config.hooks).length > 0) {
                options.hooks = config.hooks;
            }
            if (config.agents && Object.keys(config.agents).length > 0) {
                options.agents = config.agents;
            }

            const queryResult = query({ prompt, ...options });
            session.queryHandle = queryResult;

            let sessionId = existingSessionId || '';
            let inputTokens = 0;
            let outputTokens = 0;
            let streamedTextLength = 0;
            const pendingToolCalls = new Map<string, string>();

            for await (const message of queryResult) {
                if (!isSDKMessage(message)) {
                    this.emitter.agentOutput(config.agent_slug, sessionId, 'unknown', message as Record<string, unknown>);
                    continue;
                }

                const msg: SDKMessage = message;
                lastActivityTime = Date.now();
                this.sessionManager.updateActivity(config.agent_slug);

                if (msg.type === 'system' && msg.subtype === 'init') {
                    sessionId = msg.session_id || sessionId;
                    this.sessionManager.startSession(config.agent_slug, sessionId);
                    this.emitter.sessionStarted(config.agent_slug, sessionId, config.model, config.cwd);

                    const sysMsg = msg as SDKSystemInitMessage;
                    if (sysMsg.permissionMode === 'plan') {
                        this.emitter.sseForward(
                            config.agent_slug, sessionId, 'progress',
                            { phase: 'Plan mode is active', message: 'Agent will propose changes without making edits', percent: 0 },
                        );
                    }
                    const tools = sysMsg.tools || [];
                    const hasSkills = tools.some((t: string) => t === 'Skill');
                    if (hasSkills) {
                        this.emitter.sseForward(
                            config.agent_slug, sessionId, 'progress',
                            { phase: 'Agent skills loaded', message: 'Skills available from workspace', percent: 0 },
                        );
                    }
                    continue;
                }

                if (msg.type === 'result') {
                    inputTokens = msg.usage?.input_tokens ?? 0;
                    outputTokens = msg.usage?.output_tokens ?? 0;
                    sessionId = msg.session_id || sessionId;

                    if (typeof msg.result === 'string' && msg.result.length > 0 && streamedTextLength === 0) {
                        this.emitter.sseForward(
                            config.agent_slug, sessionId, 'token',
                            { text: msg.result, tokenCount: 0 },
                        );
                    }
                    continue;
                }

                if (msg.type === 'assistant') {
                    const blocks = msg.message?.content;
                    if (Array.isArray(blocks)) {
                        for (const block of blocks) {
                            if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0 && streamedTextLength === 0) {
                                this.emitter.sseForward(
                                    config.agent_slug, sessionId, 'token',
                                    { text: block.text, tokenCount: 0 },
                                );
                            }
                            if (block.type === 'tool_use' && block.id && block.name) {
                                const callId = String(block.id);
                                const toolName = String(block.name);
                                const input = (block.input ?? {}) as Record<string, unknown>;
                                pendingToolCalls.set(callId, toolName);
                                this.emitter.sseForward(
                                    config.agent_slug, sessionId, 'tool_call',
                                    { toolName, arguments: input, callId },
                                );
                            }
                        }
                    }
                    continue;
                }

                if (msg.type === 'user') {
                    const blocks = msg.message?.content;
                    if (Array.isArray(blocks)) {
                        let foundResults = 0;
                        for (const block of blocks) {
                            if (block.type === 'tool_result' && block.tool_use_id) {
                                foundResults++;
                                const callId = String(block.tool_use_id);
                                pendingToolCalls.delete(callId);
                                const resultContent = typeof block.content === 'string'
                                    ? block.content
                                    : JSON.stringify(block.content ?? '');
                                this.emitter.sseForward(
                                    config.agent_slug, sessionId, 'tool_result',
                                    { callId, result: resultContent, success: !block.is_error, durationMs: 0 },
                                );
                            }
                        }
                        console.log(`[ProcessManager] user message: ${foundResults} tool_result blocks, ${pendingToolCalls.size} still pending`);
                    }
                    continue;
                }

                if (msg.type === 'stream_event') {
                    const event = msg.event as SDKStreamEventPayload | undefined;
                    if (!event) continue;

                    if (event.type === 'content_block_start') {
                        const block = event.content_block;
                        if (block?.type === 'tool_use' && block.id && block.name) {
                            const callId = String(block.id);
                            pendingToolCalls.set(callId, String(block.name));
                            this.emitter.sseForward(
                                config.agent_slug, sessionId, 'tool_call',
                                { toolName: String(block.name), arguments: {}, callId },
                            );
                        }
                        continue;
                    }

                    if (event.type === 'content_block_delta') {
                        const delta = event.delta as SDKStreamDelta | undefined;
                        if (delta?.type === 'text_delta' && 'text' in delta) {
                            streamedTextLength += delta.text.length;
                            this.emitter.sseForward(
                                config.agent_slug, sessionId, 'token',
                                { text: delta.text, tokenCount: 0 },
                            );
                            continue;
                        }
                        if (delta?.type === 'thinking_delta' && 'thinking' in delta) {
                            this.emitter.sseForward(
                                config.agent_slug, sessionId, 'reasoning',
                                { thought: delta.thinking, confidence: 1.0 },
                            );
                            continue;
                        }
                    }

                    continue;
                }

                this.emitter.agentOutput(config.agent_slug, sessionId, String((msg as Record<string, unknown>).type), msg as unknown as Record<string, unknown>);
            }

            if (pendingToolCalls.size > 0) {
                console.log(`[ProcessManager] Emitting ${pendingToolCalls.size} synthetic tool_result events for uncompleted tool calls`);
                for (const [callId, toolName] of pendingToolCalls) {
                    this.emitter.sseForward(
                        config.agent_slug, sessionId, 'tool_result',
                        { callId, result: '', success: true, durationMs: 0, toolName },
                    );
                }
                pendingToolCalls.clear();
            }

            const durationMs = Date.now() - session.startTime;
            this.sessionManager.endSession(config.agent_slug);
            this.emitter.sessionEnded(config.agent_slug, sessionId, true, durationMs, {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens,
            });

            this.emit('session_end', { agent_slug: config.agent_slug, success: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const durationMs = Date.now() - session.startTime;
            const sessionId = this.sessionManager.getSessionId(config.agent_slug) || '';

            this.sessionManager.removeSession(config.agent_slug);
            this.emitter.sessionEnded(config.agent_slug, sessionId, false, durationMs);
            this.emitter.error(errorMessage, 'EXECUTION_ERROR', config.agent_slug);

            this.emit('session_end', { agent_slug: config.agent_slug, success: false, error: errorMessage });
        } finally {
            clearInterval(idleWatchdog);
            this.activeSessions.delete(config.agent_slug);
        }
    }

    private async resolveMcpServers(
        servers: Record<string, unknown>,
        agentSlug: string,
    ): Promise<Record<string, unknown>> {
        const result = { ...servers };
        const platform = result['xerus-platform'] as Record<string, unknown> | undefined;
        if (platform?.type === 'stdio') {
            const syncFn: MetadataSyncFn = (entity, action, data) => {
                this.emitter.metadataSync(agentSlug, entity, action, data);
            };
            result['xerus-platform'] = await createPlatformMcpServer(syncFn);
        }
        return result;
    }

    interruptAgent(agentSlug: string): void {
        const session = this.activeSessions.get(agentSlug);
        if (!session) {
            throw new Error(`No active session for agent: ${agentSlug}`);
        }
        if (session.abortController) {
            session.abortController.abort();
        }
    }

    endAgent(agentSlug: string): void {
        const session = this.activeSessions.get(agentSlug);
        if (!session) return;

        if (session.resolveNext) {
            session.resolveNext('__done__');
            session.resolveNext = null;
        } else {
            session.messageQueue.push('__done__');
        }
    }

    activeAgentSlugs(): string[] {
        return Array.from(this.activeSessions.keys());
    }
}
