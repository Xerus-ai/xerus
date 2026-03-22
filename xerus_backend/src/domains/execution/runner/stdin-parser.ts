// Stdin Parser
// Reads JSON commands from stdin (sent by backend via Daytona Sessions API)
// Routes commands to appropriate handlers

import readline from 'readline';
import { EventEmitter } from 'events';
import type { ScaffoldFile } from './runner.types';

// Command types that the backend can send to the runner
export type StdinCommandType =
    | 'execute'
    | 'message'
    | 'interrupt'
    | 'heartbeat'
    | 'done'
    | 'health'
    | 'list_sessions'
    | 'scaffold_agent'
    | 'hitl_response';

export interface StdinCommand {
    type: StdinCommandType;
    agent_slug?: string;
    content?: string;
    session_id?: string;
    config?: Record<string, unknown>;
    files?: ScaffoldFile[];
}

export interface ExecuteCommand extends StdinCommand {
    type: 'execute';
    agent_slug: string;
    content: string;
    config?: {
        system_prompt?: string;
        model?: string;
        tools?: string[];
        max_turns?: number;
        mcp_servers?: Record<string, unknown>;
        cwd?: string;
    };
}

export interface MessageCommand extends StdinCommand {
    type: 'message';
    agent_slug: string;
    content: string;
}

export interface InterruptCommand extends StdinCommand {
    type: 'interrupt';
    agent_slug: string;
}

export interface HeartbeatCommand extends StdinCommand {
    type: 'heartbeat';
    agent_slug: string;
}

export interface DoneCommand extends StdinCommand {
    type: 'done';
    agent_slug: string;
}

export interface HealthCommand extends StdinCommand {
    type: 'health';
}

export interface ListSessionsCommand extends StdinCommand {
    type: 'list_sessions';
}

export interface ScaffoldAgentCommand extends StdinCommand {
    type: 'scaffold_agent';
    agent_slug: string;
    files: ScaffoldFile[];
}

export interface HitlResponseCommand extends StdinCommand {
    type: 'hitl_response';
    pause_id: string;
    approved: boolean;
    feedback?: string;
}

const VALID_COMMAND_TYPES: ReadonlySet<string> = new Set([
    'execute', 'message', 'interrupt', 'heartbeat', 'done', 'health', 'list_sessions', 'scaffold_agent', 'hitl_response',
]);

export class StdinParser extends EventEmitter {
    private rl: readline.Interface | null = null;
    private closed = false;

    start(input: NodeJS.ReadableStream = process.stdin): void {
        if (this.rl) {
            throw new Error('StdinParser already started');
        }

        this.rl = readline.createInterface({ input, terminal: false });

        this.rl.on('line', (line: string) => {
            this.parseLine(line);
        });

        this.rl.on('close', () => {
            this.closed = true;
            this.emit('close');
        });
    }

    stop(): void {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        this.closed = true;
    }

    isClosed(): boolean {
        return this.closed;
    }

    private parseLine(line: string): void {
        const trimmed = line.trim();
        if (trimmed.length === 0) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            this.emit('error', new Error(`Invalid JSON on stdin: ${trimmed.slice(0, 200)}`));
            return;
        }

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            this.emit('error', new Error('Stdin command must be a JSON object'));
            return;
        }

        const cmd = parsed as Record<string, unknown>;
        if (typeof cmd.type !== 'string' || !VALID_COMMAND_TYPES.has(cmd.type)) {
            this.emit('error', new Error(`Unknown command type: ${String(cmd.type)}`));
            return;
        }

        const command: StdinCommand & Record<string, unknown> = {
            type: cmd.type as StdinCommandType,
            agent_slug: typeof cmd.agent_slug === 'string' ? cmd.agent_slug : undefined,
            content: typeof cmd.content === 'string' ? cmd.content : undefined,
            session_id: typeof cmd.session_id === 'string' ? cmd.session_id : undefined,
            config: typeof cmd.config === 'object' && cmd.config !== null
                ? cmd.config as Record<string, unknown>
                : undefined,
            files: Array.isArray(cmd.files) ? cmd.files as Array<{ path: string; content: string }> : undefined,
        };

        // HITL response fields — fail-fast on missing/wrong types
        if (cmd.type === 'hitl_response') {
            if (typeof cmd.pause_id !== 'string' || !cmd.pause_id) {
                this.emit('error', new Error('hitl_response: pause_id must be a non-empty string'));
                return;
            }
            if (typeof cmd.approved !== 'boolean') {
                this.emit('error', new Error('hitl_response: approved must be a boolean'));
                return;
            }
            command.pause_id = cmd.pause_id;
            command.approved = cmd.approved;
            command.feedback = typeof cmd.feedback === 'string' ? cmd.feedback : undefined;
        }

        this.emit('command', command);
    }
}
