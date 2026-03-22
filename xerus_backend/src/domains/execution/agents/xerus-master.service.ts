// Xerus Master Orchestrator Service
// Core service for the master orchestrator agent
// Source: docs/planning/execution/xerus-master-prompt.md

import {
    XERUS_MASTER_SLUG,
    PLATFORM_TOOL_LIST,
    PLATFORM_TOOL_HITL,
    MAX_DELEGATION_DEPTH,
    DEFAULT_DELEGATION_BUDGET,
    type DelegationBudget,
    type CallChainEntry,
    type CallChainCheckResult,
    type DelegationContext,
    type TeamDelegationContext,
    type PlatformTool,
    type HITLRequirement,
    type HeartbeatCheckResult,
    type HeartbeatFinding,
    type HeartbeatResponse,
    type ProactiveTaskSuggestion,
} from './xerus-master.types';
import { NATIVE_SDK_TOOLS } from '../types';
import { ORCHESTRATOR_ONLY_TOOLS, COMMON_TOOLS } from '../orchestrator/tool.filter';
import { DomainError } from '../../../utils/errors';

// -----------------------------------------------------------------------------
// Call Chain Tracker
// -----------------------------------------------------------------------------

export class CallChainTracker {
    private stack: CallChainEntry[] = [];
    private budget: DelegationBudget;
    private usedDelegations = 0;
    private usedTokens = 0;

    constructor(budget: DelegationBudget = DEFAULT_DELEGATION_BUDGET) {
        this.budget = budget;
    }

    push(type: 'agent' | 'team', id: string): CallChainCheckResult {
        const entry: CallChainEntry = { type, id, startedAt: new Date() };

        if (this.wouldCreateCycle(entry)) {
            return {
                allowed: false,
                reason: 'circular_dependency',
                stackTrace: this.getStackTrace(),
            };
        }

        if (this.stack.length >= MAX_DELEGATION_DEPTH) {
            return {
                allowed: false,
                reason: 'max_depth_exceeded',
                stackTrace: this.getStackTrace(),
            };
        }

        if (this.usedDelegations >= this.budget.maxDelegations) {
            return {
                allowed: false,
                reason: 'budget_exceeded',
                stackTrace: this.getStackTrace(),
            };
        }

        this.stack.push(entry);
        this.usedDelegations++;
        return { allowed: true };
    }

    pop(): CallChainEntry | undefined {
        return this.stack.pop();
    }

    getDepth(): number {
        return this.stack.length;
    }

    getStackTrace(): string {
        return this.stack.map((e) => `${e.type}:${e.id}`).join(' -> ');
    }

    addTokenUsage(tokens: number): boolean {
        if (this.usedTokens + tokens > this.budget.maxTokensDelegated) {
            return false;
        }
        this.usedTokens += tokens;
        return true;
    }

    getRemainingBudget(): { delegations: number; tokens: number } {
        return {
            delegations: this.budget.maxDelegations - this.usedDelegations,
            tokens: this.budget.maxTokensDelegated - this.usedTokens,
        };
    }

    private wouldCreateCycle(entry: CallChainEntry): boolean {
        return this.stack.some((e) => e.type === entry.type && e.id === entry.id);
    }
}

// -----------------------------------------------------------------------------
// Xerus Master Service
// -----------------------------------------------------------------------------

export class XerusMasterService {
    /**
     * Get all tools available to the master orchestrator.
     * Includes SDK native tools, system delegation tools, and platform tools.
     */
    getMasterTools(): string[] {
        return [
            ...NATIVE_SDK_TOOLS,
            ...ORCHESTRATOR_ONLY_TOOLS,
            ...COMMON_TOOLS,
            ...PLATFORM_TOOL_LIST,
        ];
    }

    /**
     * Check if a tool requires human-in-the-loop approval.
     */
    getHitlRequirement(tool: string): HITLRequirement | null {
        if (PLATFORM_TOOL_HITL[tool as PlatformTool]) {
            return PLATFORM_TOOL_HITL[tool as PlatformTool];
        }
        return null;
    }

    /**
     * Check if a tool requires HITL approval.
     * Returns true for 'always' requirement or 'conditional' with condition met.
     */
    requiresHitlApproval(
        tool: string,
        conditionMet?: boolean
    ): boolean {
        const requirement = this.getHitlRequirement(tool);
        if (!requirement) {
            return false;
        }

        if (requirement === 'always') {
            return true;
        }

        if (requirement === 'conditional' && conditionMet) {
            return true;
        }

        return false;
    }

    /**
     * Validate delegation context before invoking an agent.
     */
    validateDelegation(
        context: DelegationContext,
        callChain: CallChainTracker
    ): CallChainCheckResult {
        return callChain.push('agent', context.agentId);
    }

    /**
     * Validate team delegation context before invoking a team.
     */
    validateTeamDelegation(
        context: TeamDelegationContext,
        callChain: CallChainTracker
    ): CallChainCheckResult {
        return callChain.push('team', context.teamId);
    }

    /**
     * Check if an agent slug is the Xerus master.
     */
    isXerusMaster(slug: string): boolean {
        return slug.toLowerCase() === XERUS_MASTER_SLUG;
    }

    /**
     * Generate heartbeat check result based on workspace state.
     * Called during scheduled heartbeat intervals.
     */
    generateHeartbeatCheck(
        blockedTasks: number,
        idleAgents: Array<{ agentId: string; idleMinutes: number }>,
        pendingDecisions: number,
        creditBurnRate?: number
    ): HeartbeatCheckResult {
        const findings: HeartbeatFinding[] = [];

        // Check for blocked tasks
        if (blockedTasks > 0) {
            findings.push({
                severity: blockedTasks > 3 ? 'warning' : 'info',
                message: `${blockedTasks} task(s) are currently blocked`,
                suggestedAction: 'Review blocked tasks and reassign or unblock',
            });
        }

        // Check for idle agents
        for (const agent of idleAgents) {
            if (agent.idleMinutes > 120) {
                findings.push({
                    severity: 'warning',
                    message: `Agent ${agent.agentId} has been idle for ${agent.idleMinutes} minutes`,
                    suggestedAction: 'Check if agent is stuck or needs reassignment',
                });
            }
        }

        // Check for pending decisions
        if (pendingDecisions > 0) {
            findings.push({
                severity: pendingDecisions > 2 ? 'alert' : 'warning',
                message: `${pendingDecisions} decision(s) pending user approval`,
                suggestedAction: 'Review @human mentions',
            });
        }

        // Check credit burn rate
        if (creditBurnRate !== undefined && creditBurnRate > 80) {
            findings.push({
                severity: 'alert',
                message: `Credit usage at ${creditBurnRate}% of monthly budget`,
                suggestedAction: 'Consider optimizing agent usage or upgrading plan',
            });
        }

        return {
            hasIssues: findings.some((f) => f.severity !== 'info'),
            blockedTasks,
            idleAgents: idleAgents.length,
            pendingDecisions,
            creditBurnRate,
            findings,
        };
    }

    /**
     * Format heartbeat response based on check results.
     */
    formatHeartbeatResponse(check: HeartbeatCheckResult): HeartbeatResponse[] {
        if (!check.hasIssues) {
            return [{ type: 'ok', content: 'HEARTBEAT_OK' }];
        }

        const responses: HeartbeatResponse[] = [];

        for (const finding of check.findings) {
            if (finding.severity === 'alert') {
                responses.push({
                    type: 'alert',
                    content: `[ALERT @human] ${finding.message}${finding.suggestedAction ? '. ' + finding.suggestedAction : ''}`,
                });
            } else if (finding.channelSlug) {
                responses.push({
                    type: 'channel_post',
                    channelSlug: finding.channelSlug,
                    content: `[POST #${finding.channelSlug}] ${finding.message}`,
                });
            }
        }

        return responses.length > 0 ? responses : [{ type: 'ok', content: 'HEARTBEAT_OK' }];
    }

    /**
     * Suggest proactive tasks based on workspace analysis.
     */
    suggestProactiveTasks(
        channelsWithDrafts: Array<{ channelId: string; draftCount: number }>,
        missedSchedules: Array<{ taskName: string; lastRun: Date; intervalDays: number }>,
        frequentQueries: Array<{ query: string; count: number }>
    ): ProactiveTaskSuggestion[] {
        const suggestions: ProactiveTaskSuggestion[] = [];

        // Drafts without reviewers
        for (const channel of channelsWithDrafts) {
            if (channel.draftCount > 0) {
                suggestions.push({
                    channelId: channel.channelId,
                    title: `Review ${channel.draftCount} draft(s)`,
                    description: `${channel.draftCount} items in draft status need review`,
                    priority: channel.draftCount > 3 ? 'high' : 'medium',
                    reason: 'Drafts without review can block workflow',
                });
            }
        }

        // Missed scheduled tasks
        for (const schedule of missedSchedules) {
            const daysSinceLastRun = Math.floor(
                (Date.now() - schedule.lastRun.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSinceLastRun > schedule.intervalDays) {
                suggestions.push({
                    channelId: '',
                    title: `Run overdue: ${schedule.taskName}`,
                    description: `Last run ${daysSinceLastRun} days ago (scheduled every ${schedule.intervalDays} days)`,
                    priority: 'high',
                    reason: 'Scheduled task is overdue',
                });
            }
        }

        // Frequent queries indicate missing tasks
        for (const query of frequentQueries) {
            if (query.count >= 3) {
                suggestions.push({
                    channelId: '',
                    title: `Address frequent query: ${query.query}`,
                    description: `User asked about "${query.query}" ${query.count} times`,
                    priority: 'medium',
                    reason: 'Repeated queries suggest unaddressed need',
                });
            }
        }

        return suggestions;
    }
}

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

export class DelegationError extends DomainError {
    public readonly reason: string;
    public readonly stackTrace?: string;

    constructor(message: string, reason: string, stackTrace?: string) {
        super(message, 400, 'DELEGATION_ERROR');
        this.reason = reason;
        this.stackTrace = stackTrace;
    }
}

export class PlatformToolError extends DomainError {
    public readonly toolName: string;
    public readonly cause?: Error;

    constructor(message: string, toolName: string, cause?: Error) {
        super(message, 500, 'PLATFORM_TOOL_ERROR');
        this.toolName = toolName;
        this.cause = cause;
    }
}

// -----------------------------------------------------------------------------
// Singleton Instance
// -----------------------------------------------------------------------------

let xerusMasterServiceInstance: XerusMasterService | null = null;

export function getXerusMasterService(): XerusMasterService {
    if (!xerusMasterServiceInstance) {
        xerusMasterServiceInstance = new XerusMasterService();
    }
    return xerusMasterServiceInstance;
}

export function resetXerusMasterService(): void {
    xerusMasterServiceInstance = null;
}
