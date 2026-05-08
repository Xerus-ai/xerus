// Indexing Event Handler
// Handles trigger_indexing events from the runner, routing to the memory search index.

import { logger } from '../../utils/logger';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import type { MemoryType, MemoryScope } from '../memory/memory.types';
import { agentRegistryRepository } from '../agents/agent-registry.repository';

const log = logger('IndexingEventHandler');

export async function handleTriggerIndexing(
    d: Record<string, unknown>, ctx: PipelineContext, deps: ResolvedExecutionDeps,
): Promise<void> {
    if (!deps.memorySearchIndex) {
        logEvent('trigger_indexing', d);
        return;
    }

    const operation = d.operation as string | undefined;
    const contentPath = d.content_path as string | undefined;
    const workspaceId = d.workspace_id as string | undefined;

    if (!contentPath || !workspaceId) {
        log.warn('trigger_indexing: missing content_path or workspace_id');
        return;
    }

    if (operation === 'delete') {
        await deps.memorySearchIndex.removeFileChunks(workspaceId, contentPath);
        log.info('trigger_indexing: deleted chunks', { content_path: contentPath });
        return;
    }

    // Resolve agentId from registry (non-critical — index without it if lookup fails)
    const agentSlug = (d.agent_slug as string) || ctx.agent?.slug;
    let agentId: number | undefined;
    if (agentSlug) {
        try {
            const entry = await agentRegistryRepository.findBySlug(agentSlug, ctx.request.userId);
            agentId = entry?.id;
        } catch (err) {
            log.warn('trigger_indexing: agent registry lookup failed', { agent_slug: agentSlug, error: (err as Error).message });
        }
    }

    // Content included in event (from MemoryIndexer.indexFile)
    const content = d.content as string | undefined;
    if (content) {
        const memoryType = (d.memory_type as MemoryType) || 'working';
        const scope = (d.scope as MemoryScope) || 'agent';

        await deps.memorySearchIndex.indexFile({
            workspaceId,
            filePath: contentPath,
            content,
            memoryType,
            scope,
            agentId,
        });
        log.info('trigger_indexing: indexed', { content_path: contentPath, content_length: content.length, agent_id: agentId });
        return;
    }

    // No content: commit-level trigger. Read file from sandbox if possible.
    if (ctx.sandboxId) {
        const provider = deps.sandboxService.getProvider() as unknown as {
            readFile?: (sandboxId: string, filePath: string) => Promise<string>;
        };
        if (typeof provider.readFile === 'function') {
            const memoryPath = contentPath.startsWith('.memory/') ? contentPath : `.memory/${contentPath}`;
            const fileContent = await provider.readFile(ctx.sandboxId, memoryPath);
            if (fileContent) {
                await deps.memorySearchIndex.indexFile({
                    workspaceId,
                    filePath: contentPath,
                    content: fileContent,
                    memoryType: 'working',
                    scope: 'agent',
                    agentId,
                });
                log.info('trigger_indexing: indexed from sandbox', { content_path: contentPath, agent_id: agentId });
                return;
            }
        }
    }

    logEvent('trigger_indexing', d);
}

function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    log.debug(eventType, { agent_slug: agentSlug, data: d });
}
