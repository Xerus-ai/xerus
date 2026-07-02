// Post-Session Memory Indexer
// After an agent session completes, reads the agent's .memory/agents/{slug}/*.md
// files from the sandbox and indexes them into memory_search_index (pgvector),
// so the agent detail page can surface them.
//
// This is the backend consumer that closes the git-memory -> Neon search-index
// pipeline on the live shell-hook path: the runner's session-end.sh commits the
// .memory git repo, and this consumer (invoked from handleSessionCompleted) reads
// those files back and embeds them. Repeated runs are idempotent — the indexer
// skips chunks whose content_hash is unchanged.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import { PipelineInvariantError } from './errors';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { inferMemoryType, inferMemoryScope } from '../memory/git-memory/memory-path-inference';
import type { MemoryIndexer } from '../memory/git-memory/memory-search-index.service';
import type { MemoryType, MemoryScope } from '../memory/memory.types';

const log = logger('PostSessionMemoryIndexer');

/** Minimal sandbox filesystem surface needed to read agent memory files. */
export interface SandboxMemoryReader {
    listFiles(sandboxId: string, dirPath: string): Promise<string[]>;
    readFile(sandboxId: string, filePath: string): Promise<string>;
}

export interface IndexAgentSessionMemoryParams {
    sandboxId: string;
    workspaceId: string;
    agentSlug: string;
    provider: SandboxMemoryReader;
    indexer: MemoryIndexer;
    workspaceRootPath: string;
}

/**
 * Read every .md file under .memory/agents/{slug}/ in the sandbox and index it
 * into memory_search_index. Returns the number of files indexed. Empty files are
 * skipped; unchanged chunks are deduplicated by the indexer's content_hash check.
 */
export async function indexAgentSessionMemory(
    params: IndexAgentSessionMemoryParams,
): Promise<{ indexedFiles: number }> {
    const { sandboxId, workspaceId, agentSlug, provider, indexer, workspaceRootPath } = params;

    const relativeDir = `agents/${agentSlug}`;
    const absoluteDir = `${workspaceRootPath}/.memory/${relativeDir}`;

    const entries = await provider.listFiles(sandboxId, absoluteDir);
    const memoryFiles = entries.filter((name) => name.endsWith('.md'));

    let indexedFiles = 0;
    for (const fileName of memoryFiles) {
        const content = await provider.readFile(sandboxId, `${absoluteDir}/${fileName}`);
        if (!content || content.trim().length === 0) {
            continue;
        }
        const relativePath = `${relativeDir}/${fileName}`;
        await indexer.indexFile({
            workspaceId,
            filePath: relativePath,
            content,
            memoryType: inferMemoryType(relativePath) as MemoryType,
            scope: inferMemoryScope(relativePath) as MemoryScope,
            agentSlug,
        });
        indexedFiles++;
    }

    return { indexedFiles };
}

/**
 * Pipeline entry point: resolve deps/context and index the agent's memory after a
 * session completes. Fails fast (throws) when required pipeline state or the
 * pgvector indexer (OPENAI_API_KEY) is missing, so callers log the failure loudly
 * instead of silently skipping indexing.
 */
export async function runPostSessionMemoryIndexing(
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
): Promise<void> {
    const agentSlug = ctx.agent?.slug;
    const workspaceId = ctx.agent?.workspace_id;
    const sandboxId = ctx.sandboxId;
    if (!agentSlug || !workspaceId || !sandboxId) {
        throw new PipelineInvariantError(
            'post-session memory indexing: missing agentSlug, workspaceId, or sandboxId',
        );
    }
    if (!deps.memorySearchIndex) {
        throw new Error(
            'Post-session memory indexing requires OPENAI_API_KEY: memorySearchIndex is not initialized. ' +
            'Set OPENAI_API_KEY in the backend environment to enable pgvector memory indexing.',
        );
    }

    const provider = deps.sandboxService.getDaytonaProvider();
    const { indexedFiles } = await indexAgentSessionMemory({
        sandboxId,
        workspaceId,
        agentSlug,
        provider,
        indexer: deps.memorySearchIndex,
        workspaceRootPath: SANDBOX_CONFIG.workspacePath,
    });

    log.info('post-session memory indexed', { agent_slug: agentSlug, files_indexed: indexedFiles });
}
