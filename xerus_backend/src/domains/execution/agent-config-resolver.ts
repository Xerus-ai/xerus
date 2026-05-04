// Agent Config Resolver — reads agent configuration and identity from sandbox filesystem.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { AdapterType } from './types';
import type { ResolvedExecutionDeps } from './execution-pipeline.types';
import { parseAgentYamlFields } from '../../shared/agent-yaml-parser';

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
    const provider = deps.sandboxService.getDaytonaProvider();
    const ws = SANDBOX_CONFIG.workspacePath;

    // Try agent.yaml (gitagent-protocol) first, fall back to config.json
    try {
        const yamlPath = `${ws}/agents/${agentSlug}/agent.yaml`;
        const raw = await provider.readFile(sandboxId, yamlPath);
        const fields = parseAgentYamlFields(raw);
        return {
            adapterType: fields.adapter_type === 'codex' ? 'codex' : 'claudecode',
            model: fields.preferred?.trim() || undefined,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('ENOENT') && !message.includes('No such file') && !message.includes('not found')) {
            throw err;
        }
    }

    const configPaths = [
        `${ws}/agents/${agentSlug}/config.json`,
        `${ws}/.claude/agents/${agentSlug}/config.json`,
    ];

    for (const configPath of configPaths) {
        try {
            const raw = await provider.readFile(sandboxId, configPath);
            const config = JSON.parse(raw) as { adapter_type?: string; model?: string; ai_model?: string };
            return {
                adapterType: config.adapter_type === 'codex' ? 'codex' : 'claudecode',
                model: config.ai_model || config.model || undefined,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('ENOENT') || message.includes('No such file') || message.includes('not found')) {
                continue;
            }
            throw err;
        }
    }

    return { adapterType: 'claudecode', model: undefined };
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

    async function tryRead(filePath: string): Promise<string> {
        try {
            return await provider.readFile(sandboxId, filePath);
        } catch {
            return '';
        }
    }

    // Try both path conventions: .claude/agents/{slug}/ and agents/{slug}/
    const pathSets = [
        `${ws}/.claude/agents/${agentSlug}`,
        `${ws}/agents/${agentSlug}`,
    ];

    let soulContent = '';
    let moduleContent = '';
    let rulesContent = '';
    let operatingContent = '';

    for (const base of pathSets) {
        if (!soulContent) soulContent = await tryRead(`${base}/SOUL.md`);
        if (!moduleContent) moduleContent = await tryRead(`${base}/CLAUDE.md`);
        if (!rulesContent) rulesContent = await tryRead(`${base}/RULES.md`);
        if (!operatingContent) operatingContent = await tryRead(`${base}/OPERATING.md`);
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
    if (rulesContent) {
        sections.push(rulesContent.trim(), '');
    }
    if (operatingContent) {
        sections.push(operatingContent.trim(), '');
    }
    if (moduleContent) {
        sections.push(moduleContent.trim(), '');
    }

    return sections.join('\n');
}
