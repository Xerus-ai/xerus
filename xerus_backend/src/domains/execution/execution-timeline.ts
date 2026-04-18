// Execution Timeline Builder
// Converts persisted tool_call details into a step-level timeline for
// GET /execute/:id/status. Consumed by both the chat and inbox execution
// detail panels — the inbox uses it to render the "View work" sheet.

import { resolveToolIcon, PersistedToolIcon } from './execution-conversation.helpers';
import type { ToolCallDetail } from './execution-pipeline.types';

// -----------------------------------------------------------------------------
// Public Contract (wire shape for /execute/:id/status)
// -----------------------------------------------------------------------------

export type TimelineStepKind = 'bash' | 'read' | 'write' | 'search' | 'web' | 'think';

export interface ExecutionTimelineStep {
    id: string;
    kind: TimelineStepKind;
    title: string;
    detail?: string;
    output?: string;
    duration_ms: number;
    status: 'success' | 'error';
}

export interface ExecutionTimeline {
    steps: ExecutionTimelineStep[];
    files_changed: string[];
}

// -----------------------------------------------------------------------------
// Kind Clamping
// resolveToolIcon returns 10 categories; the UI only renders 6.
// Delegation/question/task/skill all visually read as "think" — the agent is
// reasoning about how to proceed, not touching a file or running a command.
// -----------------------------------------------------------------------------

const ICON_TO_KIND: Record<PersistedToolIcon, TimelineStepKind> = {
    read: 'read',
    write: 'write',
    search: 'search',
    bash: 'bash',
    web: 'web',
    think: 'think',
    agent: 'think',
    skill: 'think',
    task: 'think',
    question: 'think',
};

function clampKind(icon: PersistedToolIcon): TimelineStepKind {
    return ICON_TO_KIND[icon];
}

// -----------------------------------------------------------------------------
// Field Extractors
// -----------------------------------------------------------------------------

const MAX_DETAIL_CHARS = 120;
const MAX_OUTPUT_CHARS = 400;

function basename(path: string): string {
    const withForward = path.replace(/\\/g, '/');
    const parts = withForward.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : path;
}

function firstStringArg(args: Record<string, unknown> | undefined): string | undefined {
    if (!args) return undefined;
    for (const value of Object.values(args)) {
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}

function readString(args: Record<string, unknown> | undefined, key: string): string | undefined {
    if (!args) return undefined;
    const v = args[key];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Derive a human-readable title from tool_name + args.
 * Prefer verb-first phrasing so the timeline reads as a story:
 *   "Read engagement-report.md"
 *   "Searched 'tutorial'"
 *   "Ran pytest"
 */
function buildTitle(toolName: string, args: Record<string, unknown> | undefined): string {
    const lower = toolName.toLowerCase();

    if (lower === 'read') {
        const fp = readString(args, 'file_path') ?? firstStringArg(args);
        return fp ? `Read ${basename(fp)}` : 'Read file';
    }
    if (lower === 'write') {
        const fp = readString(args, 'file_path') ?? firstStringArg(args);
        return fp ? `Wrote ${basename(fp)}` : 'Wrote file';
    }
    if (lower === 'edit' || lower === 'notebookedit') {
        const fp = readString(args, 'file_path') ?? firstStringArg(args);
        return fp ? `Edited ${basename(fp)}` : 'Edited file';
    }
    if (lower === 'grep') {
        const pattern = readString(args, 'pattern');
        return pattern ? `Searched "${truncate(pattern, 40)}"` : 'Searched files';
    }
    if (lower === 'glob') {
        const pattern = readString(args, 'pattern');
        return pattern ? `Matched ${pattern}` : 'Matched files';
    }
    if (lower === 'bash') {
        const cmd = readString(args, 'command');
        if (!cmd) return 'Ran command';
        const firstWord = cmd.trim().split(/\s+/)[0];
        return `Ran ${firstWord}`;
    }
    if (lower === 'webfetch') {
        const url = readString(args, 'url');
        if (!url) return 'Fetched URL';
        try {
            return `Fetched ${new URL(url).hostname}`;
        } catch {
            return 'Fetched URL';
        }
    }
    if (lower === 'websearch') {
        const q = readString(args, 'query');
        return q ? `Searched web: ${truncate(q, 50)}` : 'Searched the web';
    }
    if (lower === 'task' || lower === 'agent') {
        const subagent = readString(args, 'subagent_type') ?? readString(args, 'description');
        return subagent ? `Delegated to ${subagent}` : 'Delegated to subagent';
    }
    if (lower === 'skill') {
        const skill = readString(args, 'skill') ?? readString(args, 'name');
        return skill ? `Invoked skill: ${skill}` : 'Invoked skill';
    }
    if (lower === 'todowrite' || lower === 'taskcreate' || lower === 'taskupdate') {
        return 'Updated task list';
    }
    if (lower === 'askuserquestion') {
        return 'Asked human for input';
    }
    if (lower === 'toolsearch') {
        const q = readString(args, 'query');
        return q ? `Looked up tool: ${truncate(q, 40)}` : 'Looked up tool';
    }

    return toolName;
}

/**
 * Derive a secondary detail string (monospace in UI) — usually the file path,
 * command, pattern, or URL the tool acted on.
 */
function buildDetail(toolName: string, args: Record<string, unknown> | undefined): string | undefined {
    if (!args) return undefined;
    const lower = toolName.toLowerCase();

    if (lower === 'read' || lower === 'write' || lower === 'edit' || lower === 'notebookedit') {
        const fp = readString(args, 'file_path');
        return fp ? truncate(fp, MAX_DETAIL_CHARS) : undefined;
    }
    if (lower === 'bash') {
        const cmd = readString(args, 'command');
        return cmd ? truncate(cmd, MAX_DETAIL_CHARS) : undefined;
    }
    if (lower === 'grep') {
        const pattern = readString(args, 'pattern');
        const path = readString(args, 'path');
        if (pattern && path) return truncate(`${pattern} in ${path}`, MAX_DETAIL_CHARS);
        return pattern ? truncate(pattern, MAX_DETAIL_CHARS) : undefined;
    }
    if (lower === 'glob') {
        return readString(args, 'pattern');
    }
    if (lower === 'webfetch') {
        return readString(args, 'url');
    }
    if (lower === 'websearch') {
        return readString(args, 'query');
    }
    return undefined;
}

/**
 * Flatten a tool result into a short string preview.
 * Accepts raw string (most Read/Bash/Grep tools return strings) or an object
 * with common fields (`content`, `text`, `output`, `result`).
 */
function buildOutput(result: unknown): string | undefined {
    if (result === null || result === undefined) return undefined;

    if (typeof result === 'string') {
        const trimmed = result.trim();
        return trimmed.length > 0 ? truncate(trimmed, MAX_OUTPUT_CHARS) : undefined;
    }

    if (typeof result === 'object') {
        const obj = result as Record<string, unknown>;
        for (const key of ['content', 'text', 'output', 'result', 'message']) {
            const v = obj[key];
            if (typeof v === 'string' && v.trim().length > 0) {
                return truncate(v.trim(), MAX_OUTPUT_CHARS);
            }
        }
    }

    return undefined;
}

// -----------------------------------------------------------------------------
// Files Changed
// Collect file paths from write-kind tool calls so the UI can list them under
// "Files Changed" — this is what agents actually produced during the run.
// -----------------------------------------------------------------------------

const WRITE_TOOL_NAMES = new Set(['write', 'edit', 'notebookedit']);

function extractWrittenFile(tc: ToolCallDetail): string | null {
    if (!WRITE_TOOL_NAMES.has(tc.tool_name.toLowerCase())) return null;
    if (tc.success === false) return null;
    const fp = readString(tc.arguments, 'file_path');
    return fp ?? null;
}

// -----------------------------------------------------------------------------
// Public Builder
// -----------------------------------------------------------------------------

/**
 * Build the timeline shape returned by GET /execute/:id/status.
 * Consumed by the inbox "View work" sheet (and any future execution viewers).
 *
 * Throws if a tool call is missing required identifiers — fail-fast so we
 * surface data corruption rather than render a half-broken timeline.
 */
export function buildExecutionTimeline(toolCalls: ToolCallDetail[]): ExecutionTimeline {
    const steps: ExecutionTimelineStep[] = [];
    const filesChanged = new Set<string>();

    for (const tc of toolCalls) {
        if (!tc.call_id) {
            throw new Error('Data integrity: tool_call missing call_id');
        }
        if (!tc.tool_name) {
            throw new Error(`Data integrity: tool_call ${tc.call_id} missing tool_name`);
        }

        const kind = clampKind(resolveToolIcon(tc.tool_name));
        const step: ExecutionTimelineStep = {
            id: tc.call_id,
            kind,
            title: buildTitle(tc.tool_name, tc.arguments),
            duration_ms: tc.duration_ms ?? 0,
            status: tc.success === false ? 'error' : 'success',
        };

        const detail = buildDetail(tc.tool_name, tc.arguments);
        if (detail) step.detail = detail;

        const output = buildOutput(tc.result);
        if (output) step.output = output;

        steps.push(step);

        const written = extractWrittenFile(tc);
        if (written) filesChanged.add(written);
    }

    return {
        steps,
        files_changed: Array.from(filesChanged),
    };
}
