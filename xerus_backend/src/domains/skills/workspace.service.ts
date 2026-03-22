// Skill Workspace Service
// Handles install/uninstall of skill folders via filesystem copy from marketplace.
// Two scopes: channel-scoped (default) and global (root .claude/skills/).
// All operations go directly to the Daytona sandbox filesystem.

import { SandboxService } from '../execution/sandbox/sandbox.service';
import type { DaytonaProvider } from '../execution/sandbox/providers/daytona.provider';
import type { SandboxFileSystem } from '../execution/workspace/workspace.manager';
import { SANDBOX_CONFIG } from '../execution/sandbox/sandbox.config';
import { SkillInstallScope, SKILL_SLUG_PATTERN } from './types';
import { shellEscapePath } from '../../utils/shell-safety';

/**
 * Translate frontend channel_id (e.g. "marketing/seo") to workspace-relative path
 * (e.g. "projects/marketing/channels/seo").
 * The MCP handler resolveAgentChannelPath() does this from agents/index.json;
 * this helper does the same translation for the REST API path.
 */
export function channelIdToWorkspacePath(channelId: string): string {
    const parts = channelId.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`Invalid channel_id format: "${channelId}". Expected "domain/channel".`);
    }
    return `projects/${parts[0]}/channels/${parts[1]}`;
}

export function resolveSkillPath(
    scope: SkillInstallScope,
    skillSlug: string,
    channelPath?: string,
): string {
    if (scope === 'global') {
        return `.claude/skills/${skillSlug}`;
    }
    if (!channelPath) {
        throw new Error('channelPath is required for channel-scoped install');
    }
    return `${channelPath}/.claude/skills/${skillSlug}`;
}

export class SkillWorkspaceService {
    constructor(
        private readonly sandboxService: SandboxService,
    ) {}

    async installSkillToWorkspace(
        userId: string,
        skillSlug: string,
        scope: SkillInstallScope,
        channelPath?: string,
    ): Promise<{ filesWritten: number; skipped: boolean }> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        const destPath = `${basePath}/${resolveSkillPath(scope, skillSlug, channelPath)}`;
        const sourcePath = `${basePath}/marketplace/skills/${skillSlug}`;

        // Check if already installed at this path (idempotent)
        const alreadyInstalled = await fs.exists(`${destPath}/SKILL.md`);
        if (alreadyInstalled) {
            return { filesWritten: 0, skipped: true };
        }

        // Copy skill folder from marketplace to target
        const copied = await this.copyDirectory(fs, sourcePath, destPath);
        return { filesWritten: copied, skipped: false };
    }

    async uninstallSkillFromWorkspace(
        userId: string,
        skillSlug: string,
        scope: SkillInstallScope,
        channelPath?: string,
    ): Promise<{ filesDeleted: number }> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        const skillPath = `${basePath}/${resolveSkillPath(scope, skillSlug, channelPath)}`;

        const exists = await fs.exists(skillPath);
        if (!exists) {
            return { filesDeleted: 0 };
        }

        // Count files before deleting
        const files = await fs.list(skillPath);
        const count = files.length;

        await fs.rm(skillPath, { recursive: true });
        return { filesDeleted: count };
    }

    async listSkillFiles(
        userId: string,
        skillSlug: string,
        isGlobal: boolean,
        channelPath?: string,
    ): Promise<Array<{ path: string; size: number }>> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        let baseDir: string;
        if (isGlobal) {
            baseDir = `${basePath}/marketplace/skills`;
        } else if (channelPath) {
            baseDir = `${basePath}/${channelPath}/.claude/skills`;
        } else {
            baseDir = `${basePath}/.claude/skills`;
        }
        const skillDir = skillSlug ? `${baseDir}/${skillSlug}` : baseDir;

        const exists = await fs.exists(skillDir);
        if (!exists) return [];

        // Use listRecursive (find -type f) to get only files, not directories
        const files = fs.listRecursive
            ? await fs.listRecursive(skillDir, 5)
            : await fs.list(skillDir);

        const prefix = skillDir + '/';
        return files.map(f => ({
            path: f.startsWith(prefix) ? f.slice(prefix.length) : f,
            size: 0,
        }));
    }

    async readSkillFile(
        userId: string,
        skillSlug: string,
        filePath: string,
        isGlobal: boolean,
        channelPath?: string,
    ): Promise<string> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        let skillDir: string;
        if (isGlobal) {
            skillDir = `${basePath}/marketplace/skills/${skillSlug}`;
        } else if (channelPath) {
            skillDir = `${basePath}/${channelPath}/.claude/skills/${skillSlug}`;
        } else {
            skillDir = `${basePath}/.claude/skills/${skillSlug}`;
        }
        return fs.readFile(`${skillDir}/${filePath}`);
    }

    async writeSkillFile(
        userId: string,
        skillSlug: string,
        filePath: string,
        content: string,
        channelPath?: string,
    ): Promise<void> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        const dirPath = channelPath
            ? `${basePath}/${channelPath}/.claude/skills/${skillSlug}`
            : `${basePath}/.claude/skills/${skillSlug}`;
        const exists = await fs.exists(dirPath);
        if (!exists) {
            await fs.mkdir(dirPath);
        }
        await fs.writeFile(`${dirPath}/${filePath}`, content);
    }

    async deleteSkillFile(
        userId: string,
        skillSlug: string,
        filePath: string,
        channelPath?: string,
    ): Promise<void> {
        const fs = await this.getFileSystem(userId);
        const basePath = SANDBOX_CONFIG.workspacePath;
        const fullPath = channelPath
            ? `${basePath}/${channelPath}/.claude/skills/${skillSlug}/${filePath}`
            : `${basePath}/.claude/skills/${skillSlug}/${filePath}`;
        await fs.rm(fullPath);
    }

    // Batch-read all marketplace skill metadata in ONE SSH command (avoids N+1)
    async batchReadMarketplace(userId: string): Promise<Array<{ slug: string; type: 'xerushub' | 'skillmd'; content: string; fileCount: number }>> {
        const t0 = Date.now();
        const { provider, sandboxId } = await this.resolveProvider(userId);
        const t1 = Date.now();
        const skillsDir = `${SANDBOX_CONFIG.workspacePath}/marketplace/skills`;

        const cmd = `for d in ${skillsDir}/*/; do ` +
            `[ ! -d "$d" ] && continue; ` +
            `slug=$(basename "$d"); ` +
            `count=$(ls -1 "$d" 2>/dev/null | wc -l); ` +
            `if [ -f "$d/xerushub.json" ]; then ` +
            `printf "===SKILL:%s:%s:xerushub===\\n" "$slug" "$count"; ` +
            `cat "$d/xerushub.json"; ` +
            `elif [ -f "$d/SKILL.md" ]; then ` +
            `printf "===SKILL:%s:%s:skillmd===\\n" "$slug" "$count"; ` +
            `cat "$d/SKILL.md"; ` +
            `fi; done`;

        const result = await provider.executeCommand(sandboxId, cmd);
        const t2 = Date.now();
        console.log(`[skills] batchReadMarketplace: resolve=${t1 - t0}ms ssh=${t2 - t1}ms total=${t2 - t0}ms`);
        return this.parseBatchOutput(result.result || '');
    }

    // Batch-read all installed skill metadata in ONE SSH command.
    // Scans both root .claude/skills/ AND channel-level .claude/skills/ directories.
    async batchReadInstalled(userId: string): Promise<Array<{ slug: string; type: 'config' | 'skillmd'; content: string; fileCount: number; channelPath?: string }>> {
        const t0 = Date.now();
        const { provider, sandboxId } = await this.resolveProvider(userId);
        const t1 = Date.now();
        const ws = SANDBOX_CONFIG.workspacePath;

        // Single SSH command that scans:
        // 1. Root: .claude/skills/*/
        // 2. Channel: projects/*/channels/*/.claude/skills/*/
        // Channel entries get a ===CHANNEL:path=== prefix before the SKILL marker
        const cmd = [
            // Scan root skills
            `scan_skills() { local dir="$1" prefix="$2"; `,
            `[ -d "$dir" ] || return 0; `,
            `for d in "$dir"/*/; do `,
            `[ ! -d "$d" ] && continue; `,
            `slug=$(basename "$d"); `,
            `count=$(ls -1 "$d" 2>/dev/null | wc -l); `,
            `if [ -f "$d/config.json" ]; then `,
            `printf "===SKILL:%s:%s:config:%s===\\n" "$slug" "$count" "$prefix"; `,
            `cat "$d/config.json"; `,
            `elif [ -f "$d/SKILL.md" ]; then `,
            `printf "===SKILL:%s:%s:skillmd:%s===\\n" "$slug" "$count" "$prefix"; `,
            `cat "$d/SKILL.md"; `,
            `fi; done; }; `,
            // Root
            `scan_skills "${ws}/.claude/skills" ""; `,
            // Channel-level
            `for ch in "${ws}"/projects/*/channels/*/; do `,
            `[ ! -d "$ch" ] && continue; `,
            `rel=$(echo "$ch" | sed "s|^${ws}/||;s|/$||"); `,
            `scan_skills "$ch/.claude/skills" "$rel"; `,
            `done`,
        ].join('');

        const result = await provider.executeCommand(sandboxId, cmd);
        const t2 = Date.now();
        console.log(`[skills] batchReadInstalled: resolve=${t1 - t0}ms ssh=${t2 - t1}ms total=${t2 - t0}ms`);
        return this.parseBatchOutputWithScope(result.result || '');
    }

    private parseBatchOutputWithScope(output: string): Array<{ slug: string; type: 'config' | 'skillmd'; content: string; fileCount: number; channelPath?: string }> {
        const entries: Array<{ slug: string; type: 'config' | 'skillmd'; content: string; fileCount: number; channelPath?: string }> = [];
        const blocks = output.split('===SKILL:');
        for (const block of blocks) {
            if (!block.trim()) continue;
            const markerEnd = block.indexOf('===');
            if (markerEnd === -1) continue;
            const header = block.substring(0, markerEnd);
            const content = block.substring(markerEnd + 3).trim();
            const parts = header.split(':');
            if (parts.length < 3) continue;
            const slug = parts[0];
            const fileCount = parseInt(parts[1], 10) || 1;
            const type = parts[2] as 'config' | 'skillmd';
            const channelPath = parts[3] || undefined;
            if (!slug || !type || !SKILL_SLUG_PATTERN.test(slug) || !content) continue;
            entries.push({ slug, type, content, fileCount, channelPath: channelPath || undefined });
        }
        return entries;
    }

    private parseBatchOutput<T extends string = string>(output: string): Array<{ slug: string; type: T; content: string; fileCount: number }> {
        const entries: Array<{ slug: string; type: T; content: string; fileCount: number }> = [];
        const blocks = output.split('===SKILL:');
        for (const block of blocks) {
            if (!block.trim()) continue;
            const markerEnd = block.indexOf('===');
            if (markerEnd === -1) continue;
            const header = block.substring(0, markerEnd);
            const content = block.substring(markerEnd + 3).trim();
            const parts = header.split(':');
            if (parts.length < 3) continue;
            const slug = parts[0];
            const fileCount = parseInt(parts[1], 10) || 1;
            const type = parts[2];
            if (!slug || !type || !SKILL_SLUG_PATTERN.test(slug) || !content) continue;
            entries.push({ slug, type: type as T, content, fileCount });
        }
        return entries;
    }

    private async resolveProvider(userId: string): Promise<{ provider: DaytonaProvider; sandboxId: string }> {
        const status = await this.sandboxService.getSandboxStatus(userId);
        if (status.status !== 'running' || !status.sandboxId) {
            throw new Error(`No running sandbox for user ${userId}`);
        }
        const provider = this.sandboxService.getProvider() as DaytonaProvider;
        return { provider, sandboxId: status.sandboxId };
    }

    private async getFileSystem(userId: string): Promise<SandboxFileSystem> {
        const { provider, sandboxId } = await this.resolveProvider(userId);
        if (typeof provider.writeFile !== 'function') {
            throw new Error('Sandbox provider does not support file operations');
        }
        return this.buildFileSystem(provider, sandboxId);
    }

    private buildFileSystem(provider: DaytonaProvider, sandboxId: string): SandboxFileSystem {
        return {
            mkdir: async (path: string) => {
                await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(path)}`);
            },
            writeFile: async (path: string, content: string) => {
                await provider.writeFile(sandboxId, path, content);
            },
            readFile: async (path: string) => {
                return provider.readFile(sandboxId, path);
            },
            exists: async (path: string) => {
                const result = await provider.executeCommand(sandboxId, `test -e ${shellEscapePath(path)} && echo YES || echo NO`);
                return result.result.trim() === 'YES';
            },
            rm: async (path: string, options?: { recursive?: boolean }) => {
                const flags = options?.recursive ? '-rf' : '-f';
                await provider.executeCommand(sandboxId, `rm ${flags} ${shellEscapePath(path)}`);
            },
            list: async (path: string) => {
                return provider.listFiles(sandboxId, path);
            },
            listRecursive: async (path: string, maxDepth: number) => {
                return provider.listFilesRecursive(sandboxId, path, maxDepth);
            },
        };
    }

    private async copyDirectory(fs: SandboxFileSystem, sourcePath: string, destPath: string): Promise<number> {
        const sourceExists = await fs.exists(sourcePath);
        if (!sourceExists) {
            throw new Error(`Marketplace skill not found at ${sourcePath}`);
        }

        await fs.mkdir(destPath);

        // Use listRecursive (find -type f) to get only files, not directories
        const files = fs.listRecursive
            ? await fs.listRecursive(sourcePath, 5)
            : await fs.list(sourcePath);

        let copied = 0;
        const prefix = sourcePath + '/';

        for (const file of files) {
            const relativePath = file.startsWith(prefix) ? file.slice(prefix.length) : file;
            if (!relativePath) continue;

            const content = await fs.readFile(`${sourcePath}/${relativePath}`);
            // Ensure parent directories exist for nested files
            const lastSlash = relativePath.lastIndexOf('/');
            if (lastSlash > 0) {
                await fs.mkdir(`${destPath}/${relativePath.substring(0, lastSlash)}`);
            }
            await fs.writeFile(`${destPath}/${relativePath}`, content);
            copied++;
        }

        return copied;
    }
}
