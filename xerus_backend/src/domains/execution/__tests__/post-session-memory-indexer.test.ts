// Post-Session Memory Indexer Tests
// Uses in-memory fakes (not jest.mock) per project conventions.

import {
    indexAgentSessionMemory,
    runPostSessionMemoryIndexing,
    type SandboxMemoryReader,
} from '../post-session-memory-indexer';
import type { IndexFileOptions, MemoryIndexer } from '../../memory/git-memory/memory-search-index.service';
import type { PipelineContext, ResolvedExecutionDeps } from '../execution-pipeline.types';
import { PipelineInvariantError } from '../errors';
import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';

// -----------------------------------------------------------------------------
// In-memory fakes (real objects implementing the injected interfaces)
// -----------------------------------------------------------------------------

class FakeMemoryReader implements SandboxMemoryReader {
    constructor(
        private readonly listing: Record<string, string[]>,
        private readonly files: Record<string, string>,
    ) {}

    async listFiles(_sandboxId: string, dirPath: string): Promise<string[]> {
        return this.listing[dirPath] ?? [];
    }

    async readFile(_sandboxId: string, filePath: string): Promise<string> {
        const content = this.files[filePath];
        if (content === undefined) {
            throw new Error(`file not found: ${filePath}`);
        }
        return content;
    }
}

class RecordingIndexer implements MemoryIndexer {
    public readonly calls: IndexFileOptions[] = [];

    async indexFile(options: IndexFileOptions): Promise<void> {
        this.calls.push(options);
    }
}

const ROOT = '/home/daytona';
const AGENT = 'seo-agent';
const AGENT_DIR = `${ROOT}/.memory/agents/${AGENT}`;

// -----------------------------------------------------------------------------
// indexAgentSessionMemory (core)
// -----------------------------------------------------------------------------

describe('indexAgentSessionMemory', () => {
    it('indexes every .md file with the correct relative path, type, scope, and slug', async () => {
        const reader = new FakeMemoryReader(
            { [AGENT_DIR]: ['working.md', 'expertise.md', 'notes.txt', '.gitkeep'] },
            {
                [`${AGENT_DIR}/working.md`]: '# Working\nProgress so far.',
                [`${AGENT_DIR}/expertise.md`]: '# Expertise\nSEO knowledge.',
            },
        );
        const indexer = new RecordingIndexer();

        const result = await indexAgentSessionMemory({
            sandboxId: 'sbx-1',
            workspaceId: 'ws-1',
            agentSlug: AGENT,
            provider: reader,
            indexer,
            workspaceRootPath: ROOT,
        });

        expect(result.indexedFiles).toBe(2);
        expect(indexer.calls).toHaveLength(2);

        expect(indexer.calls[0]).toEqual({
            workspaceId: 'ws-1',
            filePath: 'agents/seo-agent/working.md',
            content: '# Working\nProgress so far.',
            memoryType: 'working',
            scope: 'agent',
            agentSlug: AGENT,
        });
        expect(indexer.calls[1]).toMatchObject({
            filePath: 'agents/seo-agent/expertise.md',
            memoryType: 'expertise',
            scope: 'agent',
        });
    });

    it('skips empty and whitespace-only files', async () => {
        const reader = new FakeMemoryReader(
            { [AGENT_DIR]: ['working.md', 'empty.md', 'blank.md'] },
            {
                [`${AGENT_DIR}/working.md`]: 'real content',
                [`${AGENT_DIR}/empty.md`]: '',
                [`${AGENT_DIR}/blank.md`]: '   \n\t  ',
            },
        );
        const indexer = new RecordingIndexer();

        const result = await indexAgentSessionMemory({
            sandboxId: 'sbx-1',
            workspaceId: 'ws-1',
            agentSlug: AGENT,
            provider: reader,
            indexer,
            workspaceRootPath: ROOT,
        });

        expect(result.indexedFiles).toBe(1);
        expect(indexer.calls.map((c) => c.filePath)).toEqual(['agents/seo-agent/working.md']);
    });

    it('indexes nothing when the agent memory directory has no .md files', async () => {
        const reader = new FakeMemoryReader({ [AGENT_DIR]: ['.gitkeep'] }, {});
        const indexer = new RecordingIndexer();

        const result = await indexAgentSessionMemory({
            sandboxId: 'sbx-1',
            workspaceId: 'ws-1',
            agentSlug: AGENT,
            provider: reader,
            indexer,
            workspaceRootPath: ROOT,
        });

        expect(result.indexedFiles).toBe(0);
        expect(indexer.calls).toHaveLength(0);
    });

    it('indexes nothing when the agent memory directory does not exist', async () => {
        const reader = new FakeMemoryReader({}, {});
        const indexer = new RecordingIndexer();

        const result = await indexAgentSessionMemory({
            sandboxId: 'sbx-1',
            workspaceId: 'ws-1',
            agentSlug: AGENT,
            provider: reader,
            indexer,
            workspaceRootPath: ROOT,
        });

        expect(result.indexedFiles).toBe(0);
        expect(indexer.calls).toHaveLength(0);
    });
});

// -----------------------------------------------------------------------------
// runPostSessionMemoryIndexing (pipeline wrapper)
// -----------------------------------------------------------------------------

describe('runPostSessionMemoryIndexing', () => {
    function makeCtx(agent: unknown, sandboxId: string | null): PipelineContext {
        return { agent, sandboxId } as unknown as PipelineContext;
    }

    it('reads the agent memory dir via the daytona provider and indexes it', async () => {
        const agentDir = `${SANDBOX_CONFIG.workspacePath}/.memory/agents/${AGENT}`;
        const reader = new FakeMemoryReader(
            { [agentDir]: ['working.md'] },
            { [`${agentDir}/working.md`]: 'session progress' },
        );
        const indexer = new RecordingIndexer();
        const deps = {
            memorySearchIndex: indexer,
            sandboxService: { getDaytonaProvider: () => reader },
        } as unknown as ResolvedExecutionDeps;

        await runPostSessionMemoryIndexing(
            makeCtx({ slug: AGENT, workspace_id: 'ws-1' }, 'sbx-1'),
            deps,
        );

        expect(indexer.calls).toHaveLength(1);
        expect(indexer.calls[0]).toMatchObject({
            workspaceId: 'ws-1',
            filePath: 'agents/seo-agent/working.md',
            agentSlug: AGENT,
        });
    });

    it('throws a pipeline invariant error when workspace_id is missing', async () => {
        const deps = { memorySearchIndex: {}, sandboxService: {} } as unknown as ResolvedExecutionDeps;
        await expect(
            runPostSessionMemoryIndexing(makeCtx({ slug: AGENT }, 'sbx-1'), deps),
        ).rejects.toBeInstanceOf(PipelineInvariantError);
    });

    it('throws a pipeline invariant error when sandboxId is missing', async () => {
        const deps = { memorySearchIndex: {}, sandboxService: {} } as unknown as ResolvedExecutionDeps;
        await expect(
            runPostSessionMemoryIndexing(makeCtx({ slug: AGENT, workspace_id: 'ws-1' }, null), deps),
        ).rejects.toBeInstanceOf(PipelineInvariantError);
    });

    it('fails fast with a clear error when OPENAI_API_KEY (memorySearchIndex) is missing', async () => {
        const deps = { memorySearchIndex: null, sandboxService: {} } as unknown as ResolvedExecutionDeps;
        await expect(
            runPostSessionMemoryIndexing(makeCtx({ slug: AGENT, workspace_id: 'ws-1' }, 'sbx-1'), deps),
        ).rejects.toThrow(/OPENAI_API_KEY/);
    });
});
