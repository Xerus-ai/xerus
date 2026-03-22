// Snapshot Formatter
// Assembles individual source fetch results into a single markdown snapshot file
// with metadata header, per-source status, and staleness markers.

import { SourceFetchResult, SnapshotSourceError } from './snapshot.types';

// -----------------------------------------------------------------------------
// Format Snapshot Markdown
// -----------------------------------------------------------------------------

export function formatSnapshotMarkdown(
    agentName: string,
    results: SourceFetchResult[],
    errors: SnapshotSourceError[],
    durationMs: number
): string {
    const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    const totalSources = results.length + errors.filter(e => !results.some(r => r.app === e.app)).length;
    const fetchedCount = results.filter(r => r.status === 'ok').length;

    const lines: string[] = [
        `# Snapshot - ${timestamp}`,
        `# Agent: ${agentName} | Sources: ${fetchedCount}/${totalSources} fetched | Duration: ${formatDuration(durationMs)}`,
        '',
    ];

    // Render each successful/stale result
    for (const result of results) {
        const statusTag = formatStatusTag(result);
        lines.push(`## ${capitalizeApp(result.app)} ${statusTag}`);

        if (result.status === 'stale' && result.cache_age_ms) {
            const staleAge = formatDuration(result.cache_age_ms);
            lines.push(`Using cached data (${staleAge} stale):`);
            lines.push('');
        }

        lines.push(result.data);
        lines.push('');
    }

    // Render failed sources that have no result entry
    const resultApps = new Set(results.map(r => r.app));
    for (const err of errors) {
        if (!resultApps.has(err.app)) {
            lines.push(`## ${capitalizeApp(err.app)} [FAILED - ${err.error}]`);
            if (err.used_cache && err.cache_age_ms) {
                lines.push(`Using cached data from ${formatDuration(err.cache_age_ms)} ago:`);
            } else {
                lines.push('No cached data available.');
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatStatusTag(result: SourceFetchResult): string {
    const timestamp = result.fetched_at.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

    switch (result.status) {
        case 'ok':
            return `[OK - fetched ${timestamp}]`;
        case 'stale':
            return `[STALE - cached ${timestamp}]`;
        case 'failed':
            return `[FAILED - ${result.error || 'unknown error'}]`;
    }
}

function capitalizeApp(app: string): string {
    const appNames: Record<string, string> = {
        gmail: 'Gmail',
        github: 'GitHub',
        calendar: 'Google Calendar',
        weather: 'Weather',
        slack: 'Slack',
        notion: 'Notion',
    };
    return appNames[app] || app.charAt(0).toUpperCase() + app.slice(1);
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const seconds = (ms / 1000).toFixed(1);
    if (ms < 60000) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const remainingSeconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${remainingSeconds}s`;
}
