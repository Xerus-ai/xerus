// Session Hook Builders
// Builds SessionStart, SessionEnd, PreCompact, and UserPromptSubmit hook handlers.
// Extracted from runtime-hook-factory.ts for file size compliance (<400 lines).

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type { HookHandlerMap } from '../hooks/hooks.types';
import { SessionStartHandler } from '../hooks/session-start.hook';
import { SessionEndHandler } from '../hooks/session-end.hook';
import { PreCompactHandler } from '../hooks/pre-compact.hook';
import { UserPromptSubmitHandler } from '../hooks/user-prompt-submit.hook';
import type { StreamEvent } from '../types';
import type { StdoutEmitter } from './stdout-emitter';
import { SandboxMemoryExtractor } from './sandbox-memory-extractor';
import { createSandboxDRMCompressor } from './sandbox-adapters';
import { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';
import { DigestGeneratorService } from '../../memory/git-memory/digest-generator.service';
import { CrossProjectSharingService } from '../../memory/git-memory/cross-project-sharing.service';
import type { SandboxCommandExecutor } from '../../memory/git-memory/git-memory.types';
import { ACEReflectionTrigger } from '../../ace/ace-reflection.trigger';
import { AceExtractorService } from '../../ace/ace-extractor.service';
import { AcePlaybookCuratorService } from '../../ace/ace-playbook-curator.service';
import { SandboxContextBuilder } from './sandbox-context-builder';
import type { RuntimeHookContext } from './runtime-hook-factory';
import type { GitMemoryService, SessionEndHandlerResult } from '../hooks/session-end.types';
import { createInMemoryRateLimiter, scanDirRecursive } from './runtime-hook-helpers';

// -----------------------------------------------------------------------------
// SSE Forwarder (shared helper)
// -----------------------------------------------------------------------------

export function createSseForwarder(emitter: StdoutEmitter, agentSlug: string) {
    return {
        emit: (event: StreamEvent) => {
            emitter.sseForward(agentSlug, '', event.type, event.content);
        },
    };
}

// -----------------------------------------------------------------------------
// Session Start
// -----------------------------------------------------------------------------

export function buildSessionStartHandlers(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    gitRepo: GitMemoryRepository,
    handlers: HookHandlerMap,
): void {
    const sessionStartHandler = new SessionStartHandler(
        {
            workspaceScanner: {
                listFiles: async (dirPath) => {
                    if (!fs.existsSync(dirPath)) return [];
                    return scanDirRecursive(dirPath).map(f => ({ path: path.relative(dirPath, f), size: fs.statSync(f).size }));
                },
                directoryExists: async (dirPath) => fs.existsSync(dirPath),
            },
            workspaceWriter: {
                writeFile: async (filePath, content) => {
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(filePath, content, 'utf-8');
                },
                ensureDirectory: async (dirPath) => {
                    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
                },
            },
            memoryRepoInitializer: {
                ensureInitialized: async (_workspaceId) => {
                    await gitRepo.initializeRepository();
                    return true;
                },
                ensureAgentDirectory: async (slug) => {
                    await gitRepo.ensureAgentDirectory(slug);
                },
            },
            sessionAnalytics: {
                recordSessionStart: async (record) => {
                    emitter.emit({
                        event: 'session_analytics',
                        agent_slug: ctx.agentSlug,
                        session_id: record.session_id,
                        data: record,
                    });
                },
            },
        },
        { agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId, workspace_id: ctx.workspaceId, workspace_path: ctx.workspacePath },
    );

    handlers.SessionStart = [
        input => sessionStartHandler.handle(input),
        async () => {
            // Company DB initialization (creates valid SQLite file if missing or empty placeholder)
            const companyDbPath = path.join(ctx.workspacePath, 'data', 'company.db');
            const needsInit = !fs.existsSync(companyDbPath) || fs.statSync(companyDbPath).size === 0;
            if (needsInit) {
                const dataDir = path.join(ctx.workspacePath, 'data');
                if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                execFileSync('sqlite3', [companyDbPath, 'SELECT 1;'], { timeout: 5000 });
            }
            return { success: true };
        },
    ];
}

// -----------------------------------------------------------------------------
// ACE Reflection Setup
// -----------------------------------------------------------------------------

export function buildACEReflectionTrigger(
    emitter: StdoutEmitter,
    agentSlug: string,
    gitRepo: GitMemoryRepository,
): ACEReflectionTrigger {
    const aceExtractor = new AceExtractorService();
    const forwarder = createSseForwarder(emitter, agentSlug);

    return new ACEReflectionTrigger({
        reflector: aceExtractor,
        curator: new AcePlaybookCuratorService(gitRepo, agentSlug),
        rateLimiter: createInMemoryRateLimiter(),
        eventEmitter: {
            emit: (event: string, data: unknown) => {
                if (event === 'ace:reflected') {
                    const d = data as Record<string, unknown>;
                    const reflectionType = String(d.type ?? 'session');
                    const content = String(d.entries ?? '');
                    const confidence = Number(d.confidence ?? 0);
                    emitter.aceReflection(agentSlug, reflectionType, content, confidence);
                    forwarder.emit({
                        type: 'self_moderation', execution_id: '',
                        content: {
                            checklist: content ? [content] : [],
                            qualityScore: confidence,
                            passed: true,
                        },
                    });
                } else {
                    emitter.emit({
                        event: 'ace_reflection',
                        agent_slug: agentSlug,
                        data: { event_name: event, payload: data },
                    });
                }
            },
        },
        aceStateRepository: { incrementReflectionCount: async () => {} },
    });
}

// -----------------------------------------------------------------------------
// Session End
// -----------------------------------------------------------------------------

export function buildSessionEndHandlers(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    gitRepo: GitMemoryRepository,
    executor: SandboxCommandExecutor,
    sharedGitMemoryService: GitMemoryService,
    aceReflectionTrigger: ACEReflectionTrigger,
    digestGenerator: DigestGeneratorService,
    crossProjectService: CrossProjectSharingService,
    handlers: HookHandlerMap,
): void {
    const sessionEndHandler = new SessionEndHandler(
        {
            memoryExtractor: new SandboxMemoryExtractor({}),
            gitMemoryService: sharedGitMemoryService,
            aceService: {
                triggerReflection: async (params) => { aceReflectionTrigger.triggerAsync(params); },
            },
            sandboxService: {
                pauseSandbox: async () => ({ success: true }),
                getActiveExecutionCount: () => 0,
            },
            executionSessionRepository: {
                updateSession: async (sessionId: string, update) => {
                    emitter.updateAgentRun(ctx.agentSlug, '', {
                        run_id: sessionId,
                        status: update.status as 'running' | 'completed' | 'failed' | 'cancelled',
                        metadata: update as unknown as Record<string, unknown>,
                    });
                },
            },
            streamHandler: {
                send: (eventType, payload) => {
                    emitter.sseForward(ctx.agentSlug, '', eventType, payload);
                },
            },
            skillSuggester: {
                checkForSkillOpportunity: async () => null,
            },
            drmCompressor: createSandboxDRMCompressor(gitRepo, executor, emitter, ctx.agentSlug),
            activityWriter: {
                appendEntry: async (entry) => {
                    const activityPath = path.join(ctx.workspacePath, 'data', 'activity.jsonl');
                    const dir = path.dirname(activityPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.appendFileSync(activityPath, JSON.stringify(entry) + '\n', 'utf-8');
                },
            },
        },
        {
            agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId,
            workspace_id: ctx.workspaceId, run_id: '', session_start_time: new Date(), is_async_task: false,
        },
    );

    // Capture commit result from sessionEndHandler to gate digest/sharing
    let lastCommitSha = '';

    handlers.SessionEnd = [
        async (input) => {
            const result = await sessionEndHandler.handle(input);
            lastCommitSha = (result as SessionEndHandlerResult).commitSha ?? '';
            return result;
        },
        async () => {
            // Skip digest generation if no commit occurred during session
            if (!lastCommitSha) {
                return { success: true, skipped: true, reason: 'no_commit' };
            }
            await digestGenerator.regenerateAllDigests(ctx.workspaceId);
            return { success: true };
        },
        async () => {
            // Skip cross-project sharing if no commit occurred during session
            if (!lastCommitSha) {
                return { success: true, skipped: true, reason: 'no_commit' };
            }
            await crossProjectService.updateWorkspaceDigestWithCrossProjectInsights(ctx.workspaceId);
            return { success: true };
        },
    ];
}

// -----------------------------------------------------------------------------
// Pre-Compact
// -----------------------------------------------------------------------------

export function buildPreCompactHandler(
    ctx: RuntimeHookContext,
    emitter: StdoutEmitter,
    sharedGitMemoryService: GitMemoryService,
    handlers: HookHandlerMap,
): void {
    const forwarder = createSseForwarder(emitter, ctx.agentSlug);

    const preCompactHandler = new PreCompactHandler(
        {
            memoryExtractor: new SandboxMemoryExtractor({}),
            gitMemoryService: sharedGitMemoryService,
            sseEmitter: forwarder,
        },
        { agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId, workspace_id: ctx.workspaceId, execution_id: '', compaction_count: 0 },
    );
    handlers.PreCompact = [input => preCompactHandler.handle(input)];
}

// -----------------------------------------------------------------------------
// User Prompt Submit
// -----------------------------------------------------------------------------

export function buildUserPromptSubmitHandler(
    ctx: RuntimeHookContext,
    handlers: HookHandlerMap,
): void {
    const sandboxContextBuilder = new SandboxContextBuilder(ctx.workspacePath);
    const userPromptHandler = new UserPromptSubmitHandler(
        {
            contextBuilder: {
                buildContextFiles: (params) => sandboxContextBuilder.buildContextFiles(params),
            },
            workspaceManager: {
                refreshContextIndex: async (agentSlug) => {
                    const contextDir = path.join(ctx.workspacePath, 'context');
                    if (!fs.existsSync(contextDir)) return;
                    const files = scanDirRecursive(contextDir)
                        .filter(f => !f.endsWith('index.md'))
                        .map(f => `- \`${path.relative(ctx.workspacePath, f).replace(/\\/g, '/')}\``);
                    const content = [
                        '# Context Index', '',
                        `Agent: ${agentSlug}`,
                        `Refreshed: ${new Date().toISOString()}`, '',
                        ...files, '',
                    ].join('\n');
                    fs.writeFileSync(path.join(contextDir, 'index.md'), content, 'utf-8');
                },
            },
            aceContextWriter: {
                writeContextFile: async (_options) => {
                    const acePath = path.join(ctx.workspacePath, 'context', 'ace', 'playbook.md');
                    if (fs.existsSync(acePath)) {
                        const content = fs.readFileSync(acePath, 'utf-8');
                        const entryCount = (content.match(/^## /gm) || []).length;
                        return { success: true, file_path: acePath, entries_written: entryCount, cached: true };
                    }
                    return { success: true, file_path: '', entries_written: 0, cached: false };
                },
            },
        },
        { agent_id: ctx.agentId, agent_slug: ctx.agentSlug, user_id: ctx.userId, trigger_type: 'execute', trigger_payload: {} },
    );
    handlers.UserPromptSubmit = [input => userPromptHandler.handle(input)];
}
