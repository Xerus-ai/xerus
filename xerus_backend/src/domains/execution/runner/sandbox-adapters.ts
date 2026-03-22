// Sandbox Adapters
// Node.js-backed implementations of GitMemoryRepository dependencies.
// Used by runtime-hook-factory.ts to replace memory stubs with real services.
// Runs inside Daytona sandbox where Node.js fs and child_process are available.

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { SandboxCommandExecutor, GitMemoryFileSystem } from '../../memory/git-memory/git-memory.types';
import type { GitMemoryService, DRMCompressor } from '../hooks/session-end.types';
import type { ExtractionResult, LLMClient } from '../../memory/git-memory/memory-extractor.service';
import { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';
import { MemoryFileWriterService } from '../../memory/git-memory/memory-file-writer.service';
import { DRMCompressionService } from '../../memory/git-memory/drm-compression.service';
import type { MemoryIndexer, IndexFileOptions } from '../../memory/git-memory/memory-search-index.service';
import type { StdoutEmitter } from './stdout-emitter';
import { LEGACY_LIGHT_MODEL } from '../../agents/types';

const execAsync = promisify(exec);

// -----------------------------------------------------------------------------
// Sandbox Command Executor (child_process.exec)
// -----------------------------------------------------------------------------

export function createSandboxExecutor(): SandboxCommandExecutor {
    return {
        async exec(command: string, cwd?: string) {
            try {
                const { stdout, stderr } = await execAsync(command, { cwd });
                return { stdout, stderr, exitCode: 0 };
            } catch (e: unknown) {
                const err = e as { stdout?: string; stderr?: string; code?: number };
                // Non-zero exit code: child_process sets err.code to the exit code.
                // Spawn/OS errors (ENOENT, EACCES) don't have stdout/stderr — re-throw them.
                if (err.code === undefined && err.stdout === undefined) {
                    throw e;
                }
                return {
                    stdout: err.stdout || '',
                    stderr: err.stderr || '',
                    exitCode: err.code || 1,
                };
            }
        },
    };
}

// -----------------------------------------------------------------------------
// Sandbox File System (Node.js fs)
// -----------------------------------------------------------------------------

export function createSandboxFileSystem(): GitMemoryFileSystem {
    return {
        async mkdir(p: string) {
            if (!fs.existsSync(p)) {
                fs.mkdirSync(p, { recursive: true });
            }
        },
        async writeFile(p: string, content: string) {
            const dir = path.dirname(p);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(p, content, 'utf-8');
        },
        async readFile(p: string) {
            return fs.readFileSync(p, 'utf-8');
        },
        async exists(p: string) {
            return fs.existsSync(p);
        },
        async tryExclusiveCreate(p: string, content: string) {
            try {
                fs.writeFileSync(p, content, { flag: 'wx' });
                return true;
            } catch (e: unknown) {
                const err = e as { code?: string };
                if (err.code === 'EEXIST') return false;
                throw e;
            }
        },
    };
}

// -----------------------------------------------------------------------------
// Git Memory Service Adapter
// Composes GitMemoryRepository + MemoryFileWriterService into the
// GitMemoryService interface expected by SessionEnd and PreCompact hooks.
//
// Two modes:
// 1. Standalone: creates its own executor/fs/repo (for platform tools, tests)
// 2. Shared: accepts an existing GitMemoryRepository (for hook factory,
//    where SessionStart/SessionEnd/PreCompact share one repo instance)
// -----------------------------------------------------------------------------

export function createGitMemoryServiceAdapter(
    workspacePath: string,
    emitter: StdoutEmitter,
    agentSlug: string,
    sharedGitRepo?: GitMemoryRepository,
): GitMemoryService {
    const gitRepo = sharedGitRepo ?? new GitMemoryRepository(
        createSandboxExecutor(), createSandboxFileSystem(), workspacePath,
    );
    const memoryWriter = new MemoryFileWriterService(gitRepo);

    return {
        async writeAndCommit(params) {
            await gitRepo.initializeRepository();
            await memoryWriter.writeMemories(
                params.memories as ExtractionResult,
                {
                    agentSlug: params.agentSlug,
                    projectSlug: params.projectSlug,
                    channelSlug: params.channelSlug,
                },
            );
            const result = await gitRepo.commitChanges(params.commitMessage);
            return { commitSha: result?.sha || '' };
        },
        triggerIndexing(workspaceId: string, commitSha: string): void {
            // Fire-and-forget: read files from the specific commit and emit
            // individual trigger_indexing events with content included.
            // Uses getFilesInCommit (git show) to get exactly the files in the commit,
            // not getChangedFiles (git diff) which compares against working tree.
            void (async () => {
                try {
                    const changedFiles = await gitRepo.getFilesInCommit(commitSha);
                    for (const filePath of changedFiles) {
                        try {
                            const content = await gitRepo.readFile(filePath);
                            emitTriggerIndexing(emitter, agentSlug, {
                                filePath, workspaceId, content,
                                memoryType: inferMemoryType(filePath),
                                scope: inferMemoryScope(filePath),
                            });
                        } catch (fileErr) {
                            console.error(`[triggerIndexing] Failed to read ${filePath}: ${(fileErr as Error).message}`);
                        }
                    }
                } catch (err) {
                    console.error(`[triggerIndexing] Failed to list changed files: ${(err as Error).message}`);
                }
            })();
        },
    };
}

// -----------------------------------------------------------------------------
// OpenRouter LLM Client (for DRM compression + team memory inside sandbox)
// Uses ANTHROPIC_AUTH_TOKEN env var (OpenRouter key set by buildSDKEnvironment)
// -----------------------------------------------------------------------------

export function createOpenRouterLLMClient(): LLMClient {
    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) {
        throw new Error('ANTHROPIC_AUTH_TOKEN is not set in sandbox environment');
    }

    return {
        async generateJSON<T>(
            systemPrompt: string,
            userPrompt: string,
            options?: { model?: string; maxTokens?: number; temperature?: number },
        ): Promise<T> {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: options?.model || LEGACY_LIGHT_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: options?.maxTokens || 1024,
                    temperature: options?.temperature ?? 0.1,
                    response_format: { type: 'json_object' },
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`OpenRouter LLM request failed (${response.status}): ${errorBody}`);
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('OpenRouter returned empty response');
            }
            return JSON.parse(content) as T;
        },
    };
}

// -----------------------------------------------------------------------------
// Shared trigger_indexing event emitter
// Single source of truth for the event payload shape.
// Used by both triggerIndexing (session-end) and createEmitterMemoryIndexer (DRM).
// -----------------------------------------------------------------------------

interface TriggerIndexingPayload {
    filePath: string;
    workspaceId: string;
    content: string;
    memoryType: string;
    scope: string;
}

function emitTriggerIndexing(
    emitter: StdoutEmitter, agentSlug: string, payload: TriggerIndexingPayload,
): void {
    emitter.emit({
        event: 'trigger_indexing',
        agent_slug: agentSlug,
        data: {
            content_type: 'git-memory',
            content_path: payload.filePath,
            operation: 'index',
            workspace_id: payload.workspaceId,
            content: payload.content,
            memory_type: payload.memoryType,
            scope: payload.scope,
        },
    });
}

// -----------------------------------------------------------------------------
// Emitter-backed Memory Indexer
// Converts indexFile() calls to trigger_indexing stdout events.
// DRMCompressionService calls searchIndex.indexFile() after compression;
// this adapter bridges that call to the backend via StdoutEmitter.
// -----------------------------------------------------------------------------

export function createEmitterMemoryIndexer(
    emitter: StdoutEmitter,
    agentSlug: string,
): MemoryIndexer {
    return {
        async indexFile(options: IndexFileOptions): Promise<void> {
            emitTriggerIndexing(emitter, agentSlug, {
                filePath: options.filePath,
                workspaceId: options.workspaceId,
                content: options.content,
                memoryType: options.memoryType,
                scope: options.scope,
            });
        },
    };
}

// -----------------------------------------------------------------------------
// DRM Compressor Adapter (wires DRMCompressionService to DRMCompressor interface)
// -----------------------------------------------------------------------------

export function createSandboxDRMCompressor(
    gitRepo: GitMemoryRepository,
    executor: SandboxCommandExecutor,
    emitter: StdoutEmitter,
    agentSlug: string,
): DRMCompressor {
    const llmClient = createOpenRouterLLMClient();
    const memoryIndexer = createEmitterMemoryIndexer(emitter, agentSlug);
    const service = new DRMCompressionService(
        gitRepo,
        executor,
        llmClient,
        memoryIndexer,
    );

    return {
        async compressWorkingMemory(options) {
            const results = await service.compressWorkingMemory(options);
            const total = results.reduce((acc, r) => acc + r.entriesCompressed, 0);
            return { entriesCompressed: total };
        },
    };
}

// -----------------------------------------------------------------------------
// Memory file type/scope inference from .memory/ file paths
// Paths follow: agents/{slug}/{type}.md or shared/{type}.md or company/{type}.md
// -----------------------------------------------------------------------------

const MEMORY_TYPE_MAP: Record<string, string> = {
    'working': 'working',
    'episodic': 'expertise',
    'semantic': 'learnings',
    'procedural': 'patterns',
    'digest': 'context',
};

function inferMemoryType(filePath: string): string {
    const basename = path.basename(filePath, '.md');
    return MEMORY_TYPE_MAP[basename] || 'working';
}

function inferMemoryScope(filePath: string): string {
    if (filePath.startsWith('agents/')) return 'agent';
    if (filePath.startsWith('shared/')) return 'user';
    if (filePath.startsWith('company/')) return 'entity';
    return 'agent';
}
