// Daytona Sandbox File System Adapter
// Bridges Daytona SDK's Sandbox.fs/process APIs to the SandboxFileSystem interface
// Used by workspace initializer to scaffold workspace on fresh sandboxes

import { Sandbox } from '@daytonaio/sdk';
import { SandboxFileSystem } from '../../workspace/workspace.manager';
import { shellEscape } from '../../../../utils/shell-safety';

// Locale warning stripping — same as daytona.provider.ts.
// This adapter calls sandbox.process.executeCommand directly (SDK level),
// not through DaytonaProvider, so it needs its own stripping.
const LOCALE_WARNING_RE = /^\/usr\/bin\/bash: warning: setlocale: .*\n?/gm;
function cleanOutput(raw: string | undefined): string {
    return (raw || '').replace(LOCALE_WARNING_RE, '');
}

export function createDaytonaFileSystem(sandbox: Sandbox): SandboxFileSystem {
    return {
        async mkdir(path: string): Promise<void> {
            const result = await sandbox.process.executeCommand(`mkdir -p ${shellEscape(path)}`);
            if (result.exitCode !== 0) {
                throw new Error(`mkdir failed for ${path}: exit ${result.exitCode} - ${cleanOutput(result.result)}`);
            }
        },

        async writeFile(path: string, content: string): Promise<void> {
            const parentDir = path.substring(0, path.lastIndexOf('/'));
            if (parentDir) {
                const mkdirResult = await sandbox.process.executeCommand(`mkdir -p ${shellEscape(parentDir)}`);
                if (mkdirResult.exitCode !== 0) {
                    throw new Error(`mkdir failed for ${parentDir}: exit ${mkdirResult.exitCode} - ${cleanOutput(mkdirResult.result)}`);
                }
            }
            await sandbox.fs.uploadFile(Buffer.from(content, 'utf-8'), path);
        },

        async readFile(path: string): Promise<string> {
            const result = await sandbox.process.executeCommand(
                `test -d ${shellEscape(path)} && echo "__IS_DIR__" && exit 2 || cat ${shellEscape(path)}`
            );
            const output = cleanOutput(result.result);
            if (result.exitCode === 2 && output.includes('__IS_DIR__')) {
                throw new Error(`Path is a directory, not a file: ${path}`);
            }
            if (result.exitCode !== 0) {
                throw new Error(`readFile failed for ${path}: exit ${result.exitCode} - ${output}`);
            }
            return output;
        },

        async exists(path: string): Promise<boolean> {
            const result = await sandbox.process.executeCommand(
                `test -e ${shellEscape(path)} && echo "EXISTS" || echo "NOT_EXISTS"`
            );
            return cleanOutput(result.result).trim() === 'EXISTS';
        },

        async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
            const flags = options?.recursive ? '-rf' : '-f';
            const result = await sandbox.process.executeCommand(`rm ${flags} ${shellEscape(path)}`);
            if (result.exitCode !== 0) {
                throw new Error(`rm failed for ${path}: exit ${result.exitCode} - ${cleanOutput(result.result)}`);
            }
        },

        async list(path: string): Promise<string[]> {
            const result = await sandbox.process.executeCommand(
                `ls -1 ${shellEscape(path)} 2>/dev/null || true`
            );
            const output = cleanOutput(result.result).trim();
            if (!output) return [];
            return output.split('\n').filter(Boolean);
        },

        async listRecursive(path: string, maxDepth: number): Promise<string[]> {
            const result = await sandbox.process.executeCommand(
                `find ${shellEscape(path)} -maxdepth ${maxDepth} -type f 2>/dev/null || true`
            );
            const output = cleanOutput(result.result).trim();
            if (!output) return [];
            return output.split('\n').filter(Boolean);
        },
    };
}
