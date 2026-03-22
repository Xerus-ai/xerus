// Workspace Paths v2
// Pure path resolution for hierarchical workspace: workspace > projects > channels
// Used by WorkspaceManager for scaffold operations and by other services for path lookups
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 5

import { SANDBOX_CONFIG } from '../sandbox/sandbox.config';
import {
    WORKSPACE_DIRECTORIES,
    AGENT_SUBDIRECTORIES,
    CHANNEL_SUBDIRECTORIES,
    PROJECT_SUBDIRECTORIES,
} from './workspace.types';

export class WorkspacePaths {
    protected readonly basePath: string;

    constructor(basePath?: string) {
        this.basePath = basePath || SANDBOX_CONFIG.workspacePath;
    }

    // -------------------------------------------------------------------------
    // Root-Level Path Helpers
    // -------------------------------------------------------------------------

    getBasePath(): string {
        return this.basePath;
    }

    getAgentsPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.agents);
    }

    getProjectsPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.projects);
    }

    getMemoryPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.memory);
    }

    getSharedPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.shared);
    }

    getSharedKnowledgePath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.sharedKnowledge);
    }

    getSharedInboxPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.sharedInbox);
    }

    getSharedOfficePath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.sharedOffice);
    }

    getSharedStandupPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.sharedStandup);
    }

    getMarketplacePath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.marketplace);
    }

    getDataPath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.data);
    }

    getClaudePath(): string {
        return this.resolve(WORKSPACE_DIRECTORIES.claude);
    }

    // -------------------------------------------------------------------------
    // Entity Base Paths
    // -------------------------------------------------------------------------

    getAgentPath(agentSlug: string): string {
        return `${this.resolve(WORKSPACE_DIRECTORIES.agents)}/${agentSlug}`;
    }

    getAgentMemoryPath(agentSlug: string): string {
        return `${this.resolve(WORKSPACE_DIRECTORIES.memoryAgents)}/${agentSlug}`;
    }

    getProjectPath(domain: string): string {
        return `${this.resolve(WORKSPACE_DIRECTORIES.projects)}/${domain}`;
    }

    getProjectChannelsPath(domain: string): string {
        return `${this.getProjectPath(domain)}/${PROJECT_SUBDIRECTORIES.channels}`;
    }

    getChannelPath(domain: string, channel: string): string {
        return `${this.getProjectChannelsPath(domain)}/${channel}`;
    }

    // -------------------------------------------------------------------------
    // Generic Sub-Path Lookups (type-safe via keyof)
    // -------------------------------------------------------------------------

    agentFile(agentSlug: string, key: keyof typeof AGENT_SUBDIRECTORIES): string {
        return `${this.getAgentPath(agentSlug)}/${AGENT_SUBDIRECTORIES[key]}`;
    }

    projectFile(domain: string, key: keyof typeof PROJECT_SUBDIRECTORIES): string {
        return `${this.getProjectPath(domain)}/${PROJECT_SUBDIRECTORIES[key]}`;
    }

    channelFile(domain: string, channel: string, key: keyof typeof CHANNEL_SUBDIRECTORIES): string {
        return `${this.getChannelPath(domain, channel)}/${CHANNEL_SUBDIRECTORIES[key]}`;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    protected resolve(relativePath: string): string {
        return `${this.basePath}/${relativePath}`;
    }
}
