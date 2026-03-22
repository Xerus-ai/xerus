// Scaffold Command Tests
// Tests for scaffold_agent stdin command, scaffoldAgent() function,
// stdout scaffoldComplete event, and agent-runner integration

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Readable, Writable } from 'stream';
import { StdinParser, StdinCommand } from '../stdin-parser';
import { StdoutEmitter, StdoutEvent } from '../stdout-emitter';
import { scaffoldAgent } from '../../scaffold/scaffold-writer';

// --- StdinParser: scaffold_agent command ---

function createReadable(lines: string[]): Readable {
    const readable = new Readable({ read() {} });
    for (const line of lines) {
        readable.push(line + '\n');
    }
    readable.push(null);
    return readable;
}

describe('StdinParser scaffold_agent', () => {
    let parser: StdinParser;

    beforeEach(() => {
        parser = new StdinParser();
    });

    afterEach(() => {
        parser.stop();
    });

    it('accepts scaffold_agent as a valid command type', (done) => {
        const cmd = {
            type: 'scaffold_agent',
            agent_slug: 'test-agent',
            files: [
                { path: 'config.json', content: '{}' },
            ],
        };
        const input = createReadable([JSON.stringify(cmd)]);

        parser.on('command', (parsed: StdinCommand) => {
            expect(parsed.type).toBe('scaffold_agent');
            expect(parsed.agent_slug).toBe('test-agent');
            expect(parsed.files).toHaveLength(1);
            expect(parsed.files![0].path).toBe('config.json');
            expect(parsed.files![0].content).toBe('{}');
            done();
        });

        parser.start(input);
    });

    it('passes through multiple files in the files array', (done) => {
        const cmd = {
            type: 'scaffold_agent',
            agent_slug: 'writer',
            files: [
                { path: 'config.json', content: '{"name":"Writer"}' },
                { path: 'SOUL.md', content: '# Soul' },
                { path: 'nested/deep/file.txt', content: 'deep' },
            ],
        };
        const input = createReadable([JSON.stringify(cmd)]);

        parser.on('command', (parsed: StdinCommand) => {
            expect(parsed.files).toHaveLength(3);
            expect(parsed.files![2].path).toBe('nested/deep/file.txt');
            done();
        });

        parser.start(input);
    });

    it('sets files to undefined when files field is missing', (done) => {
        const cmd = {
            type: 'scaffold_agent',
            agent_slug: 'no-files-agent',
        };
        const input = createReadable([JSON.stringify(cmd)]);

        parser.on('command', (parsed: StdinCommand) => {
            expect(parsed.type).toBe('scaffold_agent');
            expect(parsed.files).toBeUndefined();
            done();
        });

        parser.start(input);
    });

    it('sets files to undefined when files field is not an array', (done) => {
        const cmd = {
            type: 'scaffold_agent',
            agent_slug: 'bad-files',
            files: 'not-an-array',
        };
        const input = createReadable([JSON.stringify(cmd)]);

        parser.on('command', (parsed: StdinCommand) => {
            expect(parsed.files).toBeUndefined();
            done();
        });

        parser.start(input);
    });
});

// --- scaffoldAgent function ---

describe('scaffoldAgent', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-scaffold-test-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('writes files to workspace-relative paths', async () => {
        const files = [
            { path: 'agents/test-agent/config.json', content: '{"name":"TestAgent"}' },
            { path: 'agents/test-agent/SOUL.md', content: '# Soul\nIdentity' },
        ];

        const count = await scaffoldAgent(tmpDir, files);

        expect(count).toBe(2);
        const configContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'test-agent', 'config.json'), 'utf-8',
        );
        expect(configContent).toBe('{"name":"TestAgent"}');

        const soulContent = await fs.readFile(
            path.join(tmpDir, 'agents', 'test-agent', 'SOUL.md'), 'utf-8',
        );
        expect(soulContent).toBe('# Soul\nIdentity');
    });

    it('creates nested directories as needed', async () => {
        const files = [
            { path: 'agents/nested-agent/inbox/processed/.gitkeep', content: '' },
            { path: 'agents/nested-agent/knowledge/docs/guide.md', content: '# Guide' },
        ];

        const count = await scaffoldAgent(tmpDir, files);

        expect(count).toBe(2);
        const guide = await fs.readFile(
            path.join(tmpDir, 'agents', 'nested-agent', 'knowledge', 'docs', 'guide.md'), 'utf-8',
        );
        expect(guide).toBe('# Guide');
    });

    it('writes memory files to .memory/ path', async () => {
        const files = [
            { path: '.memory/agents/mem-agent/working.md', content: '# Working' },
        ];

        const count = await scaffoldAgent(tmpDir, files);

        expect(count).toBe(1);
        const content = await fs.readFile(
            path.join(tmpDir, '.memory', 'agents', 'mem-agent', 'working.md'), 'utf-8',
        );
        expect(content).toBe('# Working');
    });

    it('returns 0 for empty files array', async () => {
        const count = await scaffoldAgent(tmpDir, []);
        expect(count).toBe(0);
    });

    it('overwrites existing files', async () => {
        const agentDir = path.join(tmpDir, 'agents', 'overwrite-agent');
        await fs.mkdir(agentDir, { recursive: true });
        await fs.writeFile(path.join(agentDir, 'config.json'), '{"name":"OldAgent"}');

        const files = [{ path: 'agents/overwrite-agent/config.json', content: '{"name":"NewAgent"}' }];
        const count = await scaffoldAgent(tmpDir, files);

        expect(count).toBe(1);
        const content = await fs.readFile(path.join(agentDir, 'config.json'), 'utf-8');
        expect(content).toBe('{"name":"NewAgent"}');
    });
});

// --- StdoutEmitter: scaffoldComplete ---

describe('StdoutEmitter scaffoldComplete', () => {
    it('emits scaffold_complete event with correct structure', () => {
        const chunks: string[] = [];
        const output = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(chunk.toString());
                callback();
            },
        });

        const emitter = new StdoutEmitter(output);
        emitter.scaffoldComplete('my-agent', 5);

        expect(chunks).toHaveLength(1);
        const event: StdoutEvent = JSON.parse(chunks[0]);
        expect(event.event).toBe('scaffold_complete');
        expect(event.agent_slug).toBe('my-agent');
        expect((event.data as Record<string, unknown>).files_written).toBe(5);
        expect(event.timestamp).toBeDefined();
    });
});
