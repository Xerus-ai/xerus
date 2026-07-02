// Drive Service
// Daytona-only file operations for the Workspace Drive feature

import path from 'path';
import {
    SandboxService,
    SANDBOX_CONFIG,
    createWorkspaceTar,
    restoreWorkspaceTar,
    syncWorkspaceTemplate,
    listPlatformOverlayPaths,
} from '../sandbox-infra';
import type { DaytonaProvider, WorkspaceTemplateSyncResult } from '../sandbox-infra';
import { personalizeWorkspace } from '../sandbox-infra/workspace/workspace-personalizer.service';
import { isHidden } from './editability';
import { buildWorkspaceOverview } from './workspace-overview';
import {
    loadProjectMap,
    loadDeliverablesDeep,
    injectDeliverablesProjection,
    resolveVirtualDeliverablePath,
    type ProjectMap,
} from './deliverables-projection';
import type { FileNode, TreeResponse, WorkspaceStatus, WorkspaceOverview } from './types';
import type { SandboxOperationResult, SandboxSession } from '../sandbox-infra';
import type { S3BackupService, BackupResult } from '../sandbox-infra/storage/s3-backup.service';
import type { StorageFile } from '../sandbox-infra/storage/storage.types';
import { shellEscapePath } from '../../utils/shell-safety';
import { logger } from '../../utils/logger';
import { DrivePlanLifecycleService } from './drive-plan-lifecycle.service';
import type { WorkspaceUsageResult } from './drive-plan-lifecycle.service';

const log = logger('DriveService');

export { WorkspaceUsageResult } from './drive-plan-lifecycle.service';

export class DriveService {
    private planLifecycle: DrivePlanLifecycleService;

    constructor(
        private readonly sandboxService: SandboxService,
        private readonly backupService?: S3BackupService,
    ) {
        this.planLifecycle = new DrivePlanLifecycleService(sandboxService, sandboxService.getDatabase(), backupService);
    }

    // Ensure the user's workspace sandbox is available for file operations.
    private async resolveSandboxId(userId: string): Promise<string> {
        const sandbox = await this.sandboxService.getOrCreateSandbox({ userId });
        return sandbox.sandboxId;
    }

    // GET /workspace/tree - recursive directory listing with optional file previews
    async getTree(userId: string, depth: number, skipPreviews = false): Promise<TreeResponse> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const rootPath = SANDBOX_CONFIG.workspacePath;
        const files = await provider.listFilesRecursive(sandboxId, rootPath, depth);
        const root = this.buildTreeFromDaytona(files, rootPath, depth);

        // Surface agent deliverables under drive/<Project Name>/ so users see one unified view.
        // Real files stay at projects/<slug>/channels/<slug>/output/deliverables/ — projection is
        // read-only; writes go to the real filesystem (per-channel organization is preserved for agents).
        await this.projectDeliverablesIntoTree(root, sandboxId, provider);

        if (!skipPreviews) {
            // Populate previews for text files (first 500 bytes)
            await this.populatePreviewsDaytona(root, sandboxId, provider);
        }

        return { root, source: 'daytona', depth };
    }

    // Cache the project map per sandbox for a short window — a single /workspace/tree call
    // can trigger downstream getFile calls that need to reverse-resolve virtual paths.
    private projectMapCache = new Map<string, { map: ProjectMap; expiresAt: number }>();
    private static readonly PROJECT_MAP_TTL_MS = 10_000;

    private async getProjectMap(sandboxId: string, provider: DaytonaProvider): Promise<ProjectMap> {
        const now = Date.now();
        const cached = this.projectMapCache.get(sandboxId);
        if (cached && cached.expiresAt > now) return cached.map;
        const map = await loadProjectMap(provider, sandboxId);
        this.projectMapCache.set(sandboxId, { map, expiresAt: now + DriveService.PROJECT_MAP_TTL_MS });
        return map;
    }

    private async projectDeliverablesIntoTree(
        root: FileNode,
        sandboxId: string,
        provider: DaytonaProvider,
    ): Promise<void> {
        // Deliverables live below the default tree depth, so fetch them directly. The
        // project map only decorates them with display names — an empty map still projects
        // top-level deliverables and slug-named unregistered projects, so we key the decision
        // on the deliverables, not the map.
        const deliverables = await loadDeliverablesDeep(provider, sandboxId);
        if (deliverables.length === 0) return;

        const map = await this.getProjectMap(sandboxId, provider);
        injectDeliverablesProjection(root, deliverables, map);
    }

    // GET /workspace/overview — semantic workspace view for sidebar
    async getOverview(userId: string): Promise<WorkspaceOverview> {
        // skipPreviews=true — overview only needs tree structure, not file content
        // Agent names from shift.yaml are extracted by targeted reads below
        const tree = await this.getTree(userId, 5, true);
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        return buildWorkspaceOverview(tree.root, async (filePath: string) => {
            const fullPath = `${SANDBOX_CONFIG.workspacePath}/${filePath}`;
            return provider.readFile(sandboxId, fullPath).catch(() => '');
        });
    }

    // Extensions that get previews
    private static readonly PREVIEW_EXTENSIONS = new Set([
        'md', 'txt', 'json', 'yaml', 'yml', 'csv', 'xml', 'html', 'ts', 'tsx',
        'js', 'jsx', 'py', 'toml', 'cfg', 'ini', 'sh', 'css', 'sql',
    ]);

    private static readonly MAX_PREVIEW_BYTES = 500;
    private static readonly MAX_PREVIEW_FILES = 30;

    private isPreviewable(name: string): boolean {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        return DriveService.PREVIEW_EXTENSIONS.has(ext);
    }

    // Collect all previewable file nodes from the tree
    private collectPreviewableFiles(node: FileNode, result: FileNode[] = []): FileNode[] {
        if (node.type === 'file' && this.isPreviewable(node.name) && result.length < DriveService.MAX_PREVIEW_FILES) {
            result.push(node);
        }
        if (node.children) {
            for (const child of node.children) {
                if (result.length >= DriveService.MAX_PREVIEW_FILES) break;
                this.collectPreviewableFiles(child, result);
            }
        }
        return result;
    }

    private static readonly PREVIEW_TIMEOUT_MS = 10_000;

    private async populatePreviewsDaytona(root: FileNode, sandboxId: string, provider: DaytonaProvider): Promise<void> {
        const files = this.collectPreviewableFiles(root);
        if (files.length === 0) return;

        const basePath = SANDBOX_CONFIG.workspacePath;
        const paths = files.map(f => `${basePath}/${f.path}`);

        try {
            const script = paths
                .map(p => `echo "---XERUS_PREVIEW_SEP---"; head -c ${DriveService.MAX_PREVIEW_BYTES} '${p.replace(/'/g, "'\\''")}' 2>/dev/null || echo "---XERUS_PREVIEW_FAIL---"`)
                .join('; ');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), DriveService.PREVIEW_TIMEOUT_MS);

            let result: { result?: string };
            try {
                result = await provider.executeCommand(sandboxId, script);
            } finally {
                clearTimeout(timeout);
            }

            if (!result.result) {
                log.warn('Preview batch returned empty', { file_count: files.length });
                return;
            }

            const chunks = result.result.split('---XERUS_PREVIEW_SEP---').slice(1);
            for (let i = 0; i < Math.min(chunks.length, files.length); i++) {
                const content = chunks[i].trim();
                if (content === '---XERUS_PREVIEW_FAIL---' || content === '') continue;
                if (content.includes('\x00')) {
                    files[i].preview = '[Binary file]';
                } else {
                    files[i].preview = content;
                }
            }
        } catch (err: unknown) {
            log.warn('Preview batch command failed', {
                file_count: files.length,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // GET /workspace/files/*path - read file content
    async readFile(userId: string, filePath: string): Promise<{ content: string; source: 'daytona' }> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const realPath = await this.resolveRealPath(filePath, sandboxId, provider);
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${realPath}`;
        const content = await provider.readFile(sandboxId, fullPath);
        return { content, source: 'daytona' };
    }

    // GET /workspace/files/*path - read raw file bytes
    async readFileBuffer(userId: string, filePath: string): Promise<{ content: Buffer; source: 'daytona' }> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const realPath = await this.resolveRealPath(filePath, sandboxId, provider);
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${realPath}`;
        const content = await provider.downloadFile(sandboxId, fullPath);
        return { content, source: 'daytona' };
    }

    // PUT /workspace/files/*path - write file to Daytona sandbox
    // Edits to virtual deliverable paths (drive/<Project>/<file>) flow through to the
    // real projects/<slug>/channels/<slug>/output/deliverables/<file> so user refinements
    // land on the agent's source of truth — no shadow copy, no divergence.
    async writeFile(userId: string, filePath: string, content: string): Promise<void> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const realPath = await this.resolveRealPath(filePath, sandboxId, provider);
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${realPath}`;
        await provider.writeFile(sandboxId, fullPath, content);
    }

    // Translate a virtual drive/<Project>/... path to its real projects/<slug>/channels/<slug>/...
    // path. Returns the input unchanged if it's not a virtual projection. Shared by read and
    // write paths so user operations on the virtual tree affect the real file.
    private async resolveRealPath(
        filePath: string,
        sandboxId: string,
        provider: DaytonaProvider,
    ): Promise<string> {
        if (!filePath.startsWith('drive/')) return filePath;
        const map = await this.getProjectMap(sandboxId, provider);
        const virtual = resolveVirtualDeliverablePath(filePath, map);
        return virtual ?? filePath;
    }

    // POST /workspace/upload - upload file to Daytona sandbox
    async uploadFile(
        userId: string,
        targetPath: string,
        fileName: string,
        fileBuffer: Buffer,
    ): Promise<void> {
        const fullPath = targetPath.endsWith('/')
            ? `${targetPath}${fileName}`
            : `${targetPath}/${fileName}`;

        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const sandboxPath = `${SANDBOX_CONFIG.workspacePath}/${fullPath}`;
        const parentDir = path.dirname(sandboxPath);
        await provider.executeCommand(sandboxId, `mkdir -p "${parentDir}"`);
        await provider.uploadFile(sandboxId, fileBuffer.toString('base64'), sandboxPath);
    }

    // POST /workspace/ensure - ensure sandbox is running (idempotent)
    async ensureSandbox(userId: string): Promise<WorkspaceStatus> {
        const session = await this.sandboxService.getOrCreateSandbox({ userId });
        return {
            sandbox_running: session.status === 'running',
            sandbox_id: session.sandboxId,
            sandbox_plan: session.sandboxPlan || null,
        };
    }

    private validatePath(p: string): void {
        if (!p || p.includes('\0') || p.includes('..') || path.isAbsolute(p)) {
            throw new Error(`Invalid path: ${p}`);
        }
    }

    // List immediate subdirectories under a path (non-recursive, dirs only)
    async listSubdirectories(userId: string, dirPath: string): Promise<string[]> {
        this.validatePath(dirPath);
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${dirPath}`;
        const result = await provider.executeCommand(
            sandboxId,
            `find ${shellEscapePath(fullPath)} -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; 2>/dev/null || true`,
        );
        return result.result.trim().split('\n').filter(Boolean);
    }

    // DELETE directory recursively (for agent delete)
    // Deletes through the virtual deliverable projection reach the real file so the
    // user can remove an agent's output without leaving a phantom at drive/<Project>/.
    async deleteDirectory(userId: string, dirPath: string): Promise<void> {
        this.validatePath(dirPath);
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const realPath = await this.resolveRealPath(dirPath, sandboxId, provider);
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${realPath}`;
        await provider.executeCommand(sandboxId, `rm -rf ${shellEscapePath(fullPath)}`);
    }

    // COPY directory recursively (for agent clone)
    async copyDirectory(userId: string, sourcePath: string, targetPath: string): Promise<void> {
        this.validatePath(sourcePath);
        this.validatePath(targetPath);
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullSource = `${SANDBOX_CONFIG.workspacePath}/${sourcePath}`;
        const fullTarget = `${SANDBOX_CONFIG.workspacePath}/${targetPath}`;
        await provider.executeCommand(
            sandboxId,
            `cp -r ${shellEscapePath(fullSource)} ${shellEscapePath(fullTarget)}`,
        );
    }

    // GET /workspace/status
    async getStatus(userId: string): Promise<WorkspaceStatus> {
        const sandboxStatus = await this.sandboxService.getSandboxStatus(userId);
        const sandboxPlan = await this.planLifecycle.getSandboxPlan(userId);
        return {
            sandbox_running: sandboxStatus.status === 'running',
            sandbox_id: sandboxStatus.sandboxId,
            sandbox_plan: sandboxPlan,
        };
    }

    // POST /workspace/browser — start browser infrastructure, return noVNC URL
    // Ensures sandbox is running first, then lazily starts Chromium + noVNC
    async startBrowser(userId: string): Promise<{ novnc_url: string }> {
        await this.resolveSandboxId(userId);
        const novncUrl = await this.sandboxService.ensureBrowserReady(userId);
        return { novnc_url: novncUrl };
    }

    // POST /workspace/terminal — start web terminal with claude, return ttyd URL
    async startTerminal(userId: string): Promise<{ terminal_url: string }> {
        await this.resolveSandboxId(userId);
        const terminalUrl = await this.sandboxService.ensureTerminalReady(userId);
        return { terminal_url: terminalUrl };
    }

    // POST /workspace/preview — resolve a Daytona preview URL for a port the agent is serving on.
    // Used by the chat artifact viewer to render live app previews (Lovable/Replit-style).
    async getPreviewUrl(userId: string, port: number): Promise<{ port: number; previewUrl: string }> {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port: ${port}`);
        }
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const previewUrl = await provider.getPreviewUrl(sandboxId, port);
        return { port, previewUrl };
    }

    // Workspace lifecycle controls
    async pauseSandbox(userId: string): Promise<SandboxOperationResult> {
        return this.sandboxService.pauseSandbox(userId);
    }

    async startSandbox(userId: string): Promise<SandboxSession | null> {
        return this.sandboxService.resumeSandbox(userId);
    }

    async stopSandbox(userId: string): Promise<SandboxOperationResult> {
        return this.sandboxService.killSandbox(userId);
    }

    async triggerBackup(userId: string): Promise<BackupResult> {
        if (!this.backupService) {
            throw new Error('Backup service not configured (S3_BUCKET / S3_REGION not set)');
        }

        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const buffer = await createWorkspaceTar(provider, sandboxId);
        return this.backupService.createSnapshot(userId, buffer);
    }

    async exportWorkspace(userId: string): Promise<Buffer> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        return createWorkspaceTar(provider, sandboxId);
    }

    async importWorkspace(userId: string, tarBuffer: Buffer): Promise<void> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        await restoreWorkspaceTar(provider, sandboxId, tarBuffer);
    }

    async listSnapshots(userId: string): Promise<StorageFile[]> {
        if (!this.backupService) {
            throw new Error('Backup service not configured');
        }
        return this.backupService.listSnapshots(userId);
    }

    async restoreFromSnapshot(userId: string, snapshotKey: string): Promise<void> {
        if (!this.backupService) {
            throw new Error('Backup service not configured');
        }
        const expectedPrefix = `${userId}/snapshots/`;
        if (!snapshotKey.startsWith(expectedPrefix)) {
            throw new Error(`Unauthorized snapshot key: does not belong to user ${userId}`);
        }
        const result = await this.backupService.restoreSnapshot(snapshotKey);
        await this.importWorkspace(userId, result.content);
    }

    async deleteSnapshot(userId: string, snapshotKey: string): Promise<void> {
        if (!this.backupService) {
            throw new Error('Backup service not configured');
        }
        const expectedPrefix = `${userId}/snapshots/`;
        if (!snapshotKey.startsWith(expectedPrefix)) {
            throw new Error(`Unauthorized snapshot key: does not belong to user ${userId}`);
        }
        await this.backupService.deleteSnapshot(snapshotKey);
    }

    // POST /workspace/sync-template — selectively overlay the latest xerus-workspace
    // template onto the user's existing sandbox. Only platform-owned paths
    // (.claude/, .xerus/, marketplace/, root CLAUDE.md, agents/index.json,
    // agents/xerus-master, agents/xerus-cto) are touched; user content is preserved.
    // After a real sync, personalizeWorkspace re-applies user env vars in case
    // the template overlay missed any platform-defined hooks/permissions.
    async syncTemplate(userId: string, dryRun = false): Promise<WorkspaceTemplateSyncResult> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const result = await syncWorkspaceTemplate(provider, sandboxId, { dryRun });

        if (!dryRun && result.synced) {
            const sandboxFs = await this.sandboxService.getSandboxFs(sandboxId);
            await personalizeWorkspace(sandboxFs, { userId });
        }

        return result;
    }

    listSyncTemplatePaths(): ReadonlyArray<string> {
        return listPlatformOverlayPaths();
    }

    // ---- Plan Lifecycle (delegated to DrivePlanLifecycleService) ----

    async getUsage(userId: string): Promise<WorkspaceUsageResult> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        return this.planLifecycle.getUsage(userId, sandboxId, provider);
    }

    async resizeForPlan(userId: string): Promise<{ resized: true; sandbox_plan: string }> {
        const provider = this.getDaytonaProvider();
        return this.planLifecycle.resizeForPlan(userId, provider);
    }

    async recreateForPlan(userId: string): Promise<{ recreated: true; sandbox_plan: string; sandbox_id: string }> {
        const provider = this.getDaytonaProvider();
        return this.planLifecycle.recreateForPlan(userId, provider);
    }

    private getDaytonaProvider(): DaytonaProvider {
        const provider = this.sandboxService.getProvider();
        if (!provider || typeof (provider as DaytonaProvider).readFile !== 'function') {
            throw new Error('Sandbox provider does not support file operations');
        }
        return provider as DaytonaProvider;
    }

    // Build tree from Daytona flat file list
    private buildTreeFromDaytona(files: string[], rootPath: string, maxDepth: number): FileNode {
        const root: FileNode = {
            name: 'workspace',
            type: 'directory',
            path: '',
            children: [],
        };

        const prefixLen = rootPath.endsWith('/') ? rootPath.length : rootPath.length + 1;

        for (const file of files) {
            const relativePath = file.startsWith(rootPath) ? file.slice(prefixLen) : file;

            if (!relativePath) continue;
            if (isHidden(relativePath)) continue;

            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length > maxDepth) continue;

            this.insertPath(root, parts);
        }

        return root;
    }

    // Insert a file path into the tree, creating intermediate directories
    private insertPath(
        root: FileNode,
        parts: string[],
        size?: number,
        modified?: string,
    ): void {
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            const pathSoFar = parts.slice(0, i + 1).join('/');

            if (!current.children) {
                current.children = [];
            }

            let child = current.children.find((c) => c.name === part);

            if (!child) {
                child = {
                    name: part,
                    type: isLast ? 'file' : 'directory',
                    path: pathSoFar,
                    ...(isLast && size !== undefined ? { size } : {}),
                    ...(isLast && modified ? { modified } : {}),
                    ...(isLast ? {} : { children: [] }),
                };
                current.children.push(child);
            }

            if (!isLast) {
                child.type = 'directory';
                if (!child.children) {
                    child.children = [];
                }
            }

            current = child;
        }
    }
}
