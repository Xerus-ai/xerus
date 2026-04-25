/**
 * Workspace Drive API Module
 * Operations for browsing, reading, and writing workspace files
 */
import { apiCall, getApiHeaders } from './client';

// ---------- Types ----------

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  modified?: string;
  children?: FileNode[];
  preview?: string; // First ~500 bytes of text files (populated by tree endpoint)
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

export interface FileBlobResult {
  path: string;
  blob: Blob;
  source: 'daytona';
  editability: EditabilityStatus;
  contentType: string;
}

// ---------- Overview Types ----------

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

// ---------- API Functions ----------

/**
 * Get the full workspace directory tree
 * @param preview - Whether to include file previews (default: true). Set to false to skip SSH reads.
 */
export async function getTree(depth: number = 3, preview: boolean = true): Promise<TreeResponse> {
  const params = new URLSearchParams({ depth: String(depth) });
  if (!preview) params.set('preview', 'false');
  const response = await apiCall(`/workspace/tree?${params}`, { method: 'GET' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Get semantic workspace overview for sidebar mental model
 */
export async function getWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await apiCall('/workspace/overview', { method: 'GET' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Read a file by workspace-relative path
 */
export async function getFile(filePath: string): Promise<FileReadResult> {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const response = await apiCall(`/workspace/files/${encoded}`, { method: 'GET' });
  return {
    path: response.headers.get('X-Workspace-Path') || filePath,
    content: await response.text(),
    source: 'daytona',
    editability: (response.headers.get('X-Workspace-Editability') as EditabilityStatus) || 'read_only',
  };
}

export async function getFileBlob(filePath: string): Promise<FileBlobResult> {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const response = await apiCall(`/workspace/files/${encoded}`, { method: 'GET' });
  return {
    path: response.headers.get('X-Workspace-Path') || filePath,
    blob: await response.blob(),
    source: 'daytona',
    editability: (response.headers.get('X-Workspace-Editability') as EditabilityStatus) || 'read_only',
    contentType: response.headers.get('Content-Type') || 'application/octet-stream',
  };
}

/**
 * Write content to a file by workspace-relative path
 */
export async function putFile(
  filePath: string,
  content: string,
): Promise<{ path: string; written: boolean }> {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const response = await apiCall(`/workspace/files/${encoded}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Upload a file to a knowledge directory
 */
export async function uploadFile(
  file: File,
  targetPath: string,
): Promise<{ path: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const headers = await getApiHeaders(true); // Exclude Content-Type for FormData

  const response = await apiCall(
    `/workspace/upload?path=${encodeURIComponent(targetPath)}`,
    {
      method: 'POST',
      headers,
      body: formData,
    },
  );
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Get workspace status (sandbox running, storage used)
 */
export async function getStatus(): Promise<WorkspaceStatus> {
  const response = await apiCall('/workspace/status', { method: 'GET' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Download a file by reading its content and triggering a browser download
 */
export async function downloadFile(filePath: string, fileName: string): Promise<void> {
  const result = await getFileBlob(filePath);
  const blob = result.blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Start web terminal in sandbox, returns ttyd URL
 */
export async function startTerminal(): Promise<{ terminal_url: string }> {
  const response = await apiCall('/workspace/terminal', { method: 'POST' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Start browser infrastructure in sandbox, returns noVNC URL
 */
export async function startBrowser(): Promise<{ novnc_url: string }> {
  const response = await apiCall('/workspace/browser', { method: 'POST' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Resolve a Daytona preview URL for a port served from the user's sandbox.
 * Used by the chat artifact viewer to render live app previews.
 */
export async function getPreviewUrl(port: number): Promise<{ port: number; previewUrl: string }> {
  const response = await apiCall('/workspace/preview', {
    method: 'POST',
    body: JSON.stringify({ port }),
  });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Ensure sandbox is running (idempotent - resumes/reconnects/creates as needed)
 */
export async function ensureSandbox(): Promise<WorkspaceStatus> {
  const response = await apiCall('/workspace/ensure', { method: 'POST' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Pause the workspace sandbox
 */
export async function pauseWorkspace(): Promise<void> {
  await apiCall('/workspace/pause', { method: 'POST' });
}

/**
 * Start the workspace sandbox
 */
export async function startWorkspace(): Promise<void> {
  await apiCall('/workspace/start', { method: 'POST' });
}

/**
 * Stop the workspace sandbox
 */
export async function stopWorkspace(): Promise<void> {
  await apiCall('/workspace/stop', { method: 'POST' });
}

/**
 * Trigger a workspace backup
 */
export async function triggerBackup(): Promise<void> {
  await apiCall('/workspace/backup', { method: 'POST' });
}

// ---------- Agent Files ----------

export interface BatchReadResult {
  files: Record<string, string | null>;
  isRunning: boolean;
}

/**
 * Read multiple agent files in a single request (1 DB + 1 SSH instead of N each)
 */
export async function batchReadAgentFiles(
  agentSlug: string,
  fileNames: string[],
): Promise<BatchReadResult> {
  const response = await apiCall(`/execute/agents/${agentSlug}/files/batch`, {
    method: 'POST',
    body: JSON.stringify({ fileNames }),
  });
  const data = await response.json();
  return data.data ?? data;
}

// ---------- Snapshots ----------

export interface SnapshotFile {
  key: string;
  size: number;
  lastModified: string;
  etag?: string;
}

/**
 * Export the entire workspace as a tar.gz download
 */
export async function exportWorkspace(): Promise<void> {
  const response = await apiCall('/workspace/export', { method: 'GET' });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workspace-export-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a workspace tar.gz archive
 */
export async function importWorkspace(file: File): Promise<{ imported: boolean; size: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const headers = await getApiHeaders(true);

  const response = await apiCall('/workspace/import', {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * List available workspace backups
 */
export async function listSnapshots(): Promise<SnapshotFile[]> {
  const response = await apiCall('/workspace/snapshots', { method: 'GET' });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Restore workspace from a backup
 */
export async function restoreFromSnapshot(snapshotKey: string): Promise<{ restored: boolean }> {
  const response = await apiCall('/workspace/restore', {
    method: 'POST',
    body: JSON.stringify({ snapshotKey }),
  });
  const data = await response.json();
  return data.data ?? data;
}

/**
 * Permanently delete a workspace backup
 */
export async function deleteSnapshot(snapshotKey: string): Promise<{ deleted: boolean; snapshotKey: string }> {
  const response = await apiCall('/workspace/snapshots', {
    method: 'DELETE',
    body: JSON.stringify({ snapshotKey }),
  });
  const data = await response.json();
  return data.data ?? data;
}

// ---------- Template Sync ----------

export interface TemplateSyncResult {
  synced: boolean;
  dryRun: boolean;
  updatedPaths: string[];
  skippedPaths: string[];
  durationMs: number;
  branch?: string;
  platformPaths: string[];
}

/**
 * Pull the latest xerus-workspace template into the user's sandbox, overlaying
 * only platform-owned paths. User content (drive/, projects/, .memory/, etc.)
 * is preserved. Pass dryRun=true to preview which paths would change.
 */
export async function syncTemplate(dryRun = false): Promise<TemplateSyncResult> {
  const response = await apiCall('/workspace/sync-template', {
    method: 'POST',
    body: JSON.stringify({ dryRun }),
  });
  const data = await response.json();
  return data.data ?? data;
}
