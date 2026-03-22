// Heartbeat Processor Service
// Builds context messages for heartbeat triggers and routes agent output
// using routing tags ([POST], [ALERT], [MEMORY], [LOG], HEARTBEAT_OK).
//
// Core principle: Heartbeat = alarm clock. Agent = intelligence.
// Backend does NOT match skills to triggers.

import { HeartbeatConfig, HeartbeatTriggerType } from './types';
import { NormalizedEvent } from './normalized-event.types';
import { parseHeartbeatMd } from './heartbeat-md-parser';
import type { ParsedHeartbeatMd } from './heartbeat-md-parser';

// Re-export parser types and functions for convenience
export { parseHeartbeatMd, naturalLanguageToCron } from './heartbeat-md-parser';
export type {
    ParsedScheduleEntry,
    ParsedEventEntry,
    ParsedHeartbeatMd,
} from './heartbeat-md-parser';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HeartbeatRequest {
    agent_id: number;
    user_id: string;
    trigger_type: HeartbeatTriggerType;
    snapshot_path?: string;
    event?: NormalizedEvent;
    message?: string;
    last_run_at?: Date | null;
}

export interface RoutedPost {
    channel_slug: string;
    content: string;
}

export interface RoutedAlert {
    content: string;
    channel_slug: string;
}

export interface HeartbeatOutput {
    raw: string;
    suppressed: boolean;
    posts: RoutedPost[];
    memory_updates: string[];
    alerts: RoutedAlert[];
    logs: string[];
}

// -----------------------------------------------------------------------------
// Context Message Builders (pure functions)
// -----------------------------------------------------------------------------

export function buildContextMessage(request: HeartbeatRequest): string {
    switch (request.trigger_type) {
        case 'scheduled':
            return buildScheduledMessage(request);
        case 'event':
            return buildEventMessage(request);
        case 'manual':
            return buildManualMessage(request);
    }
}

function buildScheduledMessage(request: HeartbeatRequest): string {
    const now = new Date().toISOString();
    const lastRun = request.last_run_at
        ? request.last_run_at.toISOString()
        : 'never';

    const lines = [
        `Scheduled heartbeat. Time: ${now}. Last run: ${lastRun}.`,
        'Read your HEARTBEAT.md and context/snapshot/latest.md.',
    ];

    if (request.snapshot_path) {
        lines.push(`Snapshot available at: ${request.snapshot_path}`);
    }

    return lines.join('\n');
}

function buildEventMessage(request: HeartbeatRequest): string {
    if (!request.event) {
        throw new Error('Event heartbeat request requires an event payload');
    }

    const { app, event_type, payload } = request.event;
    const lines = [
        `Event: ${app}.${event_type}`,
        'Payload:',
        JSON.stringify(payload, null, 2),
        `Read your HEARTBEAT.md event handler for ${app}.${event_type}.`,
    ];

    return lines.join('\n');
}

function buildManualMessage(request: HeartbeatRequest): string {
    if (request.message) {
        return request.message;
    }
    return 'Manual heartbeat triggered. Read your HEARTBEAT.md.';
}

// -----------------------------------------------------------------------------
// Output Routing Tag Parser (pure function)
// -----------------------------------------------------------------------------

export function parseRoutingTags(
    output: string,
    config: Pick<HeartbeatConfig, 'suppress_token' | 'default_channel_id'>
): HeartbeatOutput {
    const suppressToken = config.suppress_token || 'HEARTBEAT_OK';

    if (output.trim() === suppressToken) {
        return {
            raw: output,
            suppressed: true,
            posts: [],
            memory_updates: [],
            alerts: [],
            logs: [],
        };
    }

    const posts: RoutedPost[] = [];
    const memory_updates: string[] = [];
    const alerts: RoutedAlert[] = [];
    const logs: string[] = [];

    const defaultChannel = config.default_channel_id
        ? String(config.default_channel_id)
        : 'default';

    const tagLinePattern = /^\[(POST|ALERT|MEMORY|LOG)\s*([#@][\w-]+)?\]\s*(.*)/;
    const lines = output.split('\n');
    let hasRoutedContent = false;
    let currentType: string | null = null;
    let currentTarget: string | null = null;
    let currentContent: string[] = [];

    const flushCurrent = () => {
        if (!currentType) return;
        const content = currentContent.join('\n').trim();
        if (!content) {
            currentType = null;
            currentTarget = null;
            currentContent = [];
            return;
        }
        hasRoutedContent = true;
        switch (currentType) {
            case 'POST':
                posts.push({
                    channel_slug: currentTarget ? currentTarget.slice(1) : defaultChannel,
                    content,
                });
                break;
            case 'ALERT':
                alerts.push({ content, channel_slug: defaultChannel });
                break;
            case 'MEMORY':
                memory_updates.push(content);
                break;
            case 'LOG':
                logs.push(content);
                break;
        }
        currentType = null;
        currentTarget = null;
        currentContent = [];
    };

    for (const line of lines) {
        const tagMatch = line.match(tagLinePattern);
        if (tagMatch) {
            flushCurrent();
            currentType = tagMatch[1];
            currentTarget = tagMatch[2] ?? null;
            if (tagMatch[3]) {
                currentContent.push(tagMatch[3]);
            }
        } else if (currentType) {
            currentContent.push(line);
        }
    }
    flushCurrent();

    if (!hasRoutedContent) {
        posts.push({
            channel_slug: defaultChannel,
            content: output.trim(),
        });
    }

    return {
        raw: output,
        suppressed: false,
        posts,
        memory_updates,
        alerts,
        logs,
    };
}

// -----------------------------------------------------------------------------
// Processor Service Class
// -----------------------------------------------------------------------------

export class HeartbeatProcessorService {
    buildContextMessage(request: HeartbeatRequest): string {
        return buildContextMessage(request);
    }

    parseHeartbeatMd(content: string): ParsedHeartbeatMd {
        return parseHeartbeatMd(content);
    }

    parseOutput(
        output: string,
        config: Pick<HeartbeatConfig, 'suppress_token' | 'default_channel_id'>
    ): HeartbeatOutput {
        return parseRoutingTags(output, config);
    }
}

export const heartbeatProcessorService = new HeartbeatProcessorService();
