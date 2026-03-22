// Workspace Manager
// Manages hierarchical workspace: workspace > projects > channels
// Path resolution inherited from WorkspacePaths
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 5

import {
    WORKSPACE_DIRECTORIES,
    AGENT_SUBDIRECTORIES,
    CHANNEL_SUBDIRECTORIES,
    PROJECT_SUBDIRECTORIES,
    WorkspaceOperationResult,
    WorkspaceInfo,
    AgentWorkspaceInfo,
    ChannelWorkspaceInfo,
    CleanupOptions,
    DEFAULT_CLEANUP_OPTIONS,
} from './workspace.types';
import { WorkspacePaths } from './workspace.paths';

// -----------------------------------------------------------------------------
// Sandbox File System Interface
// Abstracts file operations for both real Daytona sandbox and testing
// -----------------------------------------------------------------------------

export interface SandboxFileSystem {
    mkdir(path: string): Promise<void>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    rm(path: string, options?: { recursive?: boolean }): Promise<void>;
    list(path: string): Promise<string[]>;
    listRecursive?(path: string, maxDepth: number): Promise<string[]>;
}

// -----------------------------------------------------------------------------
// Workspace Manager
// -----------------------------------------------------------------------------

export class WorkspaceManager extends WorkspacePaths {
    private readonly sandboxFs: SandboxFileSystem;

    constructor(sandboxFs: SandboxFileSystem, basePath?: string) {
        super(basePath);
        this.sandboxFs = sandboxFs;
    }

    // -------------------------------------------------------------------------
    // Directory Creation with Error Collection
    // -------------------------------------------------------------------------

    private async createDirectories(
        directories: string[],
        label: string,
        rootPath: string
    ): Promise<WorkspaceOperationResult> {
        const createdDirectories: string[] = [];
        const failures: string[] = [];

        for (const dir of directories) {
            try {
                await this.sandboxFs.mkdir(dir);
                createdDirectories.push(dir);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`${dir}: ${message}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(
                `${label} partially failed (${failures.length}/${directories.length} dirs failed):\n${failures.join('\n')}`
            );
        }

        return {
            success: true,
            path: rootPath,
            createdDirectories,
        };
    }

    // -------------------------------------------------------------------------
    // Agent Scaffold (under agents/{slug}/)
    // -------------------------------------------------------------------------

    async scaffoldAgent(agentSlug: string): Promise<WorkspaceOperationResult> {
        const agentRoot = this.getAgentPath(agentSlug);
        return this.createDirectories([
            agentRoot,
            `${agentRoot}/${AGENT_SUBDIRECTORIES.inbox}`,
            `${agentRoot}/${AGENT_SUBDIRECTORIES.inboxProcessed}`,
            `${agentRoot}/${AGENT_SUBDIRECTORIES.knowledge}`,
            this.getAgentMemoryPath(agentSlug),
        ], 'Agent scaffold', agentRoot);
    }

    // -------------------------------------------------------------------------
    // Project Scaffold (under projects/{domain}/)
    // -------------------------------------------------------------------------

    async scaffoldProject(domain: string): Promise<WorkspaceOperationResult> {
        const projectRoot = this.getProjectPath(domain);
        return this.createDirectories([
            projectRoot,
            `${projectRoot}/${PROJECT_SUBDIRECTORIES.data}`,
            `${projectRoot}/${PROJECT_SUBDIRECTORIES.knowledge}`,
            `${projectRoot}/${PROJECT_SUBDIRECTORIES.channels}`,
            `${this.resolve(WORKSPACE_DIRECTORIES.memoryProjects)}/${domain}`,
        ], 'Project scaffold', projectRoot);
    }

    // -------------------------------------------------------------------------
    // Channel Scaffold (under projects/{domain}/channels/{channel}/)
    // -------------------------------------------------------------------------

    async scaffoldChannel(
        domain: string,
        channel: string
    ): Promise<WorkspaceOperationResult> {
        const channelRoot = this.getChannelPath(domain, channel);
        return this.createDirectories([
            channelRoot,
            `${channelRoot}/${CHANNEL_SUBDIRECTORIES.beadsDir}`,
            `${channelRoot}/${CHANNEL_SUBDIRECTORIES.data}`,
            `${channelRoot}/${CHANNEL_SUBDIRECTORIES.output}`,
            `${channelRoot}/${CHANNEL_SUBDIRECTORIES.outputDeliverables}`,
            `${channelRoot}/${CHANNEL_SUBDIRECTORIES.scratch}`,
        ], 'Channel scaffold', channelRoot);
    }

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    async cleanupChannel(
        domain: string,
        channel: string,
        options: CleanupOptions = DEFAULT_CLEANUP_OPTIONS
    ): Promise<WorkspaceOperationResult> {
        const channelRoot = this.getChannelPath(domain, channel);
        const removedPaths: string[] = [];

        // Always clean scratch
        const scratchPath = `${channelRoot}/${CHANNEL_SUBDIRECTORIES.scratch}`;
        if (await this.sandboxFs.exists(scratchPath)) {
            await this.sandboxFs.rm(scratchPath, { recursive: true });
            await this.sandboxFs.mkdir(scratchPath);
            removedPaths.push(scratchPath);
        }

        if (!options.keepOutputs) {
            const outputPath = `${channelRoot}/${CHANNEL_SUBDIRECTORIES.output}`;
            if (await this.sandboxFs.exists(outputPath)) {
                await this.sandboxFs.rm(outputPath, { recursive: true });
                await this.sandboxFs.mkdir(outputPath);
                await this.sandboxFs.mkdir(
                    `${channelRoot}/${CHANNEL_SUBDIRECTORIES.outputDeliverables}`
                );
                removedPaths.push(outputPath);
            }
        }

        if (!options.keepData) {
            const dataPath = `${channelRoot}/${CHANNEL_SUBDIRECTORIES.data}`;
            if (await this.sandboxFs.exists(dataPath)) {
                await this.sandboxFs.rm(dataPath, { recursive: true });
                await this.sandboxFs.mkdir(dataPath);
                removedPaths.push(dataPath);
            }
        }

        return {
            success: true,
            path: channelRoot,
            message: `Cleaned up ${removedPaths.length} paths`,
            createdDirectories: removedPaths,
        };
    }

    // -------------------------------------------------------------------------
    // Info Queries
    // -------------------------------------------------------------------------

    async getWorkspaceInfo(): Promise<WorkspaceInfo> {
        const agentsPath = this.getAgentsPath();
        const initialized = await this.sandboxFs.exists(agentsPath);

        return {
            basePath: this.basePath,
            paths: {
                root: this.basePath,
                agents: agentsPath,
                projects: this.getProjectsPath(),
                memory: this.getMemoryPath(),
                shared: this.getSharedPath(),
                marketplace: this.getMarketplacePath(),
                data: this.getDataPath(),
                claude: this.getClaudePath(),
            },
            initialized,
        };
    }

    async getAgentInfo(agentSlug: string): Promise<AgentWorkspaceInfo> {
        const root = this.getAgentPath(agentSlug);
        const initialized = await this.sandboxFs.exists(root);

        return {
            agentSlug,
            paths: {
                root,
                claudeMd: this.agentFile(agentSlug, 'claudeMd'),
                config: this.agentFile(agentSlug, 'config'),
                heartbeat: this.agentFile(agentSlug, 'heartbeat'),
                inbox: this.agentFile(agentSlug, 'inbox'),
                inboxProcessed: this.agentFile(agentSlug, 'inboxProcessed'),
                knowledge: this.agentFile(agentSlug, 'knowledge'),
                soul: this.agentFile(agentSlug, 'soul'),
                status: this.agentFile(agentSlug, 'status'),
                user: this.agentFile(agentSlug, 'user'),
                relationships: this.agentFile(agentSlug, 'relationships'),
                bootstrap: this.agentFile(agentSlug, 'bootstrap'),
            },
            initialized,
        };
    }

    async getChannelInfo(
        domain: string,
        channel: string
    ): Promise<ChannelWorkspaceInfo> {
        const root = this.getChannelPath(domain, channel);
        const initialized = await this.sandboxFs.exists(root);

        return {
            domain,
            channel,
            paths: {
                root,
                claudeMd: this.channelFile(domain, channel, 'claudeMd'),
                claudeSkills: this.channelFile(domain, channel, 'claudeSkills'),
                beads: this.channelFile(domain, channel, 'beads'),
                data: this.channelFile(domain, channel, 'data'),
                output: this.channelFile(domain, channel, 'output'),
                outputPosts: this.channelFile(domain, channel, 'outputPosts'),
                outputDeliverables: this.channelFile(domain, channel, 'outputDeliverables'),
                scratch: this.channelFile(domain, channel, 'scratch'),
            },
            initialized,
        };
    }
}
