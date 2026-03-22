// Snapshot Formatter Tests
import { formatSnapshotMarkdown } from '../snapshot-formatter';
import { SourceFetchResult, SnapshotSourceError } from '../snapshot.types';

describe('formatSnapshotMarkdown', () => {
    const agentName = 'inbox-izzy';

    it('should format a complete snapshot with all sources OK', () => {
        const results: SourceFetchResult[] = [
            {
                app: 'gmail',
                status: 'ok',
                fetched_at: new Date('2026-02-15T09:25:01Z'),
                data: '3 unread emails:\n\n### From: ceo@company.com\n- Subject: Q4 Report',
                item_ids: ['msg_1', 'msg_2', 'msg_3'],
            },
            {
                app: 'github',
                status: 'ok',
                fetched_at: new Date('2026-02-15T09:25:02Z'),
                data: '1 notification:\n\n### PR Review Request\n- Repo: company/backend',
                item_ids: ['notif_1'],
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, results, [], 2300);

        expect(markdown).toContain('# Snapshot -');
        expect(markdown).toContain('Agent: inbox-izzy');
        expect(markdown).toContain('Sources: 2/2 fetched');
        expect(markdown).toContain('Duration: 2.3s');
        expect(markdown).toContain('## Gmail [OK -');
        expect(markdown).toContain('## GitHub [OK -');
        expect(markdown).toContain('3 unread emails');
        expect(markdown).toContain('1 notification');
    });

    it('should format stale sources with cache age', () => {
        const results: SourceFetchResult[] = [
            {
                app: 'notion',
                status: 'stale',
                fetched_at: new Date('2026-02-15T09:00:00Z'),
                data: 'Cached notion data',
                cache_age_ms: 1500000, // 25 minutes
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, results, [], 500);

        expect(markdown).toContain('## Notion [STALE -');
        expect(markdown).toContain('Using cached data');
        expect(markdown).toContain('Cached notion data');
    });

    it('should format failed sources with no cache', () => {
        const errors: SnapshotSourceError[] = [
            {
                app: 'slack',
                error: 'connection timeout',
                used_cache: false,
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, [], errors, 30000);

        expect(markdown).toContain('## Slack [FAILED - connection timeout]');
        expect(markdown).toContain('No cached data available.');
    });

    it('should format failed sources with cached fallback', () => {
        const errors: SnapshotSourceError[] = [
            {
                app: 'notion',
                error: 'API rate limit',
                used_cache: true,
                cache_age_ms: 1800000, // 30 min
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, [], errors, 1000);

        expect(markdown).toContain('## Notion [FAILED - API rate limit]');
        expect(markdown).toContain('Using cached data from 30m 0s ago');
    });

    it('should format mixed success, stale, and failed sources', () => {
        const results: SourceFetchResult[] = [
            {
                app: 'gmail',
                status: 'ok',
                fetched_at: new Date('2026-02-15T09:25:01Z'),
                data: '2 unread emails',
            },
            {
                app: 'calendar',
                status: 'stale',
                fetched_at: new Date('2026-02-15T08:55:00Z'),
                data: '3 events today',
                cache_age_ms: 1800000,
            },
        ];

        const errors: SnapshotSourceError[] = [
            {
                app: 'calendar',
                error: 'token expired',
                used_cache: true,
                cache_age_ms: 1800000,
            },
            {
                app: 'weather',
                error: 'API key invalid',
                used_cache: false,
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, results, errors, 3000);

        expect(markdown).toContain('## Gmail [OK -');
        expect(markdown).toContain('## Google Calendar [STALE -');
        expect(markdown).toContain('## Weather [FAILED - API key invalid]');
        // Calendar should not appear twice (already in results)
        const calendarOccurrences = (markdown.match(/## Google Calendar/g) || []).length;
        expect(calendarOccurrences).toBe(1);
    });

    it('should handle empty results and errors', () => {
        const markdown = formatSnapshotMarkdown(agentName, [], [], 100);

        expect(markdown).toContain('# Snapshot -');
        expect(markdown).toContain('Sources: 0/0 fetched');
    });

    it('should format duration correctly for sub-second', () => {
        const results: SourceFetchResult[] = [
            {
                app: 'weather',
                status: 'ok',
                fetched_at: new Date(),
                data: 'Sunny, 72F',
            },
        ];

        const markdown = formatSnapshotMarkdown(agentName, results, [], 450);

        expect(markdown).toContain('Duration: 450ms');
    });
});
