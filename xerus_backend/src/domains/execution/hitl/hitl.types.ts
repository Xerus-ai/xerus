// HITL (Human-in-the-Loop) Types
// Types for pause/resume approval workflows triggered by PreToolUse 'ask' decisions
// Matches: execution_pause_states table (migration 022_execution_domain.sql)

import type { PauseReason, PauseResolution } from '../../history/sessions/session.types';

// -----------------------------------------------------------------------------
// HITL Request (sent to frontend for user approval)
// -----------------------------------------------------------------------------

const HITL_SCENARIOS = [
    'destructive_operation',
    'ambiguous_instruction',
    'missing_information',
    'external_service_auth',
    'agent_creation',
    'skill_creation',
    'heartbeat_configuration',
    'budget_threshold',
    'tool_connection',
    // Browser intervention scenarios
    'browser_captcha',
    'browser_payment',
    'browser_2fa',
    'browser_auth',
    // Content & deliverable review
    'content_approval',
    'deliverable_review',
    // Generic extensible scenario
    'external_action',
] as const;

export type HITLScenario = (typeof HITL_SCENARIOS)[number];

export interface HITLRequest {
    execution_id: string;
    agent_id: number;
    agent_slug: string;
    user_id: string;
    scenario: HITLScenario;
    question: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    options?: string[];
    expanded_context?: string;
    requires_auth?: boolean;
    timeout_seconds?: number;
    ui_hint?: UIHint;
    browser_url?: string;
    preview_url?: string;
    artifact_path?: string;
}

// -----------------------------------------------------------------------------
// HITL Response (user's decision from frontend)
// -----------------------------------------------------------------------------

export interface HITLResponse {
    pause_id: string;
    approved: boolean;
    feedback?: string;
    resolved_by: string;
}

// -----------------------------------------------------------------------------
// HITL Pause State (DB representation)
// -----------------------------------------------------------------------------

export interface HITLPauseState {
    id: string;
    execution_id: string;
    paused_at: string;
    reason: PauseReason;
    request_data: HITLRequestData;
    resolved_at: string | null;
    resolution: PauseResolution | null;
    resolved_by: string | null;
}

// UI hints tell the frontend what panel/view to show for this intervention
const UI_HINTS = [
    'browser',      // Open noVNC browser pane (CAPTCHA, payment, auth, browsing)
    'approval',     // Show approve/reject buttons (content review, destructive ops)
    'form',         // Show input form (missing information, configuration)
    'preview',      // Open artifact viewer with file/URL (deliverable review)
    'terminal',     // Show terminal access (debugging, manual commands)
] as const;

export type UIHint = (typeof UI_HINTS)[number];

export interface HITLRequestData {
    scenario: HITLScenario;
    question: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    agent_slug: string;
    options?: string[];
    expanded_context?: string;
    requires_auth?: boolean;
    // Rich intervention fields
    ui_hint?: UIHint;
    browser_url?: string;
    preview_url?: string;
    artifact_path?: string;
}

// -----------------------------------------------------------------------------
// HITL Result (returned to caller after resolution)
// -----------------------------------------------------------------------------

export interface HITLResult {
    pause_id: string;
    approved: boolean;
    feedback?: string;
    resolution: PauseResolution;
    resolved_at: string;
}

// -----------------------------------------------------------------------------
// Default timeout for approval requests
// -----------------------------------------------------------------------------

export const DEFAULT_HITL_TIMEOUT_SECONDS = 300; // 5 minutes
