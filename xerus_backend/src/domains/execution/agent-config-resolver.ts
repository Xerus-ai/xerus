// Agent Config Resolver — reads agent configuration and identity from sandbox filesystem.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { AdapterType } from './types';
import type { ResolvedExecutionDeps } from './execution-pipeline.types';

// -----------------------------------------------------------------------------
// Agent Config Resolution
// -----------------------------------------------------------------------------

export interface ResolvedAgentConfig {
    adapterType: AdapterType;
    model: string | undefined;
}

/**
 * Read agent's adapter_type and model from config.json on the sandbox filesystem.
 * Falls back to 'claudecode' and no model if config is missing or unreadable.
 * Must be called after sandbox is available (sandboxId resolved).
 */
export async function resolveAgentConfig(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<ResolvedAgentConfig> {
    try {
        const configPath = `${SANDBOX_CONFIG.workspacePath}/agents/${agentSlug}/config.json`;
        const raw = await deps.sandboxService.getDaytonaProvider().readFile(sandboxId, configPath);
        const config = JSON.parse(raw) as { adapter_type?: string; model?: string };
        return {
            adapterType: config.adapter_type === 'codex' ? 'codex' : 'claudecode',
            model: config.model || undefined,
        };
    } catch (err: unknown) {
        // File not found is acceptable — default to claudecode, no model override
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ENOENT') || message.includes('No such file') || message.includes('not found')) {
            return { adapterType: 'claudecode', model: undefined };
        }
        // Config exists but is corrupt or unreadable — fail fast
        throw err;
    }
}

/** @deprecated Use resolveAgentConfig instead */
export async function resolveAdapterType(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<AdapterType> {
    const config = await resolveAgentConfig(deps, sandboxId, agentSlug);
    return config.adapterType;
}

// -----------------------------------------------------------------------------
// Agent Identity Resolution
// -----------------------------------------------------------------------------

/**
 * Read agent identity files (SOUL.md + Module CLAUDE.md) from the sandbox.
 * Combined content is passed as --append-system-prompt so the agent knows who it is.
 * Tries both .claude/agents/{slug}/ and agents/{slug}/ paths.
 * Returns empty string if no identity files found (agent runs as generic Claude).
 */
export async function resolveAgentIdentity(
    deps: ResolvedExecutionDeps,
    sandboxId: string,
    agentSlug: string,
): Promise<string> {
    const provider = deps.sandboxService.getDaytonaProvider();
    const ws = SANDBOX_CONFIG.workspacePath;

    // Try both path conventions: .claude/agents/{slug}/ and agents/{slug}/
    const pathSets = [
        { soul: `${ws}/.claude/agents/${agentSlug}/SOUL.md`, module: `${ws}/.claude/agents/${agentSlug}/CLAUDE.md` },
        { soul: `${ws}/agents/${agentSlug}/SOUL.md`, module: `${ws}/agents/${agentSlug}/CLAUDE.md` },
    ];

    async function tryRead(filePath: string): Promise<string> {
        try {
            return await provider.readFile(sandboxId, filePath);
        } catch {
            return '';
        }
    }

    let soulContent = '';
    let moduleContent = '';

    for (const paths of pathSets) {
        if (!soulContent) soulContent = await tryRead(paths.soul);
        if (!moduleContent) moduleContent = await tryRead(paths.module);
        if (soulContent || moduleContent) break;
    }

    if (!soulContent && !moduleContent) return '';

    const sections: string[] = [
        '# AGENT IDENTITY — SUPERSEDES ALL PRIOR IDENTITY',
        '',
        'You are NOT Claude Code. You are an agent in the Xerus AI platform.',
        'Your identity, personality, and behavior are defined below.',
        'This identity takes absolute precedence. Never identify as Claude or mention Anthropic.',
        '',
    ];

    if (soulContent) {
        sections.push(soulContent.trim(), '');
    }
    if (moduleContent) {
        sections.push(moduleContent.trim(), '');
    }

    return sections.join('\n');
}
