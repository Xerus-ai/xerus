// Company Business DB Tests
// Validates the read surface for company.db business tables (topics,
// research_reports, prospects) exposed via company-business-db.service.ts:
// - Limit/offset clamping (bounds the sandbox SQLite scan)
// - SQL builders target the correct tables, columns, ordering, and pagination
// - Missing-table classification (fresh company.db before schema load = empty)
//
// These validate the deterministic query-construction layer without a sandbox,
// matching the approach in channel-behavior.test.ts. End-to-end verification
// against a live Daytona sandbox is covered separately (requires a real sandbox).

import {
    clampLimit,
    clampOffset,
    buildListTopicsSql,
    buildListResearchReportsSql,
    buildListProspectsSql,
    isMissingTableError,
    DEFAULT_BUSINESS_LIMIT,
    MAX_BUSINESS_LIMIT,
} from '../company-business-db.service';

// ---------------------------------------------------------------------------
// 1. Limit / Offset clamping
// ---------------------------------------------------------------------------

describe('clampLimit', () => {
    it('returns the value when within bounds', () => {
        expect(clampLimit(25)).toBe(25);
    });

    it('caps at MAX_BUSINESS_LIMIT', () => {
        expect(clampLimit(MAX_BUSINESS_LIMIT + 500)).toBe(MAX_BUSINESS_LIMIT);
    });

    it('defaults when zero or negative', () => {
        expect(clampLimit(0)).toBe(DEFAULT_BUSINESS_LIMIT);
        expect(clampLimit(-10)).toBe(DEFAULT_BUSINESS_LIMIT);
    });

    it('defaults on NaN (unparseable query param)', () => {
        expect(clampLimit(Number.NaN)).toBe(DEFAULT_BUSINESS_LIMIT);
    });

    it('floors fractional values', () => {
        expect(clampLimit(10.9)).toBe(10);
    });
});

describe('clampOffset', () => {
    it('returns the value when positive', () => {
        expect(clampOffset(40)).toBe(40);
    });

    it('returns 0 for negative or NaN', () => {
        expect(clampOffset(-5)).toBe(0);
        expect(clampOffset(Number.NaN)).toBe(0);
    });

    it('floors fractional values', () => {
        expect(clampOffset(12.7)).toBe(12);
    });
});

// ---------------------------------------------------------------------------
// 2. SQL builders
// ---------------------------------------------------------------------------

describe('buildListTopicsSql', () => {
    const sql = buildListTopicsSql(30, 0);

    it('selects from the topics table', () => {
        expect(sql).toMatch(/FROM\s+topics/);
    });

    it('selects the schema columns', () => {
        for (const col of ['name', 'relevance_score', 'trend_direction', 'research_count', 'source_agent']) {
            expect(sql).toContain(col);
        }
    });

    it('orders by relevance then recency', () => {
        expect(sql).toMatch(/ORDER BY relevance_score DESC, updated_at DESC/);
    });

    it('applies clamped LIMIT and OFFSET', () => {
        expect(buildListTopicsSql(9999, 5)).toContain(`LIMIT ${MAX_BUSINESS_LIMIT} OFFSET 5`);
    });
});

describe('buildListResearchReportsSql', () => {
    const sql = buildListResearchReportsSql(30, 0);

    it('selects from research_reports', () => {
        expect(sql).toMatch(/FROM\s+research_reports/);
    });

    it('selects the schema columns', () => {
        for (const col of ['topic', 'source_skill', 'source_agent', 'key_findings', 'summary', 'sheet_url']) {
            expect(sql).toContain(col);
        }
    });

    it('orders by newest first', () => {
        expect(sql).toMatch(/ORDER BY created_at DESC/);
    });
});

describe('buildListProspectsSql', () => {
    const sql = buildListProspectsSql(30, 0);

    it('selects from prospects', () => {
        expect(sql).toMatch(/FROM\s+prospects/);
    });

    it('selects the schema columns', () => {
        for (const col of ['name', 'type', 'status', 'relevance_score', 'source_agent', 'notes']) {
            expect(sql).toContain(col);
        }
    });

    it('orders by relevance then recency', () => {
        expect(sql).toMatch(/ORDER BY relevance_score DESC, updated_at DESC/);
    });
});

// ---------------------------------------------------------------------------
// 3. Missing-table classification
// ---------------------------------------------------------------------------

describe('isMissingTableError', () => {
    it('is true for sqlite "no such table" errors', () => {
        expect(isMissingTableError(new Error('SQLite returned invalid JSON: Error: no such table: topics'))).toBe(true);
    });

    it('is true when passed a raw string', () => {
        expect(isMissingTableError('Parse error near line 1: no such table: prospects')).toBe(true);
    });

    it('is false for unrelated errors', () => {
        expect(isMissingTableError(new Error('database is locked'))).toBe(false);
        expect(isMissingTableError(new Error('Sandbox provider does not support executeCommand'))).toBe(false);
    });
});
