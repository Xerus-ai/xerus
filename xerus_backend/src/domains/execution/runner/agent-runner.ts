#!/usr/bin/env node
// Agent Runner - Persistent Process
// Runs inside Daytona sandbox as a long-lived Node.js process
// Reads JSON commands from stdin, writes JSON events to stdout
// Manages multiple agent sessions, heartbeat timers, inbox/channel watchers

import { StdinParser, StdinCommand, ExecuteCommand, ScaffoldAgentCommand, HitlResponseCommand } from './stdin-parser';
import { resolvePause, clearAllPauses } from './hitl-pause-registry';
import { scaffoldAgent } from '../scaffold/scaffold-writer';
import { StdoutEmitter } from './stdout-emitter';
import { SessionManager } from './session-manager';
import { ProcessManager } from './process-manager';
import type { AgentConfig } from './process-manager';
import { InboxWatcher, InboxMessage } from './inbox-watcher';
import { ChannelWatcher, ChannelPost } from './channel-watcher';
import { HeartbeatRunner } from './heartbeat-runner';
import { SANDBOX_CONFIG } from '../sandbox/sandbox.config';
import { createSandboxExecutor, createSandboxFileSystem } from './sandbox-adapters';
import { GitMemoryRepository } from '../../memory/git-memory/git-memory.repository';
import { PreQueryInitializer } from './pre-query-initializer';
import { AgentConfigLoader } from './agent-config-loader';
import { XERUS_MASTER_SLUG } from '../agents/xerus-master.types';

const WORKSPACE_PATH = SANDBOX_CONFIG.workspacePath;

export class AgentRunnerProcess {
    private stdinParser: StdinParser;
    private emitter: StdoutEmitter;
    private sessionManager: SessionManager;
    private processManager: ProcessManager;
    private inboxWatcher: InboxWatcher;
    private channelWatcher: ChannelWatcher;
    private heartbeatRunner: HeartbeatRunner;
    private startTime: number;
    private workspacePath: string;
    private preQueryInit: PreQueryInitializer;
    private configLoader: AgentConfigLoader;

    constructor(workspacePath: string = WORKSPACE_PATH) {
        this.workspacePath = workspacePath;
        this.startTime = Date.now();

        this.stdinParser = new StdinParser();
        this.emitter = new StdoutEmitter();
        this.sessionManager = new SessionManager(workspacePath);
        this.processManager = new ProcessManager(this.sessionManager, this.emitter);
        this.inboxWatcher = new InboxWatcher(workspacePath);
        this.channelWatcher = new ChannelWatcher(workspacePath);
        this.heartbeatRunner = new HeartbeatRunner(workspacePath);
        this.preQueryInit = new PreQueryInitializer(
            new GitMemoryRepository(createSandboxExecutor(), createSandboxFileSystem(), workspacePath),
            workspacePath,
        );
        this.configLoader = new AgentConfigLoader(workspacePath, this.emitter);

        this.wireEventHandlers();
    }

    async start(): Promise<void> {
        // Set up SDK query provider
        this.processManager.setQueryProvider(async () => {
            const sdk = await import('@anthropic-ai/claude-agent-sdk');
            return (opts: Record<string, unknown>) => sdk.query(opts as Parameters<typeof sdk.query>[0]);
        });

        this.stdinParser.start();
        this.inboxWatcher.start();
        this.channelWatcher.start();
        this.heartbeatRunner.start();

        // Signal readiness
        this.emitter.health(0, 0);
    }

    stop(): void {
        this.stdinParser.stop();
        this.inboxWatcher.stop();
        this.channelWatcher.stop();
        this.heartbeatRunner.stop();
    }

    private wireEventHandlers(): void {
        // Stdin commands
        this.stdinParser.on('command', (cmd: StdinCommand) => this.handleCommand(cmd));
        this.stdinParser.on('error', (err: Error) => this.emitter.error(err.message, 'PARSE_ERROR'));
        this.stdinParser.on('close', () => this.stop());

        // Inbox messages -> deliver to agent or start session
        this.inboxWatcher.on('message', (msg: InboxMessage) => this.handleInboxMessage(msg));

        // Channel posts -> emit as agent_message events
        this.channelWatcher.on('post', (post: ChannelPost) => {
            this.emitter.agentMessage(post.agent_slug, post.project, post.channel, post.content);
        });

        // Heartbeat fires -> execute agent with heartbeat prompt
        this.heartbeatRunner.on('fire', async (event: { agent_slug: string; prompt: string }) => {
            this.emitter.heartbeatFired(event.agent_slug);
            try {
                await this.loadAndExecuteAgent(event.agent_slug, event.prompt);
            } catch (error) {
                this.emitter.error(
                    error instanceof Error ? error.message : String(error),
                    'CONFIG_LOAD_ERROR',
                    event.agent_slug,
                );
            }
        });
    }

    private handleCommand(cmd: StdinCommand): void {
        switch (cmd.type) {
            case 'execute':
                this.handleExecute(cmd as ExecuteCommand);
                break;
            case 'message':
                this.handleMessage(cmd);
                break;
            case 'interrupt':
                this.handleInterrupt(cmd);
                break;
            case 'heartbeat':
                this.handleManualHeartbeat(cmd);
                break;
            case 'done':
                this.handleDone(cmd);
                break;
            case 'health':
                this.handleHealth();
                break;
            case 'list_sessions':
                this.handleListSessions();
                break;
            case 'scaffold_agent':
                this.handleScaffoldAgent(cmd as ScaffoldAgentCommand);
                break;
            case 'hitl_response':
                this.handleHitlResponse(cmd as HitlResponseCommand);
                break;
        }
    }

    private async handleExecute(cmd: ExecuteCommand): Promise<void> {
        const agentSlug = cmd.agent_slug;
        if (!agentSlug) {
            this.emitter.error('execute command requires agent_slug', 'INVALID_COMMAND');
            this.emitter.sessionEnded('', '', false, 0);
            return;
        }

        const configOverrides = cmd.config || {};
        let fileConfig: AgentConfig | null;
        try {
            fileConfig = this.configLoader.loadConfig(agentSlug);
        } catch (error) {
            this.emitter.error(
                error instanceof Error ? error.message : String(error),
                'CONFIG_LOAD_ERROR',
                agentSlug,
            );
            this.emitter.sessionEnded(agentSlug, '', false, 0);
            return;
        }

        if (!fileConfig) {
            this.emitter.error(`Agent config not found: ${agentSlug}`, 'AGENT_NOT_FOUND', agentSlug);
            this.emitter.sessionEnded(agentSlug, '', false, 0);
            return;
        }

        // Apply overrides from command
        if (configOverrides.system_prompt) {
            fileConfig.system_prompt = {
                type: 'preset',
                preset: 'claude_code',
                append: String(configOverrides.system_prompt),
            };
        }
        if (configOverrides.model) fileConfig.model = String(configOverrides.model);
        if (configOverrides.tools) fileConfig.tools = configOverrides.tools as string[];
        if (configOverrides.max_turns) fileConfig.max_turns = Number(configOverrides.max_turns);
        if (configOverrides.mcp_servers) fileConfig.mcp_servers = configOverrides.mcp_servers as Record<string, unknown>;
        if (configOverrides.cwd) fileConfig.cwd = String(configOverrides.cwd);

        // Pre-query initialization: workspace + agent readiness
        // Runs BEFORE sdk.query() because SessionStart hook fires too early
        try {
            await this.preQueryInit.ensureWorkspaceReady();
            await this.preQueryInit.ensureAgentReady(agentSlug);
        } catch (error) {
            this.emitter.error(
                `Workspace init failed: ${error instanceof Error ? error.message : String(error)}`,
                'WORKSPACE_INIT_ERROR',
                agentSlug,
            );
            this.emitter.sessionEnded(agentSlug, '', false, 0);
            return;
        }

        this.attachSubagentDefinitions(fileConfig);
        // Fire-and-forget: executeAgent runs the SDK query in the background.
        // The .catch() prevents unhandled promise rejections from crashing the runner.
        this.processManager.executeAgent(fileConfig, cmd.content).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[AgentRunner] Unhandled error in executeAgent for ${agentSlug}: ${errorMessage}`);
            this.emitter.error(errorMessage, 'EXECUTION_ERROR', agentSlug);
            this.emitter.sessionEnded(agentSlug, '', false, 0);
        });
    }

    private async handleMessage(cmd: StdinCommand): Promise<void> {
        const agentSlug = cmd.agent_slug;
        if (!agentSlug || !cmd.content) {
            this.emitter.error('message command requires agent_slug and content', 'INVALID_COMMAND');
            return;
        }

        if (this.processManager.isAgentBusy(agentSlug)) {
            this.processManager.queueMessage(agentSlug, cmd.content);
        } else {
            try {
                await this.loadAndExecuteAgent(agentSlug, cmd.content);
            } catch (error) {
                this.emitter.error(
                    error instanceof Error ? error.message : String(error),
                    'CONFIG_LOAD_ERROR',
                    agentSlug,
                );
            }
        }
    }

    private handleInterrupt(cmd: StdinCommand): void {
        const agentSlug = cmd.agent_slug;
        if (!agentSlug) {
            this.emitter.error('interrupt command requires agent_slug', 'INVALID_COMMAND');
            return;
        }
        try {
            this.processManager.interruptAgent(agentSlug);
            clearAllPauses(new Error(`Session interrupted: ${agentSlug}`));
        } catch (error) {
            this.emitter.error(
                error instanceof Error ? error.message : String(error),
                'INTERRUPT_ERROR',
                agentSlug,
            );
        }
    }

    private async handleManualHeartbeat(cmd: StdinCommand): Promise<void> {
        const agentSlug = cmd.agent_slug;
        if (!agentSlug) {
            this.emitter.error('heartbeat command requires agent_slug', 'INVALID_COMMAND');
            return;
        }

        this.emitter.heartbeatFired(agentSlug);
        try {
            const prompt = cmd.content || '[Heartbeat] Check your inbox, review pending tasks, and continue any in-progress work.';
            await this.loadAndExecuteAgent(agentSlug, prompt);
        } catch (error) {
            this.emitter.error(
                error instanceof Error ? error.message : String(error),
                'CONFIG_LOAD_ERROR',
                agentSlug,
            );
        }
    }

    private handleDone(cmd: StdinCommand): void {
        const agentSlug = cmd.agent_slug;
        if (!agentSlug) {
            this.emitter.error('done command requires agent_slug', 'INVALID_COMMAND');
            return;
        }
        this.processManager.endAgent(agentSlug);
    }

    private handleHealth(): void {
        const uptimeMs = Date.now() - this.startTime;
        this.emitter.health(uptimeMs, this.sessionManager.activeCount());
    }

    private handleListSessions(): void {
        const sessions = this.sessionManager.listSessions().map(s => ({
            agent_slug: s.agent_slug,
            session_id: s.session_id,
            started_at: s.started_at,
            status: s.status,
        }));
        this.emitter.sessionsList(sessions);
    }

    private async handleScaffoldAgent(cmd: ScaffoldAgentCommand): Promise<void> {
        const slug = cmd.agent_slug;
        if (!slug) {
            this.emitter.error('scaffold_agent command requires agent_slug', 'INVALID_COMMAND');
            return;
        }
        if (!cmd.files || cmd.files.length === 0) {
            this.emitter.error('scaffold_agent command requires a non-empty files array', 'INVALID_COMMAND', slug);
            return;
        }

        for (const file of cmd.files) {
            if (!file.path || typeof file.path !== 'string') {
                this.emitter.error('scaffold_agent file missing valid path', 'INVALID_COMMAND', slug);
                return;
            }
            if (typeof file.content !== 'string') {
                this.emitter.error('scaffold_agent file content must be a string', 'INVALID_COMMAND', slug);
                return;
            }
        }

        try {
            const filesWritten = await scaffoldAgent(this.workspacePath, cmd.files);
            this.emitter.scaffoldComplete(slug, filesWritten);
        } catch (error) {
            this.emitter.error(
                `Failed to scaffold agent '${slug}': ${error instanceof Error ? error.message : String(error)}`,
                'SCAFFOLD_ERROR',
                slug,
            );
        }
    }

    private async handleInboxMessage(msg: InboxMessage): Promise<void> {
        const agentSlug = msg.agent_slug;
        const content = `[Inbox Message] New message received:\n\n${msg.content}`;

        if (this.processManager.isAgentBusy(agentSlug)) {
            this.processManager.queueMessage(agentSlug, content);
        } else {
            try {
                await this.loadAndExecuteAgent(agentSlug, content);
            } catch (error) {
                this.emitter.error(
                    error instanceof Error ? error.message : String(error),
                    'CONFIG_LOAD_ERROR',
                    agentSlug,
                );
            }
        }
    }

    private handleHitlResponse(cmd: HitlResponseCommand): void {
        const pauseId = cmd.pause_id;
        if (!pauseId) {
            this.emitter.error('hitl_response command requires pause_id', 'INVALID_COMMAND');
            return;
        }
        const resolved = resolvePause(pauseId, {
            approved: cmd.approved,
            feedback: cmd.feedback,
        });
        if (!resolved) {
            this.emitter.error(`No pending HITL pause found for pause_id=${pauseId}`, 'HITL_NOT_FOUND');
        }
    }

    private attachSubagentDefinitions(config: AgentConfig): void {
        if (config.agent_slug === XERUS_MASTER_SLUG) {
            const subagents = this.configLoader.buildSubagentDefinitions(XERUS_MASTER_SLUG);
            if (Object.keys(subagents).length > 0) {
                config.agents = subagents;
            }
        } else {
            const channelMates = this.configLoader.buildChannelScopedDefinitions(config.agent_slug);
            if (Object.keys(channelMates).length > 0) {
                config.agents = channelMates;
            }
        }
    }

    private async loadAndExecuteAgent(agentSlug: string, prompt: string): Promise<void> {
        await this.preQueryInit.ensureWorkspaceReady();
        await this.preQueryInit.ensureAgentReady(agentSlug);
        const config = this.configLoader.loadConfig(agentSlug);
        if (!config) {
            this.emitter.error(
                `Agent config not found for '${agentSlug}'. Check agents/${agentSlug}/config.json exists.`,
                'AGENT_CONFIG_NOT_FOUND',
                agentSlug,
            );
            return;
        }
        this.attachSubagentDefinitions(config);
        this.processManager.executeAgent(config, prompt);
    }
}

// Main entry point (only runs when executed directly)
if (require.main === module) {
    const runner = new AgentRunnerProcess();
    runner.start().catch((error) => {
        const emitter = new StdoutEmitter();
        emitter.error(
            error instanceof Error ? error.message : String(error),
            'STARTUP_ERROR',
        );
        process.exit(1);
    });

    process.on('SIGTERM', () => runner.stop());
    process.on('SIGINT', () => runner.stop());
}
