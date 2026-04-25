/**
 * Schedules API Client
 * CRUD for schedules + run history (workspace.db on sandbox via backend proxy)
 * Backend routes: /api/v1/execute/schedules/*
 */
import { apiCall } from './client';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ScheduleEntry {
    id: string;
    agent_slug: string;
    name: string;
    prompt: string;
    rrule: string | null;
    adapter_type: string;
    model: string | null;
    status: string;
    max_budget_usd: number | null;
    allowed_tools: string | null;
    system_prompt: string | null;
    config: string | null;  // JSON blob for UI-only metadata (timezone, activeHours, etc.)
    next_run_at: number | null;
    last_run_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface ScheduleRunEntry {
    id: string;
    schedule_id: string;
    session_id: string | null;
    status: string;
    output: string | null;
    result: string | null;
    error: string | null;
    cost_usd: number | null;
    duration_ms: number | null;
    num_turns: number | null;
    started_at: number | null;
    completed_at: number | null;
    created_at: number;
    agent_slug: string;
    schedule_name: string;
    schedule_prompt: string;
}

export interface CreateScheduleInput {
    agent_slug: string;
    name: string;
    prompt: string;
    rrule?: string;
    adapter_type?: string;
    model?: string;
    max_budget_usd?: number;
    allowed_tools?: string[];
    system_prompt?: string;
    config?: string;
}

export interface UpdateScheduleInput {
    name?: string;
    prompt?: string;
    rrule?: string;
    status?: string;
    model?: string;
    max_budget_usd?: number;
    allowed_tools?: string[];
    system_prompt?: string;
    config?: string;
}

// -----------------------------------------------------------------------------
// Schedule CRUD
// -----------------------------------------------------------------------------

const BASE = '/execute/schedules';

export async function listSchedules(params?: {
    agent_slug?: string;
    status?: string;
}): Promise<{ schedules: ScheduleEntry[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.agent_slug) qs.set('agent_slug', params.agent_slug);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();

    const response = await apiCall(`${BASE}${query ? `?${query}` : ''}`, { method: 'GET' });
    const json = await response.json();
    return json.data ?? json;
}

export async function createSchedule(input: CreateScheduleInput): Promise<{ schedule: ScheduleEntry }> {
    const response = await apiCall(BASE, {
        method: 'POST',
        body: JSON.stringify(input),
    });
    const json = await response.json();
    return json.data ?? json;
}

export async function updateSchedule(
    scheduleId: string,
    input: UpdateScheduleInput,
): Promise<{ schedule: ScheduleEntry }> {
    const response = await apiCall(`${BASE}/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
    });
    const json = await response.json();
    return json.data ?? json;
}

export async function deleteSchedule(scheduleId: string): Promise<{ schedule_id: string; deleted_at: string }> {
    const response = await apiCall(`${BASE}/${scheduleId}`, {
        method: 'DELETE',
    });
    const json = await response.json();
    return json.data ?? json;
}

// -----------------------------------------------------------------------------
// Schedule Runs (Run History)
// -----------------------------------------------------------------------------

export async function listScheduleRuns(params?: {
    agent_slug?: string;
    limit?: number;
    offset?: number;
}): Promise<{ runs: ScheduleRunEntry[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.agent_slug) qs.set('agent_slug', params.agent_slug);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const query = qs.toString();

    const response = await apiCall(`${BASE}/runs${query ? `?${query}` : ''}`, { method: 'GET' });
    const json = await response.json();
    return json.data ?? json;
}
