// Runtime Hook Factory -- builds HookHandlerMap for the runner process (inside Daytona sandbox).
// Split: hook-builders.ts (team, subagent, permission hooks),
//        session-hook-builders.ts (session lifecycle hooks),
//        runtime-hook-helpers.ts, beads-sync-handler.ts

import fs from 'fs/promises';
import path from 'path';
import type { HookHandlerMap, PostToolUseInput } from '../hooks/hooks.types';
import { PreToolUseHandler, type HookExecutionRecord } from '../hooks/pre-tool-use.hook';
import { PostToolUseHandler } from '../hooks/post-tool-use.hook';
import { StopHandler } from '../hooks/stop.hook';
import { NotificationHandler } from '../hooks/notification.hook';
import { handleBeadsSync } from './beads-sync-handler';
import type { StdoutEmitter } from './stdout-emitter';
import { createSandboxExecutor, createSandboxFileSystem, createGitMemoryServiceAdapter, createOpenRouterLLMClient } from './sandbox-adapters';
import { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';
import { DigestGeneratorService } from '../../memory/git-memory/digest-generator.service';
import { CrossProjectSharingService } from '../../memory/git-memory/cross-project-sharing.service';
import { TeamMemoryCoordinatorService } from '../../memory/git-memory/team-memory-coordinator.service';
import {
    createSseForwarder,
    buildSessionStartHandlers,
    buildSessionEndHandlers,
    buildPreCompactHandler,
    buildUserPromptSubmitHandler,
    buildACEReflectionTrigger,
} from './session-hook-builders';
import { buildTeamHooks, buildSubagentHooks, buildPermissionRequestHook } from './hook-builders';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RuntimeHookContext {
    agentSlug: string;
    userId: string;
    workspacePath: string;
    workspaceId: string;
    agentId: number;
    autonomyLevel: string;
    tools: string[];
    isMasterOrchestrator: boolean;
    primaryChannelId?: string;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Build HookHandlerMap for all 12 handled hook events.
 * 3 additional SDK events (PostToolUseFailure, PermissionRequest,
 * Setup) are intentionally unhandled -- see comment block at end
 * of function for rationale.
 */
export function buildRuntimeHookHandlers(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
): HookHandlerMap {
    const agentDir = path.join(ctx.workspacePath, 'agents', ctx.agentSlug);
    const handlers: HookHandlerMap = {};

    // Shared GitMemoryRepository for SessionStart, SessionEnd, and PreCompact hooks
    const executor = createSandboxExecutor();
    const fileSystem = createSandboxFileSystem();
    const gitRepo = new GitMemoryRepository(executor, fileSystem, ctx.workspacePath);
    const sharedGitMemoryService = createGitMemoryServiceAdapter(ctx.workspacePath, emitter, ctx.agentSlug, gitRepo);

    // Shared services for SessionEnd digest/sharing and TaskCompleted team memory
    const digestGenerator = new DigestGeneratorService(gitRepo, executor);
    const crossProjectService = new CrossProjectSharingService(gitRepo, executor);
    const llmClient = createOpenRouterLLMClient();
    const teamCoordinator = new TeamMemoryCoordinatorService(gitRepo, llmClient);

    // --- TeammateIdle + TaskCompleted (delegated to hook-builders.ts) ---
    buildTeamHooks(ctx, emitter, teamCoordinator, handlers);

    // --- PreToolUse (pure validation, log via emitter) ---
    const preToolHandler = new PreToolUseHandler(
        {
            hookExecutionLogger: {
                logExecution: async (_record: HookExecutionRecord) => {
                    emitter.hookLog('PreToolUse', ctx.agentSlug, 0, !_record.blocked);
                },
            },
        },
        {
            agent_id: ctx.agentId,
            agent_slug: ctx.agentSlug,
            user_id: ctx.userId,
            agent_type: ctx.isMasterOrchestrator ? 'orchestrator' : 'specialist',
            is_master_orchestrator: ctx.isMasterOrchestrator,
            allowed_tools: ctx.tools,
            autonomy_level: ctx.autonomyLevel as 'supervised' | 'semi_autonomous' | 'autonomous',
        },
    );
    handlers.PreToolUse = [input => preToolHandler.handle(input)];

    // --- PostToolUse (context monitoring via stdout) ---
    const forwarder = createSseForwarder(emitter, ctx.agentSlug);
    const postToolHandler = new PostToolUseHandler(
        {
            sseEmitter: forwarder,
            creditTracker: {
                recordToolUsage: async (userId, toolName, tokensUsed) => {
                    emitter.emit({
                        event: 'credit_usage',
                        agent_slug: ctx.agentSlug,
                        data: { user_id: userId, tool_name: toolName, tokens_used: tokensUsed },
                    });
                },
            },
            onCreditFailure: (errorMessage) => {
                emitter.hookLog('PostToolUse', ctx.agentSlug, 0, false, errorMessage);
            },
        },
        { execution_id: '', max_tokens: 200000, current_tokens: 0 },
    );
    handlers.PostToolUse = [
        async (input) => {
            const { tool_name: toolName, tool_input: toolInput, success: toolSuccess } = input as PostToolUseInput;
            const filePath = String(toolInput?.file_path ?? toolInput?.path ?? '');

            if (toolName === 'Write' && filePath.includes('.memory/')) {
                forwarder.emit({
                    type: 'memory_update', execution_id: '',
                    content: { operation: 'save', scope: 'agent', path: filePath },
                });
            }

            if (['Read', 'Grep', 'Glob'].includes(toolName) && filePath.includes('knowledge/')) {
                forwarder.emit({
                    type: 'kb_query', execution_id: '',
                    content: {
                        query: String(toolInput?.pattern ?? toolInput?.query ?? filePath),
                        resultsCount: 0,
                        kbIds: [],
                    },
                });
            }

            // --- Beads task sync (extracted to beads-sync-handler.ts) ---
            if (toolName === 'Bash' && toolSuccess) {
                const bashCmd = String(toolInput?.command ?? '');
                await handleBeadsSync({ agentSlug: ctx.agentSlug, workspacePath: ctx.workspacePath }, emitter, bashCmd);
            }

            return { success: true };
        },
        input => postToolHandler.handle(input),
    ];

    // --- Stop (filesystem cleanup + state sync via stdout) ---
    const stopHandler = new StopHandler(
        {
            workspaceWriter: {
                writeFile: async (filePath, content) => {
                    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(agentDir, filePath);
                    const dir = path.dirname(fullPath);
                    await fs.mkdir(dir, { recursive: true });
                    await fs.writeFile(fullPath, content, 'utf-8');
                },
                appendFile: async (filePath, content) => {
                    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(agentDir, filePath);
                    await fs.appendFile(fullPath, content, 'utf-8');
                },
                exists: async (filePath) => {
                    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(agentDir, filePath);
                    try {
                        await fs.access(fullPath);
                        return true;
                    } catch (error) {
                        // ENOENT = file doesn't exist, which is expected behavior for exists()
                        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                            return false;
                        }
                        // Other errors (EACCES, EPERM, etc.) indicate system problems - rethrow
                        throw error;
                    }
                },
            },
            stateSync: {
                syncSessionState: async (sessionId, reason, partialOutput) => {
                    emitter.emit({
                        event: 'agent_output',
                        agent_slug: ctx.agentSlug,
                        session_id: sessionId,
                        data: { message_type: 'state_sync', reason, partial_output: partialOutput },
                    });
                },
            },
            sseEmitter: forwarder,
        },
        { agent_id: ctx.agentId, user_id: ctx.userId, agent_slug: ctx.agentSlug, workspace_path: ctx.workspacePath },
    );
    handlers.Stop = [input => stopHandler.handle(input)];

    // --- Notification (route to inbox via stdout) ---
    const notifHandler = new NotificationHandler(
        {
            inboxService: {
                createItem: async (item) => {
                    emitter.createInboxItem(ctx.agentSlug, item.channel_id, item.message, item.priority as 'low' | 'medium' | 'high' | 'critical' | undefined);
                    return { id: `inbox_${Date.now()}` };
                },
            },
            pushService: {
                sendPush: async (notification) => {
                    emitter.pushNotification(notification.user_id, notification.title, notification.body, ctx.agentSlug);
                },
            },
            sseEmitter: forwarder,
            onPushFailure: (errorMessage) => {
                emitter.hookLog('Notification', ctx.agentSlug, 0, false, errorMessage);
            },
        },
        { agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId, primary_channel_id: ctx.primaryChannelId },
    );
    handlers.Notification = [input => notifHandler.handle(input)];

    // --- Session lifecycle hooks (delegated to session-hook-builders.ts) ---
    buildSessionStartHandlers(ctx, emitter, gitRepo, handlers);

    const aceReflectionTrigger = buildACEReflectionTrigger(emitter, ctx.agentSlug, gitRepo);

    buildSessionEndHandlers(
        ctx, emitter, gitRepo, executor, sharedGitMemoryService,
        aceReflectionTrigger, digestGenerator, crossProjectService, handlers,
    );

    // --- SubagentStop + SubagentStart (delegated to hook-builders.ts) ---
    buildSubagentHooks(ctx, emitter, forwarder, handlers);

    // --- PreCompact + UserPromptSubmit (delegated to session-hook-builders.ts) ---
    buildPreCompactHandler(ctx, emitter, sharedGitMemoryService, handlers);
    buildUserPromptSubmitHandler(ctx, handlers);

    // --- PermissionRequest (delegated to hook-builders.ts) ---
    buildPermissionRequestHook(ctx, emitter, handlers);

    // Unhandled: PostToolUseFailure (covered by PostToolUse), Setup (covered by SessionStart)
    return handlers;
}
