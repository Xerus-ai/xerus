// Daily Digest Types
// Types for daily digest generation (standup + report)
// Source: docs/planning/execution/heartbeat-system.md (Daily Digest section)

// -----------------------------------------------------------------------------
// Digest Variant
// -----------------------------------------------------------------------------

export const DIGEST_VARIANTS = ['standup', 'report'] as const;

export type DigestVariant = (typeof DIGEST_VARIANTS)[number];

// -----------------------------------------------------------------------------
// Activity Data (queried from DB for digest generation)
// -----------------------------------------------------------------------------

export interface DigestActivityData {
    completed_tasks: DigestTaskItem[];
    in_progress_tasks: DigestTaskItem[];
    blocked_items: DigestBlockedItem[];
    heartbeat_alerts: DigestAlertItem[];
    credit_usage: DigestCreditUsage;
}

export interface DigestTaskItem {
    agent_id: number;
    agent_name: string;
    title: string;
    channel_id: string | null;
    completed_at: Date | null;
}

export interface DigestBlockedItem {
    agent_id: number;
    agent_name: string;
    title: string;
    blocked_since: Date;
    reason: string | null;
}

export interface DigestAlertItem {
    agent_id: number;
    agent_name: string;
    alert_content: string;
    created_at: Date;
}

export interface DigestCreditUsage {
    credits_used: number;
    credits_remaining: number;
    top_consumers: Array<{ agent_name: string; credits: number }>;
}

// -----------------------------------------------------------------------------
// Digest Sections (structured output)
// -----------------------------------------------------------------------------

export interface DigestSection {
    heading: string;
    items: DigestSectionItem[];
}

export interface DigestSectionItem {
    agent_name: string;
    agent_id: number;
    content: string;
    channel_id: string | null;
    action_required: boolean;
}

// -----------------------------------------------------------------------------
// Digest Result
// -----------------------------------------------------------------------------

export interface DigestResult {
    variant: DigestVariant;
    user_id: string;
    title: string;
    generated_at: Date;
    summary: DigestSummary;
    sections: DigestSection[];
    skipped: boolean;
    skip_reason: string | null;
}

export interface DigestSummary {
    tasks_completed: number;
    tasks_in_progress: number;
    blocked_items: number;
    alerts_raised: number;
    credits_used: number;
}

// -----------------------------------------------------------------------------
// Digest Config (per-user preferences)
// -----------------------------------------------------------------------------

export interface DailyDigestConfig {
    user_id: string;
    enabled: boolean;
    standup_cron: string;
    report_cron: string;
    timezone: string;
    skip_on_no_activity: boolean;
    xerus_agent_id: number;
    default_channel_id: string | null;
}

// -----------------------------------------------------------------------------
// Digest Trigger Context (passed to Xerus heartbeat)
// -----------------------------------------------------------------------------

export interface DigestTriggerContext {
    variant: DigestVariant;
    user_id: string;
    timezone: string;
    activity_data: DigestActivityData;
    generated_at: Date;
}

// -----------------------------------------------------------------------------
// Activity Data Collector (interface for DB queries)
// -----------------------------------------------------------------------------

/**
 * Collects activity data from the database for digest generation.
 * Implementations query execution_sessions, channels, credit_ledger, etc.
 */
export interface ActivityDataCollector {
    /**
     * Collect all activity for a user since a given timestamp.
     * @param userId - User to collect activity for
     * @param since - Start of lookback window
     * @returns Aggregated activity data for digest formatting
     */
    collectForUser(userId: string, since: Date): Promise<DigestActivityData>;
}
