// Daytona Runner Tests - Sessions API Transport
// Tests for createRunnerSession, sendCommand, streamEvents, runAgentInSandbox

import {
    RunAgentInSandboxOptions,
    SessionHandle,
    AgentSessionOptions,
    PersistentLogBuffer,
    createAgentSession,
    sendCommand,
    streamEvents,
    runAgentInSandbox,
} from '../daytona-runner';
import { RunnerEvent, AgentOutputEvent } from '../../../runner/runner.types';

// Build a SessionHandle with a real PersistentLogBuffer.
// streamLogs callback feeds the logBuffer via start().
// The wrapper keeps the buffer alive after streamLogs resolves
// (unless streamLogs throws, which closes the buffer via catch path).
function buildTestHandle(opts: {
    sendInput?: (data: string) => Promise<void>;
    streamLogs?: SessionHandle['streamLogs'];
}): SessionHandle {
    const streamLogsFn: SessionHandle['streamLogs'] = opts.streamLogs || (async () => {});
    const logBuffer = new PersistentLogBuffer();
    logBuffer.start(async (onStdout, onStderr) => {
        await streamLogsFn(onStdout, onStderr);
        await new Promise<void>(() => {}); // keep buffer open
    });
    return {
        sessionId: 'agent-test',
        commandId: 'cmd-1',
        agentSlug: 'test',
        sendInput: opts.sendInput || (async () => {}),
        streamLogs: streamLogsFn,
        logBuffer,
    };
}

// Build a fake Sandbox that implements the Sessions API surface we use
function buildFakeSandbox(overrides?: {
    createSessionError?: Error;
    executeSessionCommandResult?: { cmdId: string };
    sendInputCapture?: string[];
    logChunks?: { stdout?: string[]; stderr?: string[] };
    executeSessionCommandError?: Error;
}) {
    const sendInputCapture = overrides?.sendInputCapture || [];
    const logChunks = overrides?.logChunks || { stdout: [], stderr: [] };

    return {
        process: {
            deleteSession: async (_sessionId: string): Promise<void> => {},
            createSession: async (_sessionId: string): Promise<void> => {
                if (overrides?.createSessionError) {
                    throw overrides.createSessionError;
                }
            },
            executeSessionCommand: async (
                _sessionId: string,
                _req: { command: string; runAsync?: boolean },
            ) => {
                if (overrides?.executeSessionCommandError) {
                    throw overrides.executeSessionCommandError;
                }
                return overrides?.executeSessionCommandResult || { cmdId: 'cmd-test-123' };
            },
            sendSessionCommandInput: async (
                _sessionId: string,
                _commandId: string,
                data: string,
            ): Promise<void> => {
                sendInputCapture.push(data);
            },
            getSessionCommandLogs: async (
                _sessionId: string,
                _commandId: string,
                onStdout: (chunk: string) => void,
                onStderr: (chunk: string) => void,
            ): Promise<void> => {
                // Deliver events asynchronously (simulates real Daytona streaming)
                await new Promise(resolve => setTimeout(resolve, 10));
                for (const chunk of logChunks.stdout || []) {
                    onStdout(chunk);
                }
                for (const chunk of logChunks.stderr || []) {
                    onStderr(chunk);
                }
                // Keep stream alive (like a real streaming connection)
                await new Promise<void>(() => {});
            },
            executeCommand: async () => ({ result: '', exitCode: 0 }),
        },
        fs: {
            uploadFile: async () => {},
        },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const defaultAgentOpts: AgentSessionOptions = {
    agentSlug: 'test-agent',
    adapterType: 'claudecode',
};

describe('createAgentSession', () => {
    it('creates a session and returns a handle with sessionId and commandId', async () => {
        const sandbox = buildFakeSandbox({
            executeSessionCommandResult: { cmdId: 'cmd-abc' },
        });

        const handle = await createAgentSession(sandbox, { KEY: 'value' }, defaultAgentOpts);

        expect(handle.sessionId).toBe('agent-test-agent');
        expect(handle.commandId).toBe('cmd-abc');
        expect(handle.agentSlug).toBe('test-agent');
        expect(typeof handle.sendInput).toBe('function');
        expect(typeof handle.streamLogs).toBe('function');
    });

    it('deletes stale session before creating new one', async () => {
        let deleteSessionCalled = false;
        const sandbox = buildFakeSandbox({
            executeSessionCommandResult: { cmdId: 'cmd-fresh' },
        });
        sandbox.process.deleteSession = async () => { deleteSessionCalled = true; };

        const handle = await createAgentSession(sandbox, {}, defaultAgentOpts);
        expect(deleteSessionCalled).toBe(true);
        expect(handle.commandId).toBe('cmd-fresh');
    });

    it('handles missing stale session gracefully', async () => {
        const sandbox = buildFakeSandbox({
            executeSessionCommandResult: { cmdId: 'cmd-no-stale' },
        });
        sandbox.process.deleteSession = async () => { throw new Error('Session not found'); };

        const handle = await createAgentSession(sandbox, {}, defaultAgentOpts);
        expect(handle.commandId).toBe('cmd-no-stale');
    });

    it('throws when createSession fails', async () => {
        const sandbox = buildFakeSandbox({
            createSessionError: new Error('Session creation failed'),
        });

        await expect(createAgentSession(sandbox, {}, defaultAgentOpts)).rejects.toThrow('Session creation failed');
    });

    it('throws when executeSessionCommand returns no cmdId', async () => {
        const sandbox = buildFakeSandbox({
            executeSessionCommandResult: { cmdId: '' },
        });

        await expect(createAgentSession(sandbox, {}, defaultAgentOpts)).rejects.toThrow(
            'returned no command ID',
        );
    });

    it('throws when executeSessionCommand fails', async () => {
        const sandbox = buildFakeSandbox({
            executeSessionCommandError: new Error('Command failed'),
        });

        await expect(createAgentSession(sandbox, {}, defaultAgentOpts)).rejects.toThrow('Command failed');
    });

    it('passes environment variables as shell exports in the command', async () => {
        let capturedCommand = '';
        const sandbox = buildFakeSandbox();
        sandbox.process.executeSessionCommand = async (
            _sessionId: string,
            req: { command: string },
        ) => {
            capturedCommand = req.command;
            return { cmdId: 'cmd-env' };
        };

        await createAgentSession(sandbox, {
            MY_VAR: 'hello world',
            ANOTHER: 'test',
        }, defaultAgentOpts);

        expect(capturedCommand).toContain("export MY_VAR='hello world'");
        expect(capturedCommand).toContain("export ANOTHER='test'");
        // Should spawn claude directly (no cli-executor)
        expect(capturedCommand).toContain('claude');
        expect(capturedCommand).toContain('--output-format');
        expect(capturedCommand).toContain('stream-json');
    });

    it('escapes single quotes in environment values', async () => {
        let capturedCommand = '';
        const sandbox = buildFakeSandbox();
        sandbox.process.executeSessionCommand = async (
            _sessionId: string,
            req: { command: string },
        ) => {
            capturedCommand = req.command;
            return { cmdId: 'cmd-escape' };
        };

        await createAgentSession(sandbox, { VAL: "it's a test" }, defaultAgentOpts);

        expect(capturedCommand).toContain("export VAL='it'\\''s a test'");
    });

    it('creates codex session with correct adapter', async () => {
        let capturedCommand = '';
        const sandbox = buildFakeSandbox();
        sandbox.process.executeSessionCommand = async (
            _sessionId: string,
            req: { command: string },
        ) => {
            capturedCommand = req.command;
            return { cmdId: 'cmd-codex' };
        };

        const codexOpts: AgentSessionOptions = {
            agentSlug: 'code-helper',
            adapterType: 'codex',
        };
        const handle = await createAgentSession(sandbox, {}, codexOpts);

        expect(handle.sessionId).toBe('agent-code-helper');
        expect(capturedCommand).toContain('codex');
        expect(capturedCommand).toContain('full-auto');
    });
});

describe('sendCommand', () => {
    it('sends JSON-encoded command with newline', async () => {
        const captured: string[] = [];
        const handle = buildTestHandle({
            sendInput: async (data: string) => { captured.push(data); },
        });

        await sendCommand(handle, { type: 'message', content: 'hello' });

        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0].trim());
        expect(parsed.type).toBe('message');
        expect(parsed.content).toBe('hello');
        expect(captured[0].endsWith('\n')).toBe(true);
    });

    it('sends interrupt command', async () => {
        const captured: string[] = [];
        const handle = buildTestHandle({
            sendInput: async (data: string) => { captured.push(data); },
        });

        await sendCommand(handle, { type: 'interrupt' });

        const parsed = JSON.parse(captured[0].trim());
        expect(parsed.type).toBe('interrupt');
    });

    it('sends done command', async () => {
        const captured: string[] = [];
        const handle = buildTestHandle({
            sendInput: async (data: string) => { captured.push(data); },
        });

        await sendCommand(handle, { type: 'done' });

        const parsed = JSON.parse(captured[0].trim());
        expect(parsed.type).toBe('done');
    });
});

describe('streamEvents', () => {
    it('parses JSON lines from stdout into RunnerEvents', async () => {
        const events = [
            { event: 'session_started', agent: 'test', session_id: 'sess-1' },
            { event: 'agent_output', agent: 'test', session_id: 'sess-1', data: { type: 'text', message: 'hello' } },
            { event: 'session_ended', agent: 'test', session_id: 'sess-1', reason: 'complete', usage: { tokens: 15, cost_usd: 0.001 } },
        ];

        const handle = buildTestHandle({
            streamLogs: async (onStdout) => {
                for (const event of events) {
                    onStdout(JSON.stringify(event) + '\n');
                }
            },
        });

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, undefined, 0)) {
            collected.push(event);
            if (collected.length === 3) break;
        }

        expect(collected).toHaveLength(3);
        expect(collected[0].event).toBe('session_started');
        expect(collected[1].event).toBe('agent_output');
        expect(collected[2].event).toBe('session_ended');
    });

    it('handles non-JSON stdout lines as agent_output events', async () => {
        const handle = buildTestHandle({
            streamLogs: async (onStdout) => {
                onStdout('not valid json\n');
            },
        });

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, undefined, 0)) {
            collected.push(event);
            if (collected.length === 1) break;
        }

        expect(collected).toHaveLength(1);
        expect(collected[0].event).toBe('agent_output');
        const output = collected[0] as AgentOutputEvent;
        expect(output.data.type).toBe('stdout');
        expect(output.data.message).toBe('not valid json');
    });

    it('routes stderr to agent_output events', async () => {
        const handle = buildTestHandle({
            streamLogs: async (_onStdout, onStderr) => {
                onStderr('warning: something happened');
            },
        });

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, undefined, 0)) {
            collected.push(event);
            if (collected.length === 1) break;
        }

        expect(collected).toHaveLength(1);
        expect(collected[0].event).toBe('agent_output');
        const output = collected[0] as AgentOutputEvent;
        expect(output.data.type).toBe('stderr');
        expect(output.data.message).toBe('warning: something happened');
    });

    it('skips empty lines', async () => {
        const handle = buildTestHandle({
            streamLogs: async (onStdout) => {
                onStdout('\n\n  \n');
            },
        });

        // Buffer has no valid events, stays open. Use abort to exit.
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 50);

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, ac.signal, 0)) {
            collected.push(event);
        }

        expect(collected).toHaveLength(0);
    });

    it('handles multiple JSON events in a single chunk', async () => {
        const handle = buildTestHandle({
            streamLogs: async (onStdout) => {
                const chunk =
                    JSON.stringify({ event: 'session_started', agent: 'a', session_id: 's1' }) +
                    '\n' +
                    JSON.stringify({ event: 'agent_output', agent: 'a', session_id: 's1', data: { type: 'text', message: 'hi' } }) +
                    '\n';
                onStdout(chunk);
            },
        });

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, undefined, 0)) {
            collected.push(event);
            if (collected.length === 2) break;
        }

        expect(collected).toHaveLength(2);
        expect(collected[0].event).toBe('session_started');
        expect(collected[1].event).toBe('agent_output');
    });

    it('ends stream when abort signal is already aborted', async () => {
        const abortController = new AbortController();
        abortController.abort();

        const handle = buildTestHandle({});

        const collected: RunnerEvent[] = [];
        for await (const event of streamEvents(handle, abortController.signal, 0)) {
            collected.push(event);
        }

        expect(collected).toHaveLength(0);
    });

    it('stops yielding when abort signal fires mid-stream', async () => {
        const handle = buildTestHandle({
            streamLogs: async (onStdout) => {
                onStdout(JSON.stringify({ event: 'agent_output', agent: 'test', session_id: 's1', data: { type: 'text', message: 'a' } }) + '\n');
                await new Promise<void>((resolve) => { setTimeout(resolve, 200); });
                onStdout(JSON.stringify({ event: 'agent_output', agent: 'test', session_id: 's1', data: { type: 'text', message: 'b' } }) + '\n');
            },
        });

        const abortController = new AbortController();
        const collected: RunnerEvent[] = [];

        const streamPromise = (async () => {
            for await (const event of streamEvents(handle, abortController.signal, 0)) {
                collected.push(event);
                if (collected.length === 1) {
                    abortController.abort();
                }
            }
        })();

        await streamPromise;

        expect(collected).toHaveLength(1);
        expect(collected[0].event).toBe('agent_output');
    });
});

describe('runAgentInSandbox', () => {
    function buildOptions(overrides?: Partial<RunAgentInSandboxOptions>): RunAgentInSandboxOptions {
        const defaultConfig = {
            agentId: 1,
            agentSlug: 'test-agent',
            userId: 'user-1',
            workspacePath: '/workspace',
            model: 'claude-opus-4-6',
            tools: [],
            maxTurns: 10,
        };

        return {
            sandbox: buildFakeSandbox({
                logChunks: {
                    stdout: [
                        JSON.stringify({ event: 'session_started', agent: 'test-agent', session_id: 'sess-1' }) + '\n',
                        JSON.stringify({ event: 'session_ended', agent: 'test-agent', session_id: 'sess-1', reason: 'complete', usage: { tokens: 15, cost_usd: 0.001 } }) + '\n',
                    ],
                },
            }),
            config: defaultConfig,
            prompt: 'Hello agent',
            ...overrides,
        };
    }

    it('yields events from agent execution', async () => {
        const options = buildOptions();
        const collected: RunnerEvent[] = [];

        for await (const event of runAgentInSandbox(options)) {
            collected.push(event);
            if (collected.length === 2) break;
        }

        expect(collected).toHaveLength(2);
        expect(collected[0].event).toBe('session_started');
        expect(collected[1].event).toBe('session_ended');
    });

    it('sends initial message as plain text to stdin', async () => {
        const captured: string[] = [];
        const sandbox = buildFakeSandbox({
            sendInputCapture: captured,
            logChunks: { stdout: [JSON.stringify({ event: 'session_started', agent: 'test', session_id: 's1' }) + '\n'] },
        });
        const options = buildOptions({ sandbox, prompt: 'What is 2+2?' });

        for await (const _event of runAgentInSandbox(options)) {
            break;
        }

        expect(captured.length).toBeGreaterThanOrEqual(1);
        // Plain text message sent to CLI stdin (not JSON)
        expect(captured[0].trim()).toBe('What is 2+2?');
    });

    it('passes OpenRouter API key as env vars', async () => {
        let capturedCommand = '';
        const sandbox = buildFakeSandbox({
            logChunks: { stdout: [JSON.stringify({ event: 'session_started', agent: 'test', session_id: 's1' }) + '\n'] },
        });
        sandbox.process.executeSessionCommand = async (
            _sessionId: string,
            req: { command: string },
        ) => {
            capturedCommand = req.command;
            return { cmdId: 'cmd-or' };
        };

        const options = buildOptions({
            sandbox,
            openRouterApiKey: 'sk-or-test-key',
        });

        // capturedCommand is set during createRunnerSession, just consume first event
        for await (const _event of runAgentInSandbox(options)) {
            break;
        }

        expect(capturedCommand).toContain('ANTHROPIC_BASE_URL');
        expect(capturedCommand).toContain('https://openrouter.ai/api');
        expect(capturedCommand).toContain('ANTHROPIC_AUTH_TOKEN');
        expect(capturedCommand).toContain('sk-or-test-key');
    });

    it('yields cancelled error when abort signal is already aborted', async () => {
        const abortController = new AbortController();
        abortController.abort();

        const options = buildOptions({ abortSignal: abortController.signal });
        const collected: RunnerEvent[] = [];

        for await (const event of runAgentInSandbox(options)) {
            collected.push(event);
        }

        expect(collected).toHaveLength(1);
        expect(collected[0].event).toBe('error');
        expect((collected[0] as any).code).toBe('CANCELLED');
    });

    it('yields error on session creation failure after retries', async () => {
        const sandbox = buildFakeSandbox({
            executeSessionCommandError: new Error('Sandbox not reachable'),
        });

        const options = buildOptions({ sandbox });
        const collected: RunnerEvent[] = [];

        for await (const event of runAgentInSandbox(options)) {
            collected.push(event);
        }

        const errorEvent = collected.find((e) => e.event === 'error');
        expect(errorEvent).toBeDefined();
        expect((errorEvent as any).code).toBe('SESSION_CREATE_FAILED');
        expect((errorEvent as any).message).toContain('Sandbox not reachable');
    }, 30000);

    it('spawns CLI directly with agent slug in session name', async () => {
        let capturedSessionId = '';
        const sandbox = buildFakeSandbox({
            logChunks: { stdout: [JSON.stringify({ event: 'session_started', agent: 'test', session_id: 's1' }) + '\n'] },
        });
        sandbox.process.createSession = async (sessionId: string) => { capturedSessionId = sessionId; };
        sandbox.process.executeSessionCommand = async (
            _sessionId: string,
            _req: { command: string },
        ) => {
            return { cmdId: 'cmd-config' };
        };

        const config = {
            agentId: 42,
            agentSlug: 'my-agent',
            userId: 'user-99',
            workspacePath: '/workspace',
            model: 'claude-opus-4-6',
            tools: ['Bash', 'Read'],
            maxTurns: 20,
        };

        const options = buildOptions({ sandbox, config });

        for await (const _event of runAgentInSandbox(options)) {
            break;
        }

        // Session name follows agent-{slug} pattern
        expect(capturedSessionId).toBe('agent-my-agent');
    });
});

describe('PersistentLogBuffer', () => {
    function createBuffer(): PersistentLogBuffer {
        return new PersistentLogBuffer();
    }

    function startWithChunks(
        buffer: PersistentLogBuffer,
        stdoutChunks: string[],
        stderrChunks: string[] = [],
        keepOpen = false,
    ): void {
        buffer.start(async (onStdout, onStderr) => {
            for (const chunk of stdoutChunks) onStdout(chunk);
            for (const chunk of stderrChunks) onStderr(chunk);
            if (keepOpen) await new Promise<void>(() => {});
        });
    }

    async function collectEvents(
        buffer: PersistentLogBuffer,
        maxEvents: number,
        timeoutMs = 200,
    ): Promise<RunnerEvent[]> {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        const events: RunnerEvent[] = [];
        for await (const ev of buffer.readFrom(0, ac.signal)) {
            events.push(ev);
            if (events.length >= maxEvents) break;
        }
        clearTimeout(timer);
        return events;
    }

    it('reassembles JSON split across chunk boundaries', async () => {
        const buf = createBuffer();
        const json = JSON.stringify({ event: 'session_started', agent: 'a', session_id: 's1' });
        // Split the JSON in the middle
        const mid = Math.floor(json.length / 2);
        startWithChunks(buf, [json.slice(0, mid), json.slice(mid) + '\n']);

        const events = await collectEvents(buf, 1);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('session_started');
    });

    it('handles multiple lines in one chunk', async () => {
        const buf = createBuffer();
        const line1 = JSON.stringify({ event: 'session_started', agent: 'a', session_id: 's1' });
        const line2 = JSON.stringify({ event: 'agent_output', agent: 'a', session_id: 's1', data: { type: 'text', message: 'hi' } });
        startWithChunks(buf, [line1 + '\n' + line2 + '\n']);

        const events = await collectEvents(buf, 2);
        expect(events).toHaveLength(2);
        expect(events[0].event).toBe('session_started');
        expect(events[1].event).toBe('agent_output');
    });

    it('flushes remaining lineBuffer on close', async () => {
        const buf = createBuffer();
        // Send a partial line without trailing newline - will be flushed on close
        const json = JSON.stringify({ event: 'done', agent: 'a', session_id: 's1' });
        startWithChunks(buf, [json]); // no newline, stream closes after

        // Give a moment for the stream to close
        await new Promise(resolve => setTimeout(resolve, 50));
        const events = await collectEvents(buf, 1);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('done');
    });

    it('double-close does not push two sentinels', async () => {
        const buf = createBuffer();
        // Start with a stream that resolves immediately (triggering .then -> close)
        // The .catch path won't fire, but we test the guard anyway
        startWithChunks(buf, [JSON.stringify({ event: 'done', agent: 'a', session_id: 's1' }) + '\n']);

        await new Promise(resolve => setTimeout(resolve, 50));

        // Read all events - should get exactly one event then stream ends
        const events = await collectEvents(buf, 10, 100);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('done');
    });

    it('emits error event when stream fails', async () => {
        const buf = createBuffer();
        buf.start(async () => {
            throw new Error('connection lost');
        });

        await new Promise(resolve => setTimeout(resolve, 50));
        const events = await collectEvents(buf, 1);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('error');
        expect((events[0] as any).message).toContain('connection lost');
        expect((events[0] as any).code).toBe('STREAM_ERROR');
    });

    // Stderr is NOT line-buffered (by design - stderr messages are typically
    // short diagnostic lines, not split JSON payloads)
    it('stderr goes directly to buffer without line buffering', async () => {
        const buf = createBuffer();
        startWithChunks(buf, [], ['warning: low memory']);

        await new Promise(resolve => setTimeout(resolve, 50));
        const events = await collectEvents(buf, 1);
        expect(events).toHaveLength(1);
        expect(events[0].event).toBe('agent_output');
        expect((events[0] as AgentOutputEvent).data.type).toBe('stderr');
    });
});

describe('runner-script-factory deletion', () => {
    it('runner-script-factory.ts should not exist (replaced by Sessions API)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const factoryPath = path.join(
            __dirname,
            '..',
            'runner-script-factory.ts',
        );
        expect(fs.existsSync(factoryPath)).toBe(false);
    });
});
