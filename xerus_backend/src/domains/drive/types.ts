// Drive Types
// File tree, workspace status, and editability types for the Workspace Drive feature

export interface FileNode {
    name: string;
    type: 'file' | 'directory';
    path: string;
    size?: number;
    modified?: string;
    children?: FileNode[];
    preview?: string; // First ~500 bytes of text files (for card previews)
}

export interface TreeResponse {
    root: FileNode;
    source: 'daytona';
    depth: number;
}

export interface WorkspaceStatus {
    sandbox_running: boolean;
    sandbox_id: string | null;
}

export type EditabilityStatus = 'editable' | 'read_only' | 'hidden';

export interface FileReadResult {
    path: string;
    content: string;
    source: 'daytona';
    editability: EditabilityStatus;
}

export interface FileWriteResult {
    path: string;
    written: boolean;
}

export interface FileUploadResult {
    path: string;
    size: number;
}

// Workspace Overview — semantic view for the sidebar mental model

export interface ChannelOverview {
    name: string;
    path: string;
    agents: string[];
    deliverables: { file: string; date: string }[];
}

export interface ProjectOverview {
    name: string;
    slug: string;
    path: string;
    channels: ChannelOverview[];
}

export interface DocumentOverview {
    name: string;
    path: string;
}

export interface WorkspaceOverview {
    projects: ProjectOverview[];
    documents: DocumentOverview[];
    activity: { agent: string; file: string; channel: string; date: string }[];
    stats: { agentCount: number; projectCount: number; documentCount: number };
}
