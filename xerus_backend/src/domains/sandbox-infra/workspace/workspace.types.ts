// Workspace Types
// Hierarchical company model: workspace > projects > channels
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 5

// -----------------------------------------------------------------------------
// Workspace Directory Structure (v2 - Hierarchical Company Model)
// Replaces flat agents/{slug}/context/ with projects/{domain}/channels/{channel}/
// -----------------------------------------------------------------------------

export const WORKSPACE_DIRECTORIES = {
    // Root-level directories
    claude: '.claude',
    claudeSettings: '.claude/settings.json',
    claudeSkills: '.claude/skills',
    claudeHooks: '.claude/hooks',
    claudeTeams: '.claude/teams',
    claudeTasks: '.claude/tasks',

    // Agent definitions (source of truth for all agents)
    agents: 'agents',
    agentsIndex: 'agents/index.json',

    // Projects (domains/departments)
    projects: 'projects',

    // Memory (hierarchical git-based)
    memory: '.memory',
    memoryIndex: '.memory/index.md',
    memoryUser: '.memory/user',
    memoryCompany: '.memory/company',
    memoryEntities: '.memory/entities',
    memoryTopics: '.memory/topics',
    memoryProjects: '.memory/projects',
    memoryAgents: '.memory/agents',
    memoryShared: '.memory/shared',
    memoryArchive: '.memory/archive',

    // Marketplace (read-only S3 mount)
    marketplace: 'marketplace',

    // Company-wide data
    data: 'data',

    // Root-level task board (workspace-wide)
    beads: '.beads',
    beadsIssues: '.beads/issues.jsonl',

    // User content
    drive: 'drive',

    // Operational data
    dataActivity: 'data/activity.jsonl',
    dataDashboard: 'data/dashboard',

    // Agent governance rules
    claudeRules: '.claude/rules',
} as const;

// Agent subdirectory structure (under agents/{slug}/)
export const AGENT_SUBDIRECTORIES = {
    claudeMd: 'CLAUDE.md',
    config: 'config.json',
    heartbeat: 'HEARTBEAT.md',
    inbox: 'inbox',
    inboxProcessed: 'inbox/processed',
    knowledge: 'knowledge',
    soul: 'SOUL.md',
    status: 'STATUS.md',
    user: 'USER.md',
    relationships: 'RELATIONSHIPS.md',
    bootstrap: 'BOOTSTRAP.md',
    operating: 'OPERATING.md',
    playbooks: 'playbooks',
    data: 'data',
} as const;

// Channel subdirectory structure (under projects/{domain}/channels/{channel}/)
export const CHANNEL_SUBDIRECTORIES = {
    claudeMd: 'CLAUDE.md',
    claudeSkills: '.claude/skills',
    beads: '.beads/issues.jsonl',
    beadsDir: '.beads',
    data: 'data',
    output: 'output',
    outputPosts: 'output/posts.jsonl',
    outputDeliverables: 'output/deliverables',
    scratch: 'scratch',
} as const;

// Project subdirectory structure (under projects/{domain}/)
export const PROJECT_SUBDIRECTORIES = {
    claudeMd: 'CLAUDE.md',
    standup: 'standup.md',
    data: 'data',
    knowledge: 'knowledge',
    channels: 'channels',
} as const;

// -----------------------------------------------------------------------------
// Workspace Operation Result
// -----------------------------------------------------------------------------

export interface WorkspaceOperationResult {
    success: boolean;
    path: string;
    message?: string;
    createdDirectories?: string[];
    createdFiles?: string[];
    failures?: string[];
}

// -----------------------------------------------------------------------------
// Workspace State
// -----------------------------------------------------------------------------

export interface WorkspaceState {
    userId: string;
    basePath: string;
    initialized: boolean;
    lastActivityAt: Date;
}

// -----------------------------------------------------------------------------
// Workspace Info (for status queries)
// -----------------------------------------------------------------------------

export interface WorkspaceInfo {
    basePath: string;
    paths: {
        root: string;
        agents: string;
        projects: string;
        memory: string;
        drive: string;
        marketplace: string;
        data: string;
        claude: string;
    };
    initialized: boolean;
}

// -----------------------------------------------------------------------------
// Agent Workspace Info
// -----------------------------------------------------------------------------

export interface AgentWorkspaceInfo {
    agentSlug: string;
    paths: {
        root: string;
        claudeMd: string;
        config: string;
        heartbeat: string;
        inbox: string;
        inboxProcessed: string;
        knowledge: string;
        soul: string;
        status: string;
        user: string;
        relationships: string;
        bootstrap: string;
    };
    initialized: boolean;
}

// -----------------------------------------------------------------------------
// Channel Workspace Info
// -----------------------------------------------------------------------------

export interface ChannelWorkspaceInfo {
    domain: string;
    channel: string;
    paths: {
        root: string;
        claudeMd: string;
        claudeSkills: string;
        beads: string;
        data: string;
        output: string;
        outputPosts: string;
        outputDeliverables: string;
        scratch: string;
    };
    initialized: boolean;
}

// -----------------------------------------------------------------------------
// Manifest Operations (kept from v1 - still used per-channel)
// -----------------------------------------------------------------------------

export interface ManifestAppendOptions {
    entry: Omit<import('../../execution/types').ManifestEntry, 'ts' | 'step'>;
    currentStep?: number;
}

export interface ManifestReadOptions {
    limit?: number;
    offset?: number;
    type?: import('../../execution/types').ManifestEntry['type'];
}

// -----------------------------------------------------------------------------
// Cleanup Options
// -----------------------------------------------------------------------------

export interface CleanupOptions {
    keepOutputs: boolean;
    keepData: boolean;
}

export const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
    keepOutputs: true,
    keepData: true,
};
