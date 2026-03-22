// Indexing Event Handler
// Handles trigger_indexing events from the runner, routing to the memory search index.

import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';
import type { MemoryType, MemoryScope } from '../memory/memory.types';
import { EVENT_ROUTER_LOG_PREFIX } from './runner-event-router';

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
        console.warn(`${EVENT_ROUTER_LOG_PREFIX} trigger_indexing: missing content_path or workspace_id`);
        return;
    }

    if (operation === 'delete') {
        await deps.memorySearchIndex.removeFileChunks(workspaceId, contentPath);
        console.log(`${EVENT_ROUTER_LOG_PREFIX} trigger_indexing: deleted chunks for ${contentPath}`);
        return;
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
        });
        console.log(`${EVENT_ROUTER_LOG_PREFIX} trigger_indexing: indexed ${contentPath} (${content.length} chars)`);
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
                });
                console.log(`${EVENT_ROUTER_LOG_PREFIX} trigger_indexing: indexed ${contentPath} from sandbox`);
                return;
            }
        }
    }

    logEvent('trigger_indexing', d);
}

function logEvent(eventType: string, d: Record<string, unknown>): void {
    const agentSlug = d.agent_slug || '';
    console.log(`${EVENT_ROUTER_LOG_PREFIX} ${eventType}: agent=${agentSlug} data=${JSON.stringify(d)}`);
}
