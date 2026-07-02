// Company Business DB Service
// Read surface for company.db (SQLite on the sandbox) — the structured layer of
// the workspace's 3-layer data model (Google Sheets -> company.db -> .memory/entities/).
// Agents write business data here via the data-steward protocol; this service reads
// it back so the UI can surface topics, research reports, and prospects.
//
// Distinct from company-workspace-db.service.ts, which reads workspace.db
// (operational: domains, channels, messages). This service is read-only.
// Schema: xerus-workspace/data/schema.sql

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { COMPANY_DB_PATH, executeSandboxDbJsonQuery } from '../conversations/workspace-db.helpers';

// -----------------------------------------------------------------------------
// Types (mirror schema.sql — topics / research_reports / prospects)
// -----------------------------------------------------------------------------

export interface TopicRow {
    id: number;
    name: string;
    description: string | null;
    relevance_score: number | null;
    trend_direction: string | null;
    research_count: number;
    last_researched_at: string | null;
    source_agent: string;
    entity_path: string | null;
    created_at: string;
    updated_at: string;
}

export interface ResearchReportRow {
    id: number;
    topic: string;
    source_skill: string;
    source_agent: string;
    key_findings: string | null;
    summary: string | null;
    sheet_url: string | null;
    raw_data_path: string | null;
    created_at: string;
}

export interface ProspectRow {
    id: number;
    name: string;
    type: string;
    status: string;
    relevance_score: number | null;
    source_agent: string;
    source_url: string | null;
    notes: string | null;
    entity_path: string | null;
    created_at: string;
    updated_at: string;
}

export interface CompanyBusinessData {
    topics: TopicRow[];
    research_reports: ResearchReportRow[];
    prospects: ProspectRow[];
}

// -----------------------------------------------------------------------------
// Pagination bounds — cap the sandbox SQLite scan and JSON payload size
// -----------------------------------------------------------------------------

export const DEFAULT_BUSINESS_LIMIT = 50;
export const MAX_BUSINESS_LIMIT = 200;

export function clampLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_BUSINESS_LIMIT;
    return Math.min(Math.floor(limit), MAX_BUSINESS_LIMIT);
}

export function clampOffset(offset: number): number {
    if (!Number.isFinite(offset) || offset <= 0) return 0;
    return Math.floor(offset);
}

// -----------------------------------------------------------------------------
// SQL builders (pure) — numeric limit/offset only, so no interpolation risk
// -----------------------------------------------------------------------------

export function buildListTopicsSql(limit: number, offset: number): string {
    return `
        SELECT id, name, description, relevance_score, trend_direction, research_count,
               last_researched_at, source_agent, entity_path, created_at, updated_at
        FROM topics
        ORDER BY relevance_score DESC, updated_at DESC
        LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}
    `;
}

export function buildListResearchReportsSql(limit: number, offset: number): string {
    return `
        SELECT id, topic, source_skill, source_agent, key_findings, summary,
               sheet_url, raw_data_path, created_at
        FROM research_reports
        ORDER BY created_at DESC
        LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}
    `;
}

export function buildListProspectsSql(limit: number, offset: number): string {
    return `
        SELECT id, name, type, status, relevance_score, source_agent,
               source_url, notes, entity_path, created_at, updated_at
        FROM prospects
        ORDER BY relevance_score DESC, updated_at DESC
        LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}
    `;
}

// -----------------------------------------------------------------------------
// Missing-table handling
// company.db is initialized from schema.sql during sandbox setup. A read that
// races initialization (file exists, tables not yet created) surfaces sqlite's
// "no such table" — a genuine empty state, not a failure. Every other error
// propagates (fail-fast). Mirrors getProjectOverview in company-workspace-db.service.ts.
// -----------------------------------------------------------------------------

export function isMissingTableError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('no such table');
}

function emptyOnMissingTable<T>(err: unknown): T[] {
    if (isMissingTableError(err)) return [];
    throw err;
}

// -----------------------------------------------------------------------------
// Readers
// -----------------------------------------------------------------------------

export function listTopics(
    provider: DaytonaProvider,
    sandboxId: string,
    limit: number,
    offset: number,
): Promise<TopicRow[]> {
    return executeSandboxDbJsonQuery<TopicRow>(
        provider, sandboxId, COMPANY_DB_PATH, buildListTopicsSql(limit, offset),
    ).catch(emptyOnMissingTable<TopicRow>);
}

export function listResearchReports(
    provider: DaytonaProvider,
    sandboxId: string,
    limit: number,
    offset: number,
): Promise<ResearchReportRow[]> {
    return executeSandboxDbJsonQuery<ResearchReportRow>(
        provider, sandboxId, COMPANY_DB_PATH, buildListResearchReportsSql(limit, offset),
    ).catch(emptyOnMissingTable<ResearchReportRow>);
}

export function listProspects(
    provider: DaytonaProvider,
    sandboxId: string,
    limit: number,
    offset: number,
): Promise<ProspectRow[]> {
    return executeSandboxDbJsonQuery<ProspectRow>(
        provider, sandboxId, COMPANY_DB_PATH, buildListProspectsSql(limit, offset),
    ).catch(emptyOnMissingTable<ProspectRow>);
}

export async function getCompanyBusinessData(
    provider: DaytonaProvider,
    sandboxId: string,
    limit: number,
    offset: number,
): Promise<CompanyBusinessData> {
    const [topics, research_reports, prospects] = await Promise.all([
        listTopics(provider, sandboxId, limit, offset),
        listResearchReports(provider, sandboxId, limit, offset),
        listProspects(provider, sandboxId, limit, offset),
    ]);
    return { topics, research_reports, prospects };
}
