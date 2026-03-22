// Daily Digest Service
// Generates standup (AM) and report (PM) digests via Xerus master agent heartbeat
// Source: docs/planning/execution/heartbeat-system.md (Daily Digest section)

import { HeartbeatExecutionRepository, heartbeatExecutionRepository } from '../../heartbeat/heartbeat-execution.repository';
import type { HeartbeatExecution, HeartbeatOutcome } from '../../heartbeat/types';
import type {
    DigestVariant,
    DigestActivityData,
    DigestSummary,
    DigestSection,
    DigestSectionItem,
    DigestResult,
    DailyDigestConfig,
} from './daily-digest.types';
import { DigestExecutionRecordError } from './daily-digest.errors';

// -----------------------------------------------------------------------------
// Digest Execution Record Input
// -----------------------------------------------------------------------------

interface RecordDigestExecutionInput {
    agent_id: number;
    heartbeat_config_id: number | null;
    variant: DigestVariant;
    outcome: HeartbeatOutcome;
    tokens_used: number;
    inbox_posts: number;
    error_message?: string;
}

// -----------------------------------------------------------------------------
// Daily Digest Service
// -----------------------------------------------------------------------------

export class DailyDigestService {
    constructor(
        private executionRepository: HeartbeatExecutionRepository = heartbeatExecutionRepository
    ) {}

    /**
     * Check if there is any activity worth reporting.
     */
    hasActivity(activityData: DigestActivityData): boolean {
        return (
            activityData.completed_tasks.length > 0 ||
            activityData.in_progress_tasks.length > 0 ||
            activityData.blocked_items.length > 0 ||
            activityData.heartbeat_alerts.length > 0 ||
            activityData.credit_usage.credits_used > 0
        );
    }

    /**
     * Build summary counts from activity data.
     */
    buildDigestSummary(activityData: DigestActivityData): DigestSummary {
        return {
            tasks_completed: activityData.completed_tasks.length,
            tasks_in_progress: activityData.in_progress_tasks.length,
            blocked_items: activityData.blocked_items.length,
            alerts_raised: activityData.heartbeat_alerts.length,
            credits_used: activityData.credit_usage.credits_used,
        };
    }

    /**
     * Build structured sections for the digest based on variant.
     * Skips sections that have no items.
     */
    buildDigestSections(variant: DigestVariant, activityData: DigestActivityData): DigestSection[] {
        if (variant === 'standup') {
            return this.buildStandupSections(activityData);
        }
        return this.buildReportSections(activityData);
    }

    /**
     * Generate a complete digest result.
     * Returns skipped=true if no activity and skip_on_no_activity is enabled.
     */
    generateDigest(
        variant: DigestVariant,
        config: DailyDigestConfig,
        activityData: DigestActivityData
    ): DigestResult {
        const now = new Date();

        if (config.skip_on_no_activity && !this.hasActivity(activityData)) {
            return {
                variant,
                user_id: config.user_id,
                title: this.buildDigestTitle(variant, config.timezone),
                generated_at: now,
                summary: this.buildDigestSummary(activityData),
                sections: [],
                skipped: true,
                skip_reason: 'No activity for the day',
            };
        }

        return {
            variant,
            user_id: config.user_id,
            title: this.buildDigestTitle(variant, config.timezone),
            generated_at: now,
            summary: this.buildDigestSummary(activityData),
            sections: this.buildDigestSections(variant, activityData),
            skipped: false,
            skip_reason: null,
        };
    }

    /**
     * Build a human-readable title for the digest with the current date.
     */
    buildDigestTitle(variant: DigestVariant, timezone: string): string {
        const prefix = variant === 'standup' ? 'Daily Standup' : 'Daily Report';
        const dateStr = this.formatDateForTimezone(new Date(), timezone);
        return `${prefix} - ${dateStr}`;
    }

    /**
     * Build the heartbeat prompt to send to Xerus master agent.
     * Contains structured activity data for the agent to summarize.
     */
    buildHeartbeatPrompt(
        variant: DigestVariant,
        activityData: DigestActivityData,
        timezone: string
    ): string {
        const dateStr = this.formatDateForTimezone(new Date(), timezone);
        const variantLabel = variant === 'standup' ? 'morning standup' : 'end-of-day report';

        const lines: string[] = [
            `Generate a ${variantLabel} digest for ${dateStr}.`,
            '',
        ];

        if (activityData.completed_tasks.length > 0) {
            lines.push('## Completed Tasks');
            for (const task of activityData.completed_tasks) {
                lines.push(`- [${task.agent_name}] ${task.title}`);
            }
            lines.push('');
        }

        if (activityData.in_progress_tasks.length > 0) {
            lines.push('## In Progress');
            for (const task of activityData.in_progress_tasks) {
                lines.push(`- [${task.agent_name}] ${task.title}`);
            }
            lines.push('');
        }

        if (activityData.blocked_items.length > 0) {
            lines.push('## Blocked Items');
            for (const item of activityData.blocked_items) {
                const reason = item.reason ? ` (${item.reason})` : '';
                lines.push(`- [${item.agent_name}] ${item.title}${reason}`);
            }
            lines.push('');
        }

        if (activityData.heartbeat_alerts.length > 0) {
            lines.push('## Alerts');
            for (const alert of activityData.heartbeat_alerts) {
                lines.push(`- [${alert.agent_name}] ${alert.alert_content}`);
            }
            lines.push('');
        }

        lines.push('## Credit Usage');
        lines.push(`- Used: ${activityData.credit_usage.credits_used}`);
        lines.push(`- Remaining: ${activityData.credit_usage.credits_remaining}`);

        if (activityData.credit_usage.top_consumers.length > 0) {
            lines.push('- Top consumers:');
            for (const consumer of activityData.credit_usage.top_consumers) {
                lines.push(`  - ${consumer.agent_name}: ${consumer.credits} credits`);
            }
        }

        lines.push('');
        lines.push('Summarize concisely. Highlight action items. Keep it under 500 words.');

        return lines.join('\n');
    }

    /**
     * Record a digest execution in the heartbeat_executions table.
     */
    async recordDigestExecution(input: RecordDigestExecutionInput): Promise<HeartbeatExecution> {
        const now = new Date();

        const execution = await this.executionRepository.create({
            agent_id: input.agent_id,
            heartbeat_config_id: input.heartbeat_config_id,
            trigger_type: 'scheduled',
            event_payload: { digest_variant: input.variant },
            scheduled_at: now,
        });

        const updated = await this.executionRepository.updateStatus(execution.id, 'completed', {
            started_at: now,
            completed_at: now,
            outcome: input.outcome,
            tokens_used: input.tokens_used,
            inbox_posts: input.inbox_posts,
            error_message: input.error_message,
        });

        if (!updated) {
            throw new DigestExecutionRecordError(execution.id);
        }

        return updated;
    }

    /**
     * Format a date for display in a specific timezone.
     */
    formatDateForTimezone(date: Date, timezone: string): string {
        return date.toLocaleDateString('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    // -------------------------------------------------------------------------
    // Private: Section Builders (config-driven)
    // -------------------------------------------------------------------------

    /**
     * Section headings per variant. Maps activity field to section heading.
     */
    private readonly SECTION_HEADINGS: Record<DigestVariant, Record<string, string>> = {
        standup: {
            completed: "Yesterday's Completions",
            in_progress: "Today's Priorities",
            blocked: 'Blockers',
            alerts: 'Alerts',
        },
        report: {
            completed: 'Completed Today',
            alerts: 'Highlights',
            blocked: 'Pending Decisions',
            credits: 'Credit Usage',
        },
    };

    private buildStandupSections(activityData: DigestActivityData): DigestSection[] {
        const headings = this.SECTION_HEADINGS.standup;
        return this.buildCommonSections(activityData, headings, ['completed', 'in_progress', 'blocked', 'alerts']);
    }

    private buildReportSections(activityData: DigestActivityData): DigestSection[] {
        const headings = this.SECTION_HEADINGS.report;
        const sections = this.buildCommonSections(activityData, headings, ['completed', 'alerts', 'blocked']);

        // Report has credit usage (standup doesn't)
        if (activityData.credit_usage.credits_used > 0) {
            sections.push(this.buildCreditUsageSection(activityData.credit_usage, headings.credits));
        }

        return sections;
    }

    /**
     * Build common sections based on ordered field list.
     */
    private buildCommonSections(
        activityData: DigestActivityData,
        headings: Record<string, string>,
        fieldOrder: string[]
    ): DigestSection[] {
        const sections: DigestSection[] = [];

        for (const field of fieldOrder) {
            const section = this.buildSectionForField(activityData, field, headings[field]);
            if (section) {
                sections.push(section);
            }
        }

        return sections;
    }

    /**
     * Build section for a specific activity field.
     */
    private buildSectionForField(
        activityData: DigestActivityData,
        field: string,
        heading: string
    ): DigestSection | null {
        switch (field) {
            case 'completed':
                if (activityData.completed_tasks.length === 0) return null;
                return {
                    heading,
                    items: activityData.completed_tasks.map((task) => ({
                        agent_name: task.agent_name,
                        agent_id: task.agent_id,
                        content: task.title,
                        channel_id: task.channel_id,
                        action_required: false,
                    })),
                };

            case 'in_progress':
                if (activityData.in_progress_tasks.length === 0) return null;
                return {
                    heading,
                    items: activityData.in_progress_tasks.map((task) => ({
                        agent_name: task.agent_name,
                        agent_id: task.agent_id,
                        content: task.title,
                        channel_id: task.channel_id,
                        action_required: false,
                    })),
                };

            case 'blocked':
                if (activityData.blocked_items.length === 0) return null;
                return {
                    heading,
                    items: activityData.blocked_items.map((item) => ({
                        agent_name: item.agent_name,
                        agent_id: item.agent_id,
                        content: item.reason ? `${item.title} - ${item.reason}` : item.title,
                        channel_id: null,
                        action_required: true,
                    })),
                };

            case 'alerts':
                if (activityData.heartbeat_alerts.length === 0) return null;
                return {
                    heading,
                    items: activityData.heartbeat_alerts.map((alert) => ({
                        agent_name: alert.agent_name,
                        agent_id: alert.agent_id,
                        content: alert.alert_content,
                        channel_id: null,
                        action_required: false,
                    })),
                };

            default:
                return null;
        }
    }

    /**
     * Build credit usage section (report variant only).
     */
    private buildCreditUsageSection(
        creditUsage: DigestActivityData['credit_usage'],
        heading: string
    ): DigestSection {
        const items: DigestSectionItem[] = [
            {
                agent_name: 'System',
                agent_id: 0,
                content: `${creditUsage.credits_used} credits used, ${creditUsage.credits_remaining} remaining`,
                channel_id: null,
                action_required: false,
            },
        ];

        for (const consumer of creditUsage.top_consumers) {
            items.push({
                agent_name: consumer.agent_name,
                agent_id: 0,
                content: `${consumer.credits} credits`,
                channel_id: null,
                action_required: false,
            });
        }

        return { heading, items };
    }
}
