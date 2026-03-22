// Workspace Module Exports

export { WorkspaceManager, SandboxFileSystem } from './workspace.manager';
export { WorkspacePaths } from './workspace.paths';
export {
    WORKSPACE_DIRECTORIES,
    AGENT_SUBDIRECTORIES,
    CHANNEL_SUBDIRECTORIES,
    PROJECT_SUBDIRECTORIES,
    WorkspaceOperationResult,
    WorkspaceInfo,
    WorkspaceState,
    AgentWorkspaceInfo,
    ChannelWorkspaceInfo,
    CleanupOptions,
    DEFAULT_CLEANUP_OPTIONS,
    ManifestAppendOptions,
    ManifestReadOptions,
} from './workspace.types';
export { buildAllSoulFiles } from './soul-file-templates';
export type { SoulFileContext, SoulFiles } from './soul-file-templates';
export { generateChannelClaudeMd } from './channel-claude-md.template';
export type { ChannelClaudeMdParams } from './channel-claude-md.template';
export { personalizeWorkspace } from './workspace-personalizer.service';
export type {
    WorkspacePersonalizeOptions,
    WorkspacePersonalizeResult,
} from './workspace-personalizer.service';