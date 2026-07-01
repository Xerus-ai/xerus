// Agent Config Loader
// Reads config.json from workspace, builds soul append, resolves tools + hooks
// Extracted from agent-runner.ts to keep file sizes under 400 lines

import fs from 'fs';
import path from 'path';
import { logger } from '../../../utils/logger';
import { StdoutEmitter } from './stdout-emitter';
import { buildSoulAppend, buildMemoryAppend } from './soul-append-builder';
import { buildHookHandlers } from '../hooks/hooks.registry';
import { buildRuntimeHookHandlers } from './runtime-hook-factory';
import type { HookAgentContext, HookTriggerContext } from '../hooks/hooks.types';
import { AgentConfigLoadError } from '../errors';
import { NATIVE_SDK_TOOLS } from '../types';
import { sanitizeSubagentTools } from '../../platform-tools/orchestrator/tool.filter';
import { DEFAULT_SDK_MODEL } from '../../agents/types';

// Inlined from deleted xerus-master.types.ts
const log = logger('AgentConfigLoader');
const XERUS_MASTER_SLUG = 'xerus-master';
const XERUS_CTO_SLUG = 'xerus-cto';

// Agent configuration types (formerly in process-manager.ts, inlined here as canonical source)
export interface PresetSystemPrompt {
    type: 'preset';
    preset: 'claude_code';
    append?: string;
}

export type SystemPrompt = string | PresetSystemPrompt;

export interface AgentConfig {
    agent_slug: string;
    system_prompt: SystemPrompt;
    model: string;
    tools: string[];
    max_turns: number;
    mcp_servers?: Record<string, unknown>;
    cwd?: string;
    name?: string;
    description?: string;
    domain?: string;
    heartbeat?: Record<string, unknown>;
    hooks?: Record<string, unknown>;
    autonomy_level?: string;
}

export interface SubagentDefinition {
    description: string;
    prompt: string;
    tools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
    maxTurns?: number;
}

function resolveModelAlias(model: string): 'sonnet' | 'opus' | 'haiku' | 'inherit' {
    if (model.includes('sonnet')) return 'sonnet';
    if (model.includes('opus')) return 'opus';
    if (model.includes('haiku')) return 'haiku';
    return 'inherit';
}

// Agent configs live under either `agents/{slug}` or `.claude/agents/{slug}`.
// Try `agents/` first, fall back to `.claude/agents/`.
const AGENT_CONFIG_DIRS = ['agents', '.claude/agents'] as const;

export class AgentConfigLoader {
    private readonly workspacePath: string;
    private readonly emitter: StdoutEmitter;

    constructor(workspacePath: string, emitter: StdoutEmitter) {
        this.workspacePath = workspacePath;
        this.emitter = emitter;
    }

    // Resolve an agent's directory by checking `agents/{slug}` then `.claude/agents/{slug}`.
    // Returns the first directory containing config.json, or null if none exists.
    private resolveAgentDir(agentSlug: string): string | null {
        for (const dir of AGENT_CONFIG_DIRS) {
            const agentDir = path.join(this.workspacePath, dir, agentSlug);
            if (fs.existsSync(path.join(agentDir, 'config.json'))) {
                return agentDir;
            }
        }
        return null;
    }

    loadConfig(agentSlug: string): AgentConfig | null {
        const agentDir = this.resolveAgentDir(agentSlug);
        if (!agentDir) return null;
        const configPath = path.join(agentDir, 'config.json');

        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            const isMaster = agentSlug === XERUS_MASTER_SLUG;
            const isCTO = agentSlug === XERUS_CTO_SLUG;

            // Build soul append (identity + operational protocol) + memory append (prior knowledge)
            const soulAppend = isCTO ? '' : buildSoulAppend(agentDir);
            const memoryAppend = buildMemoryAppend(this.workspacePath, agentSlug);
            const append = [soulAppend, memoryAppend].filter(Boolean).join('\n\n');
            const cwd = this.resolveAgentCwd(agentSlug, parsed);

            // Native SDK tools that every agent needs (Read, Write, etc.)
            // Config tools are MCP/Pipedream app slugs from workspace config.json
            // Merge both so PreToolUse allows native tools + agent-specific MCP tools
            const configTools = Array.isArray(parsed.tools) ? parsed.tools as string[] : [];
            const mergedTools = [...new Set([...NATIVE_SDK_TOOLS, ...configTools])];
            const modelStr = String(parsed.ai_model || parsed.model || DEFAULT_SDK_MODEL).toLowerCase();
            const isAnthropicDirect = modelStr.includes('claude') && !modelStr.includes('openrouter');
            const tools = isAnthropicDirect
                ? mergedTools
                : mergedTools.filter(t => t !== 'WebFetch');

            // Build runtime hook handlers with runner-compatible deps
            const runtimeHandlers = buildRuntimeHookHandlers(
                {
                    agentSlug,
                    userId: String(parsed.user_id || ''),
                    workspacePath: this.workspacePath,
                    workspaceId: String(parsed.workspace_id || ''),
                    agentId: Number(parsed.agent_id) || 0,
                    autonomyLevel: String(parsed.autonomy_level || 'supervised'),
                    tools,
                    isMasterOrchestrator: agentSlug === XERUS_MASTER_SLUG,
                    primaryChannelId: parsed.primary_channel_id as string | undefined,
                },
                this.emitter,
            );

            const agentContext: HookAgentContext = {
                agent_id: agentSlug,
                slug: agentSlug,
                user_id: String(parsed.user_id || ''),
                autonomy_level: String(parsed.autonomy_level || 'supervised'),
                capabilities: { tools },
            };

            const triggerContext: HookTriggerContext = {
                trigger_type: 'execute',
                payload: {},
                team_id: parsed.team_id as string | undefined,
            };

            // CLI-native pivot: CLIs have native hooks. Build handler map for
            // runtime hook factory but skip SDK bridge (deleted in Block 7).
            const handlerMap = buildHookHandlers(agentContext, triggerContext, runtimeHandlers);
            const hooks = Object.keys(handlerMap).length > 0 ? handlerMap : undefined;

            // Xerus master: agent.md IS the full system prompt (no claude_code preset)
            // CTO: bare claude_code preset (no append — pure Claude Code)
            // Other agents: claude_code preset + soul files + agent.md appended
            let system_prompt: SystemPrompt;
            if (isMaster) {
                system_prompt = append;
            } else if (isCTO) {
                system_prompt = { type: 'preset' as const, preset: 'claude_code' as const };
            } else {
                system_prompt = { type: 'preset' as const, preset: 'claude_code' as const, append };
            }

            // Platform MCP tools are NOT served through this config. The CLI
            // inside the sandbox discovers them natively via the workspace
            // .mcp.json (enforced by mcp-config.service.ts), which points the
            // 'platform' server at .xerus/runner/mcp-server.js (uploaded by
            // runner-installer.ts). This marker only mirrors that setup for
            // consumers of AgentConfig.mcp_servers.
            const baseMcpServers = parsed.mcp_servers as Record<string, unknown> | undefined;
            const mcp_servers = isMaster
                ? { ...baseMcpServers, 'platform': { type: 'stdio' } }
                : baseMcpServers;

            return {
                agent_slug: agentSlug,
                system_prompt,
                model: String(parsed.ai_model || parsed.model || DEFAULT_SDK_MODEL),
                tools,
                max_turns: Number(parsed.max_turns) || 50,
                mcp_servers,
                cwd,
                name: parsed.name as string | undefined,
                description: parsed.description as string | undefined,
                domain: parsed.domain as string | undefined,
                heartbeat: parsed.heartbeat as Record<string, unknown> | undefined,
                hooks,
                autonomy_level: String(parsed.autonomy_level || 'supervised'),
            };
        } catch (error) {
            throw new AgentConfigLoadError(
                agentSlug,
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    buildSubagentDefinitions(excludeSlug: string): Record<string, SubagentDefinition> {
        const agentSlugs = this.listAgentSlugs();
        const definitions: Record<string, SubagentDefinition> = {};

        for (const slug of agentSlugs) {
            if (slug === excludeSlug) continue;
            const def = this.readAgentAsDefinition(slug);
            if (def) {
                definitions[slug] = def;
            }
        }

        return definitions;
    }

    buildChannelScopedDefinitions(agentSlug: string): Record<string, SubagentDefinition> {
        const agentDir = this.resolveAgentDir(agentSlug);
        if (!agentDir) return {};
        const configPath = path.join(agentDir, 'config.json');

        let agentChannels: string[];
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            agentChannels = Array.isArray(parsed.channels) ? parsed.channels as string[] : [];
        } catch (error) {
            throw new AgentConfigLoadError(
                agentSlug,
                error instanceof Error ? error.message : String(error),
            );
        }

        if (agentChannels.length === 0) return {};

        const channelSet = new Set(agentChannels);
        const allSlugs = this.listAgentSlugs();
        const definitions: Record<string, SubagentDefinition> = {};

        for (const slug of allSlugs) {
            if (slug === agentSlug) continue;

            const otherDir = this.resolveAgentDir(slug);
            if (!otherDir) continue;
            const otherConfigPath = path.join(otherDir, 'config.json');

            try {
                const raw = fs.readFileSync(otherConfigPath, 'utf-8');
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                const otherChannels = Array.isArray(parsed.channels) ? parsed.channels as string[] : [];

                const sharesChannel = otherChannels.some(ch => channelSet.has(ch));
                if (!sharesChannel) continue;

                const def = this.readAgentAsDefinition(slug);
                if (def) {
                    definitions[slug] = def;
                }
            } catch {
                // Skip agents with unreadable configs
            }
        }

        return definitions;
    }

    private readAgentAsDefinition(slug: string): SubagentDefinition | null {
        const agentDir = this.resolveAgentDir(slug);
        if (!agentDir) return null;
        const configPath = path.join(agentDir, 'config.json');

        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            const soulAppend = buildSoulAppend(agentDir);
            const configTools = Array.isArray(parsed.tools) ? parsed.tools as string[] : [];
            const allTools = [...new Set([...NATIVE_SDK_TOOLS, ...configTools])];
            const tools = sanitizeSubagentTools(allTools);

            return {
                description: String(parsed.description || parsed.name || slug),
                prompt: soulAppend,
                tools,
                model: resolveModelAlias(String(parsed.ai_model || parsed.model || '')),
                maxTurns: Number(parsed.max_turns) || 50,
            };
        } catch (error) {
            log.warn('Skipping agent definition', { slug, error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }

    private listAgentSlugs(): string[] {
        const slugs = new Set<string>();

        for (const dir of AGENT_CONFIG_DIRS) {
            const agentsDir = path.join(this.workspacePath, dir);
            if (!fs.existsSync(agentsDir)) continue;

            const indexPath = path.join(agentsDir, 'index.json');
            if (fs.existsSync(indexPath)) {
                try {
                    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
                    const agents = (index.agents || {}) as Record<string, unknown>;
                    for (const slug of Object.keys(agents)) slugs.add(slug);
                    continue;
                } catch (error) {
                    throw new AgentConfigLoadError(
                        `${dir}/index.json`,
                        error instanceof Error ? error.message : String(error),
                    );
                }
            }

            for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
                if (entry.isDirectory()) slugs.add(entry.name);
            }
        }

        return [...slugs];
    }

    private resolveAgentCwd(agentSlug: string, config: Record<string, unknown>): string {
        if (typeof config.cwd === 'string') {
            return config.cwd;
        }

        if (agentSlug === XERUS_MASTER_SLUG || agentSlug === XERUS_CTO_SLUG) {
            return this.workspacePath;
        }

        // Resolve channel path from domain + channel slug
        const domain = config.domain as string | undefined;
        const channels = config.channels as string[] | undefined;
        const primaryChannel = config.primary_channel as string | undefined;
        const channelSlug = (channels && channels.length > 0) ? channels[0] : primaryChannel;

        if (domain && channelSlug) {
            const channelPath = path.join(
                this.workspacePath, 'projects', domain, 'channels', channelSlug,
            );
            if (fs.existsSync(channelPath)) {
                return channelPath;
            }
        }

        return this.resolveAgentDir(agentSlug)
            ?? path.join(this.workspacePath, 'agents', agentSlug);
    }
}
