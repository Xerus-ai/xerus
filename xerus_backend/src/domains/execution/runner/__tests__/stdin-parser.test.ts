import { Readable } from 'stream';
import { StdinParser, StdinCommand } from '../stdin-parser';

function createReadable(lines: string[]): Readable {
    const readable = new Readable({ read() {} });
    for (const line of lines) {
        readable.push(line + '\n');
    }
    readable.push(null);
    return readable;
}

describe('StdinParser', () => {
    let parser: StdinParser;

    beforeEach(() => {
        parser = new StdinParser();
    });

    afterEach(() => {
        parser.stop();
    });

    it('parses valid JSON command from stdin', (done) => {
        const input = createReadable([
            JSON.stringify({ type: 'health' }),
        ]);

        parser.on('command', (cmd: StdinCommand) => {
            expect(cmd.type).toBe('health');
            done();
        });

        parser.start(input);
    });

    it('parses execute command with all fields', (done) => {
        const cmd = {
            type: 'execute',
            agent_slug: 'seo-writer',
            content: 'analyze backlinks',
            config: { model: 'claude-sonnet-4-5-20250929' },
        };
        const input = createReadable([JSON.stringify(cmd)]);

        parser.on('command', (parsed: StdinCommand) => {
            expect(parsed.type).toBe('execute');
            expect(parsed.agent_slug).toBe('seo-writer');
            expect(parsed.content).toBe('analyze backlinks');
            done();
        });

        parser.start(input);
    });

    it('emits error for invalid JSON', (done) => {
        const input = createReadable(['not valid json']);

        parser.on('error', (err: Error) => {
            expect(err.message).toContain('Invalid JSON');
            done();
        });

        parser.start(input);
    });

    it('emits error for unknown command type', (done) => {
        const input = createReadable([
            JSON.stringify({ type: 'unknown_type' }),
        ]);

        parser.on('error', (err: Error) => {
            expect(err.message).toContain('Unknown command type');
            done();
        });

        parser.start(input);
    });

    it('ignores empty lines', (done) => {
        const commands: StdinCommand[] = [];
        const input = createReadable([
            '',
            JSON.stringify({ type: 'health' }),
            '  ',
            JSON.stringify({ type: 'list_sessions' }),
        ]);

        parser.on('command', (cmd: StdinCommand) => {
            commands.push(cmd);
        });

        parser.on('close', () => {
            expect(commands).toHaveLength(2);
            expect(commands[0].type).toBe('health');
            expect(commands[1].type).toBe('list_sessions');
            done();
        });

        parser.start(input);
    });

    it('parses all valid command types', (done) => {
        const types = ['execute', 'message', 'interrupt', 'heartbeat', 'done', 'health', 'list_sessions'];
        const input = createReadable(
            types.map(type => JSON.stringify({ type, agent_slug: 'test' })),
        );

        const received: string[] = [];
        parser.on('command', (cmd: StdinCommand) => {
            received.push(cmd.type);
        });

        parser.on('close', () => {
            expect(received).toEqual(types);
            done();
        });

        parser.start(input);
    });

    it('throws if started twice', () => {
        const input = createReadable([]);
        parser.start(input);
        expect(() => parser.start(input)).toThrow('already started');
    });

    it('emits close when input stream ends', (done) => {
        const input = createReadable([]);
        parser.on('close', () => {
            expect(parser.isClosed()).toBe(true);
            done();
        });
        parser.start(input);
    });

    it('emits error for non-object JSON', (done) => {
        const input = createReadable(['"just a string"']);

        parser.on('error', (err: Error) => {
            expect(err.message).toContain('must be a JSON object');
            done();
        });

        parser.start(input);
    });
});
