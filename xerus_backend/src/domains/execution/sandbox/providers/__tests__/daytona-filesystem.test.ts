// Daytona FileSystem Exit Code Tests
// Uses an in-memory sandbox simulator (no mocks)

import { createDaytonaFileSystem } from '../daytona-filesystem';

// In-memory sandbox simulator that implements the Sandbox surface used by createDaytonaFileSystem
function buildFakeSandbox(overrides?: {
    executeCommandResults?: Map<string, { result: string; exitCode: number }>;
    defaultExitCode?: number;
    defaultResult?: string;
    uploadFileCapture?: Array<{ content: Buffer; path: string }>;
}) {
    const uploadFileCapture = overrides?.uploadFileCapture || [];
    const executeCommandResults = overrides?.executeCommandResults || new Map();
    const defaultExitCode = overrides?.defaultExitCode ?? 0;
    const defaultResult = overrides?.defaultResult ?? '';

    return {
        process: {
            executeCommand: async (command: string) => {
                // Check if any key in the map is a substring of the command
                for (const [key, value] of executeCommandResults) {
                    if (command.includes(key)) {
                        return value;
                    }
                }
                return { result: defaultResult, exitCode: defaultExitCode };
            },
        },
        fs: {
            uploadFile: async (content: Buffer, path: string) => {
                uploadFileCapture.push({ content, path });
            },
        },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('createDaytonaFileSystem', () => {
    describe('mkdir', () => {
        it('succeeds silently on exit code 0', async () => {
            const sandbox = buildFakeSandbox();
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.mkdir('/workspace/test')).resolves.toBeUndefined();
        });

        it('throws on non-zero exit code', async () => {
            const sandbox = buildFakeSandbox({
                defaultExitCode: 1,
                defaultResult: 'Permission denied',
            });
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.mkdir('/workspace/test')).rejects.toThrow(
                'mkdir failed for /workspace/test: exit 1 - Permission denied',
            );
        });
    });

    describe('readFile', () => {
        it('returns file content on success', async () => {
            const sandbox = buildFakeSandbox({
                defaultResult: 'file content here',
            });
            const fs = createDaytonaFileSystem(sandbox);

            const content = await fs.readFile('/workspace/file.txt');
            expect(content).toBe('file content here');
        });

        it('throws on non-zero exit code', async () => {
            const sandbox = buildFakeSandbox({
                defaultExitCode: 1,
                defaultResult: 'No such file or directory',
            });
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.readFile('/workspace/missing.txt')).rejects.toThrow(
                'readFile failed for /workspace/missing.txt: exit 1 - No such file or directory',
            );
        });
    });

    describe('rm', () => {
        it('succeeds silently on exit code 0', async () => {
            const sandbox = buildFakeSandbox();
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.rm('/workspace/file.txt')).resolves.toBeUndefined();
        });

        it('throws on non-zero exit code', async () => {
            const sandbox = buildFakeSandbox({
                defaultExitCode: 1,
                defaultResult: 'Operation not permitted',
            });
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.rm('/workspace/file.txt')).rejects.toThrow(
                'rm failed for /workspace/file.txt: exit 1 - Operation not permitted',
            );
        });
    });

    describe('writeFile', () => {
        it('throws when mkdir for parent directory fails', async () => {
            const uploadCapture: Array<{ content: Buffer; path: string }> = [];
            const sandbox = buildFakeSandbox({
                defaultExitCode: 1,
                defaultResult: 'Read-only file system',
                uploadFileCapture: uploadCapture,
            });
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.writeFile('/workspace/dir/file.txt', 'content')).rejects.toThrow(
                'mkdir failed for /workspace/dir: exit 1 - Read-only file system',
            );

            // uploadFile should NOT have been called since mkdir failed
            expect(uploadCapture).toHaveLength(0);
        });

        it('uploads file when mkdir succeeds', async () => {
            const uploadCapture: Array<{ content: Buffer; path: string }> = [];
            const sandbox = buildFakeSandbox({
                uploadFileCapture: uploadCapture,
            });
            const fs = createDaytonaFileSystem(sandbox);

            await fs.writeFile('/workspace/dir/file.txt', 'hello');

            expect(uploadCapture).toHaveLength(1);
            expect(uploadCapture[0].path).toBe('/workspace/dir/file.txt');
            expect(uploadCapture[0].content.toString('utf-8')).toBe('hello');
        });
    });

    describe('exists (unchanged)', () => {
        it('returns true when file exists', async () => {
            const sandbox = buildFakeSandbox({ defaultResult: 'EXISTS' });
            const fs = createDaytonaFileSystem(sandbox);

            expect(await fs.exists('/workspace/file.txt')).toBe(true);
        });

        it('returns false when file does not exist', async () => {
            const sandbox = buildFakeSandbox({ defaultResult: 'NOT_EXISTS' });
            const fs = createDaytonaFileSystem(sandbox);

            expect(await fs.exists('/workspace/missing.txt')).toBe(false);
        });
    });

    describe('shellEscape control character rejection', () => {
        it('throws on path with newline', async () => {
            const sandbox = buildFakeSandbox();
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.mkdir('/workspace/test\n; rm -rf /')).rejects.toThrow(
                'Invalid shell argument: contains control characters',
            );
        });

        it('throws on path with carriage return', async () => {
            const sandbox = buildFakeSandbox();
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.readFile('/workspace/file\r')).rejects.toThrow(
                'Invalid shell argument: contains control characters',
            );
        });

        it('throws on path with null byte', async () => {
            const sandbox = buildFakeSandbox();
            const fs = createDaytonaFileSystem(sandbox);

            await expect(fs.rm('/workspace/file\0')).rejects.toThrow(
                'Invalid shell argument: contains control characters',
            );
        });
    });

    describe('list (unchanged)', () => {
        it('returns file list', async () => {
            const sandbox = buildFakeSandbox({ defaultResult: 'file1.txt\nfile2.txt\n' });
            const fs = createDaytonaFileSystem(sandbox);

            const files = await fs.list('/workspace');
            expect(files).toEqual(['file1.txt', 'file2.txt']);
        });

        it('returns empty array for empty directory', async () => {
            const sandbox = buildFakeSandbox({ defaultResult: '' });
            const fs = createDaytonaFileSystem(sandbox);

            const files = await fs.list('/workspace/empty');
            expect(files).toEqual([]);
        });
    });
});
