// Agent Config Loader
// Reads config.json from workspace, builds soul append, resolves tools + hooks
// Extracted from agent-runner.ts to keep file sizes under 400 lines

import fs from 'fs';
import path from 'path';
import { StdoutEmitter } from './stdout-emitter';
import { buildSoulAppend } from './soul-append-builder';
import { buildHookHandlers } from '../hooks/hooks.registry';
import { buildRuntimeHookHandlers } from './runtime-hook-factory';
import type { HookAgentContext, HookTriggerContext } from '../hooks/hooks.types';
import { AgentConfigLoadError } from '../errors';
import { NATIVE_SDK_TOOLS } from '../types';
import { sanitizeSubagentTools } from '../orchestrator/tool.filter';
import { DEFAULT_SDK_MODEL } from '../../agents/types';

// Inlined from deleted xerus-master.types.ts
const XERUS_MASTER_SLUG = 'xerus-master';
const XERUS_CTO_SLUG = 'xerus-cto';

// Inlined from deleted process-manager.ts
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

export class AgentConfigLoader {
    private readonly workspacePath: string;
    private readonly emitter: StdoutEmitter;

    constructor(workspacePath: string, emitter: StdoutEmitter) {
        this.workspacePath = workspacePath;
        this.emitter = emitter;
    }

    loadConfig(agentSlug: string): AgentConfig | null {
        const agentDir = path.join(this.workspacePath, 'agents', agentSlug);
        const configPath = path.join(agentDir, 'config.json');

        if (!fs.existsSync(configPath)) return null;

        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            const isMaster = agentSlug === XERUS_MASTER_SLUG;
            const isCTO = agentSlug === XERUS_CTO_SLUG;

            // Only build soul append for agents that use it (master + domain agents)
            const append = isCTO ? '' : buildSoulAppend(agentDir);
            const cwd = this.resolveAgentCwd(agentSlug, parsed);

            // Native SDK tools that every agent needs (Read, Write, etc.)
            // Config tools are MCP/Pipedream app slugs from workspace config.json
            // Merge both so PreToolUse allows native tools + agent-specific MCP tools
            const configTools = Array.isArray(parsed.tools) ? parsed.tools as string[] : [];
            const tools = [...new Set([...NATIVE_SDK_TOOLS, ...configTools])];

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

            // Auto-inject platform MCP server for master orchestrator.
            // The 'stdio' marker is resolved to an in-process SDK MCP server
            // by ProcessManager.resolveMcpServers() at execution time.
            const baseMcpServers = parsed.mcp_servers as Record<string, unknown> | undefined;
            const mcp_servers = isMaster
                ? { ...baseMcpServers, 'xerus-platform': { type: 'stdio' } }
                : baseMcpServers;

            return {
                agent_slug: agentSlug,
                system_prompt,
                model: String(parsed.model || DEFAULT_SDK_MODEL),
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
        const agentDir = path.join(this.workspacePath, 'agents', agentSlug);
        const configPath = path.join(agentDir, 'config.json');
        if (!fs.existsSync(configPath)) return {};

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

            const otherConfigPath = path.join(this.workspacePath, 'agents', slug, 'config.json');
            if (!fs.existsSync(otherConfigPath)) continue;

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
        const agentDir = path.join(this.workspacePath, 'agents', slug);
        const configPath = path.join(agentDir, 'config.json');
        if (!fs.existsSync(configPath)) return null;

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
                model: resolveModelAlias(String(parsed.model || '')),
                maxTurns: Number(parsed.max_turns) || 50,
            };
        } catch (error) {
            console.warn(
                `[AgentConfigLoader] Skipping agent '${slug}': ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    private listAgentSlugs(): string[] {
        const agentsDir = path.join(this.workspacePath, 'agents');
        if (!fs.existsSync(agentsDir)) return [];

        const indexPath = path.join(agentsDir, 'index.json');

        if (fs.existsSync(indexPath)) {
            try {
                const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
                const agents = (index.agents || {}) as Record<string, unknown>;
                return Object.keys(agents);
            } catch (error) {
                throw new AgentConfigLoadError(
                    'agents/index.json',
                    error instanceof Error ? error.message : String(error),
                );
            }
        }

        return fs.readdirSync(agentsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
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

        return path.join(this.workspacePath, 'agents', agentSlug);
    }
}
