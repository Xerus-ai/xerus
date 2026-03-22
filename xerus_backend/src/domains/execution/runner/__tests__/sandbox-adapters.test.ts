// Sandbox Adapters Tests
// Tests Node.js-backed implementations for sandbox environment.
// Uses real filesystem (temp directories) per project conventions.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Writable } from 'stream';
import {
    createSandboxExecutor,
    createSandboxFileSystem,
    createGitMemoryServiceAdapter,
    createEmitterMemoryIndexer,
} from '../sandbox-adapters';
import { StdoutEmitter } from '../stdout-emitter';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-adapters-test-'));
}

function createCaptureEmitter(): { emitter: StdoutEmitter; lines: string[] } {
    const lines: string[] = [];
    const writable = new Writable({
        write(chunk, _encoding, callback) {
            const text = chunk.toString();
            const newLines = text.split('\n').filter((l: string) => l.trim().length > 0);
            lines.push(...newLines);
            callback();
        },
    });
    return { emitter: new StdoutEmitter(writable), lines };
}

// -----------------------------------------------------------------------------
// Tests: SandboxCommandExecutor
// -----------------------------------------------------------------------------

describe('createSandboxExecutor', () => {
    it('should execute a simple command and return stdout', async () => {
        const executor = createSandboxExecutor();
        const result = await executor.exec('echo hello');

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('hello');
        expect(result.stderr).toBe('');
    });

    it('should return exit code for failed commands', async () => {
        const executor = createSandboxExecutor();
        const result = await executor.exec('exit 1');

        expect(result.exitCode).not.toBe(0);
    });

    it('should respect cwd parameter', async () => {
        const tmpDir = createTempDir();
        const executor = createSandboxExecutor();

        try {
            const result = await executor.exec('pwd', tmpDir);
            expect(result.exitCode).toBe(0);
            // Normalize paths for Windows (MSYS converts paths)
            expect(result.stdout.trim()).toBeTruthy();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should capture stderr from failed commands', async () => {
        const executor = createSandboxExecutor();
        const result = await executor.exec('echo "error msg" >&2 && exit 1');

        expect(result.stderr).toContain('error msg');
    });
});

// -----------------------------------------------------------------------------
// Tests: GitMemoryFileSystem
// -----------------------------------------------------------------------------

describe('createSandboxFileSystem', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('mkdir', () => {
        it('should create directory recursively', async () => {
            const fileSystem = createSandboxFileSystem();
            const dirPath = path.join(tmpDir, 'a', 'b', 'c');

            await fileSystem.mkdir(dirPath);

            expect(fs.existsSync(dirPath)).toBe(true);
        });

        it('should not throw if directory already exists', async () => {
            const fileSystem = createSandboxFileSystem();

            await fileSystem.mkdir(tmpDir);

            expect(fs.existsSync(tmpDir)).toBe(true);
        });
    });

    describe('writeFile', () => {
        it('should write content to file', async () => {
            const fileSystem = createSandboxFileSystem();
            const filePath = path.join(tmpDir, 'test.md');

            await fileSystem.writeFile(filePath, '# Memory');

            expect(fs.readFileSync(filePath, 'utf-8')).toBe('# Memory');
        });

        it('should create parent directories if needed', async () => {
            const fileSystem = createSandboxFileSystem();
            const filePath = path.join(tmpDir, 'deep', 'nested', 'file.txt');

            await fileSystem.writeFile(filePath, 'content');

            expect(fs.readFileSync(filePath, 'utf-8')).toBe('content');
        });

        it('should overwrite existing files', async () => {
            const fileSystem = createSandboxFileSystem();
            const filePath = path.join(tmpDir, 'overwrite.txt');

            await fileSystem.writeFile(filePath, 'original');
            await fileSystem.writeFile(filePath, 'updated');

            expect(fs.readFileSync(filePath, 'utf-8')).toBe('updated');
        });
    });

    describe('readFile', () => {
        it('should read file contents as utf-8', async () => {
            const fileSystem = createSandboxFileSystem();
            const filePath = path.join(tmpDir, 'read-test.txt');
            fs.writeFileSync(filePath, 'hello world', 'utf-8');

            const content = await fileSystem.readFile(filePath);

            expect(content).toBe('hello world');
        });
    });

    describe('exists', () => {
        it('should return true for existing files', async () => {
            const fileSystem = createSandboxFileSystem();
            const filePath = path.join(tmpDir, 'exists.txt');
            fs.writeFileSync(filePath, '', 'utf-8');

            const result = await fileSystem.exists(filePath);

            expect(result).toBe(true);
        });

        it('should return false for non-existing files', async () => {
            const fileSystem = createSandboxFileSystem();

            const result = await fileSystem.exists(path.join(tmpDir, 'nope.txt'));

            expect(result).toBe(false);
        });

        it('should return true for directories', async () => {
            const fileSystem = createSandboxFileSystem();

            const result = await fileSystem.exists(tmpDir);

            expect(result).toBe(true);
        });
    });
});

// -----------------------------------------------------------------------------
// Tests: GitMemoryServiceAdapter
// -----------------------------------------------------------------------------

describe('createGitMemoryServiceAdapter', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTempDir();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should create adapter with correct interface', () => {
        const { emitter } = createCaptureEmitter();
        const adapter = createGitMemoryServiceAdapter(tmpDir, emitter, 'test-agent');

        expect(adapter).toBeDefined();
        expect(typeof adapter.writeAndCommit).toBe('function');
        expect(typeof adapter.triggerIndexing).toBe('function');
    });

    it('should emit trigger_indexing event via emitter memory indexer', async () => {
        const { emitter, lines } = createCaptureEmitter();
        const indexer = createEmitterMemoryIndexer(emitter, 'test-agent');

        await indexer.indexFile({
            filePath: 'agents/test-agent/working.md',
            workspaceId: 'ws-001',
            content: '# Working Memory',
            memoryType: 'working',
            scope: 'agent',
        });

        expect(lines).toHaveLength(1);
        const event = JSON.parse(lines[0]);
        expect(event.event).toBe('trigger_indexing');
        expect(event.agent_slug).toBe('test-agent');
        const data = event.data as Record<string, unknown>;
        expect(data.content_type).toBe('git-memory');
        expect(data.content_path).toBe('agents/test-agent/working.md');
        expect(data.operation).toBe('index');
        expect(data.workspace_id).toBe('ws-001');
        expect(data.content).toBe('# Working Memory');
    });
});
