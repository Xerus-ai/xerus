// Drive Service
// Daytona-only file operations for the Workspace Drive feature

import path from 'path';
import {
    SandboxService,
    SANDBOX_CONFIG,
    createWorkspaceTar,
    restoreWorkspaceTar,
} from '../sandbox-infra';
import type { DaytonaProvider } from '../sandbox-infra';
import { isHidden } from './editability';
import { buildWorkspaceOverview } from './workspace-overview';
import type { FileNode, TreeResponse, WorkspaceStatus, WorkspaceOverview } from './types';
import type { SandboxOperationResult, SandboxSession } from '../sandbox-infra';
import type { S3BackupService, BackupResult } from '../sandbox-infra/storage/s3-backup.service';
import type { StorageFile } from '../sandbox-infra/storage/storage.types';
import { shellEscapePath } from '../../utils/shell-safety';
import { logger } from '../../utils/logger';

const log = logger('DriveService');

export class DriveService {
    constructor(
        private readonly sandboxService: SandboxService,
        private readonly backupService?: S3BackupService,
    ) {}

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

        if (!skipPreviews) {
            // Populate previews for text files (first 500 bytes)
            await this.populatePreviewsDaytona(root, sandboxId, provider);
        }

        return { root, source: 'daytona', depth };
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

    // Fetch previews from Daytona sandbox (parallel, best-effort)
    private async populatePreviewsDaytona(root: FileNode, sandboxId: string, provider: DaytonaProvider): Promise<void> {
        const files = this.collectPreviewableFiles(root);
        if (files.length === 0) return;

        const results = await Promise.allSettled(
            files.map(async (node) => {
                const fullPath = `${SANDBOX_CONFIG.workspacePath}/${node.path}`;
                const content = await provider.readFile(sandboxId, fullPath);
                node.preview = content.slice(0, DriveService.MAX_PREVIEW_BYTES);
            }),
        );

        // Log failures but don't throw — previews are best-effort
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
            log.warn('Preview fetches failed', { failed: failures.length, total: files.length });
        }
    }

    // GET /workspace/files/*path - read file content
    async readFile(userId: string, filePath: string): Promise<{ content: string; source: 'daytona' }> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${filePath}`;
        const content = await provider.readFile(sandboxId, fullPath);
        return { content, source: 'daytona' };
    }

    // GET /workspace/files/*path - read raw file bytes
    async readFileBuffer(userId: string, filePath: string): Promise<{ content: Buffer; source: 'daytona' }> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${filePath}`;
        const content = await provider.downloadFile(sandboxId, fullPath);
        return { content, source: 'daytona' };
    }

    // PUT /workspace/files/*path - write file to Daytona sandbox
    async writeFile(userId: string, filePath: string, content: string): Promise<void> {
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${filePath}`;
        await provider.writeFile(sandboxId, fullPath, content);
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
        await provider.uploadFile(sandboxId, fileBuffer.toString('base64'), sandboxPath);
    }

    // POST /workspace/ensure - ensure sandbox is running (idempotent)
    async ensureSandbox(userId: string): Promise<WorkspaceStatus> {
        const session = await this.sandboxService.getOrCreateSandbox({ userId });
        return {
            sandbox_running: session.status === 'running',
            sandbox_id: session.sandboxId,
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
    async deleteDirectory(userId: string, dirPath: string): Promise<void> {
        this.validatePath(dirPath);
        const sandboxId = await this.resolveSandboxId(userId);
        const provider = this.getDaytonaProvider();
        const fullPath = `${SANDBOX_CONFIG.workspacePath}/${dirPath}`;
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
        return {
            sandbox_running: sandboxStatus.status === 'running',
            sandbox_id: sandboxStatus.sandboxId,
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
