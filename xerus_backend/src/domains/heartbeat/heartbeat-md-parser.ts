// HEARTBEAT.md Parser
// Parses HEARTBEAT.md format into structured data: identity, schedules, events.
// Converts natural language intervals (e.g. "Every 30 minutes") to cron expressions.

import { HeartbeatValidationError } from './errors';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ParsedScheduleEntry {
    interval_text: string;
    cron_expression: string;
    tasks: string[];
}

export interface ParsedEventEntry {
    app: string;
    event_type: string;
    filter: string | null;
    instructions: string[];
}

export interface ParsedHeartbeatMd {
    identity: string | null;
    schedules: ParsedScheduleEntry[];
    events: ParsedEventEntry[];
}

// -----------------------------------------------------------------------------
// HEARTBEAT.md Parser
// -----------------------------------------------------------------------------

export function parseHeartbeatMd(content: string): ParsedHeartbeatMd {
    const result: ParsedHeartbeatMd = {
        identity: null,
        schedules: [],
        events: [],
    };

    const sections = splitIntoSections(content);

    for (const section of sections) {
        if (section.heading.toLowerCase() === 'identity') {
            result.identity = section.body.trim() || null;
        } else if (section.heading.toLowerCase() === 'scheduled') {
            result.schedules = parseScheduledSection(section.body);
        } else if (section.heading.toLowerCase() === 'events') {
            result.events = parseEventsSection(section.body);
        }
    }

    return result;
}

interface Section {
    heading: string;
    body: string;
}

function splitIntoSections(content: string): Section[] {
    const sections: Section[] = [];
    const lines = content.split('\n');
    let currentHeading: string | null = null;
    let currentBody: string[] = [];

    for (const line of lines) {
        const h2Match = line.match(/^##\s+(.+)$/);
        if (h2Match) {
            if (currentHeading !== null) {
                sections.push({
                    heading: currentHeading,
                    body: currentBody.join('\n'),
                });
            }
            currentHeading = h2Match[1].trim();
            currentBody = [];
        } else {
            currentBody.push(line);
        }
    }

    if (currentHeading !== null) {
        sections.push({
            heading: currentHeading,
            body: currentBody.join('\n'),
        });
    }

    return sections;
}

function parseScheduledSection(body: string): ParsedScheduleEntry[] {
    const entries: ParsedScheduleEntry[] = [];
    const lines = body.split('\n');
    let currentEntry: ParsedScheduleEntry | null = null;

    for (const line of lines) {
        const h3Match = line.match(/^###\s+(.+)$/);
        if (h3Match) {
            if (currentEntry) {
                entries.push(currentEntry);
            }
            const intervalText = h3Match[1].trim();
            try {
                const cronExpression = naturalLanguageToCron(intervalText);
                currentEntry = { interval_text: intervalText, cron_expression: cronExpression, tasks: [] };
            } catch {
                // Skip unrecognized schedule pattern, continue parsing other entries
                currentEntry = null;
            }
        } else if (currentEntry) {
            const taskMatch = line.match(/^[-*]\s+(.+)$/);
            if (taskMatch) {
                currentEntry.tasks.push(taskMatch[1].trim());
            }
        }
    }

    if (currentEntry) {
        entries.push(currentEntry);
    }

    return entries;
}

function parseEventsSection(body: string): ParsedEventEntry[] {
    const entries: ParsedEventEntry[] = [];
    const lines = body.split('\n');
    let currentEntry: ParsedEventEntry | null = null;

    for (const line of lines) {
        const h3Match = line.match(/^###\s+On:\s+([^.\s]+)\.(\S+)\s*(?:\[filter:\s*"([^"]*)"?\])?\s*$/);
        if (h3Match) {
            if (currentEntry) {
                entries.push(currentEntry);
            }
            currentEntry = {
                app: h3Match[1],
                event_type: h3Match[2],
                filter: h3Match[3] ?? null,
                instructions: [],
            };
        } else if (currentEntry) {
            const taskMatch = line.match(/^[-*]\s+(.+)$/);
            if (taskMatch) {
                currentEntry.instructions.push(taskMatch[1].trim());
            }
        }
    }

    if (currentEntry) {
        entries.push(currentEntry);
    }

    return entries;
}

// -----------------------------------------------------------------------------
// Natural Language to Cron Conversion
// -----------------------------------------------------------------------------

export function naturalLanguageToCron(text: string): string {
    const lower = text.toLowerCase().trim();

    const minutesMatch = lower.match(/every\s+(\d+)\s+minutes?/);
    if (minutesMatch) {
        return `*/${minutesMatch[1]} * * * *`;
    }

    const hoursMatch = lower.match(/every\s+(\d+)\s+hours?/);
    if (hoursMatch) {
        return `0 */${hoursMatch[1]} * * *`;
    }

    const dailyMatch = lower.match(/daily\s+at\s+(\d{1,2}):(\d{2})/);
    if (dailyMatch) {
        return `${parseInt(dailyMatch[2], 10)} ${parseInt(dailyMatch[1], 10)} * * *`;
    }

    const weeklyMatch = lower.match(
        /weekly\s+(?:on\s+)?(\w+)\s+(?:at\s+)?(\d{1,2}):(\d{2})/
    );
    if (weeklyMatch) {
        const dayNum = dayOfWeekToNumber(weeklyMatch[1]);
        return `${parseInt(weeklyMatch[3], 10)} ${parseInt(weeklyMatch[2], 10)} * * ${dayNum}`;
    }

    if (lower === 'hourly' || lower === 'every hour') {
        return '0 * * * *';
    }

    if (lower === 'every half hour') {
        return '*/30 * * * *';
    }

    throw new HeartbeatValidationError(`Unrecognized schedule pattern: '${text}'`);
}

function dayOfWeekToNumber(day: string): number {
    const days: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
        sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    return days[day.toLowerCase()] ?? 0;
}

// -----------------------------------------------------------------------------
// HEARTBEAT.md Generator
// Converts DB heartbeat config + triggers to HEARTBEAT.md format
// -----------------------------------------------------------------------------

export interface HeartbeatMdInput {
    cron_expression: string;
    timezone: string;
    prompt: string | null;
    enabled: boolean;
    events?: Array<{ app_slug: string; event_type: string }>;
}

export function generateHeartbeatMd(input: HeartbeatMdInput): string {
    const lines: string[] = ['# Heartbeat', ''];

    // Scheduled section
    lines.push('## Scheduled');
    if (input.enabled && input.cron_expression) {
        const schedule = cronToHumanReadable(input.cron_expression, input.timezone);
        const prompt = input.prompt || 'check in and report status';
        lines.push(`- ${schedule} | ${prompt}`);
    } else {
        lines.push('(no scheduled tasks)');
    }

    lines.push('');

    // Events section
    lines.push('## Events');
    if (input.events && input.events.length > 0) {
        for (const event of input.events) {
            lines.push(`- ${event.app_slug}.${event.event_type}`);
        }
    } else {
        lines.push('(no pending events)');
    }

    lines.push('');
    return lines.join('\n');
}

export function cronToHumanReadable(cron: string, timezone: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return cron;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // */N minutes
    if (minute.startsWith('*/') && hour === '*') {
        return `every ${minute.slice(2)} minutes`;
    }

    // Every N hours
    if (minute === '0' && hour.startsWith('*/')) {
        return `every ${hour.slice(2)} hours`;
    }

    // Hourly
    if (minute === '0' && hour === '*') {
        return 'every hour';
    }

    // Daily at specific time
    if (!minute.includes('*') && !hour.includes('*') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const h = parseInt(hour, 10);
        const m = parseInt(minute, 10);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const mStr = m.toString().padStart(2, '0');
        return `every day at ${h12}:${mStr} ${period} ${timezone}`;
    }

    // Weekly on a specific day
    if (!minute.includes('*') && !hour.includes('*') && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const h = parseInt(hour, 10);
        const m = parseInt(minute, 10);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const mStr = m.toString().padStart(2, '0');
        const dayName = numberToDayOfWeek(parseInt(dayOfWeek, 10));
        return `every ${dayName} at ${h12}:${mStr} ${period} ${timezone}`;
    }

    // Every 30 minutes
    if (minute === '*/30' && hour === '*') {
        return 'every 30 minutes';
    }

    return cron;
}

function numberToDayOfWeek(num: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[num] || 'Unknown';
}
