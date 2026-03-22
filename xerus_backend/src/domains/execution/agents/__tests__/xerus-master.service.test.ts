// Xerus Master Service Tests
// Tests for the master orchestrator service
// NO MOCKS - uses real service instances

import {
    XerusMasterService,
    CallChainTracker,
    getXerusMasterService,
    resetXerusMasterService,
    PLATFORM_TOOL_LIST,
    PLATFORM_TOOLS,
    MAX_DELEGATION_DEPTH,
    DEFAULT_DELEGATION_BUDGET,
} from '../';
import { NATIVE_SDK_TOOLS } from '../../types';

describe('XerusMasterService', () => {
    let service: XerusMasterService;

    beforeEach(() => {
        resetXerusMasterService();
        service = getXerusMasterService();
    });

    describe('getMasterTools', () => {
        it('should return all SDK native tools', () => {
            const tools = service.getMasterTools();

            for (const sdkTool of NATIVE_SDK_TOOLS) {
                expect(tools).toContain(sdkTool);
            }
        });

        it('should return all platform tools', () => {
            const tools = service.getMasterTools();

            expect(PLATFORM_TOOL_LIST.length).toBeGreaterThan(0);
            for (const platformTool of PLATFORM_TOOL_LIST) {
                expect(tools).toContain(platformTool);
            }
        });

        it('should include Task tool for delegation', () => {
            const tools = service.getMasterTools();
            expect(tools).toContain('Task');
        });

        it('should include AskUserQuestion for HITL', () => {
            const tools = service.getMasterTools();
            expect(tools).toContain('AskUserQuestion');
        });
    });

    describe('getHitlRequirement', () => {
        it('should return "always" for platform.create_agent', () => {
            const requirement = service.getHitlRequirement(PLATFORM_TOOLS.CREATE_AGENT);
            expect(requirement).toBe('always');
        });

        it('should return "always" for platform.clone_agent', () => {
            const requirement = service.getHitlRequirement(PLATFORM_TOOLS.CLONE_AGENT);
            expect(requirement).toBe('always');
        });

        it('should return "auto" for platform.search_agents', () => {
            const requirement = service.getHitlRequirement(PLATFORM_TOOLS.SEARCH_AGENTS);
            expect(requirement).toBe('auto');
        });

        it('should return "conditional" for platform.upload_kb', () => {
            const requirement = service.getHitlRequirement(PLATFORM_TOOLS.UPLOAD_KB);
            expect(requirement).toBe('conditional');
        });

        it('should return "always" for platform.connect_tool (OAuth)', () => {
            const requirement = service.getHitlRequirement(PLATFORM_TOOLS.CONNECT_TOOL);
            expect(requirement).toBe('always');
        });

        it('should return null for non-platform tools', () => {
            const requirement = service.getHitlRequirement('Read');
            expect(requirement).toBeNull();
        });
    });

    describe('requiresHitlApproval', () => {
        it('should return true for tools with "always" requirement', () => {
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.CREATE_AGENT)).toBe(true);
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.CLONE_AGENT)).toBe(true);
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.CREATE_SKILL)).toBe(true);
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.CONNECT_TOOL)).toBe(true);
        });

        it('should return false for tools with "auto" requirement', () => {
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.SEARCH_AGENTS)).toBe(false);
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.GET_STATUS)).toBe(false);
        });

        it('should return true for conditional tools when condition is met', () => {
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.UPLOAD_KB, true)).toBe(true);
        });

        it('should return false for conditional tools when condition is not met', () => {
            expect(service.requiresHitlApproval(PLATFORM_TOOLS.UPLOAD_KB, false)).toBe(false);
        });
    });

    describe('isXerusMaster', () => {
        it('should return true for xerus-master slug', () => {
            expect(service.isXerusMaster('xerus-master')).toBe(true);
        });

        it('should return true for uppercase xerus-master slug', () => {
            expect(service.isXerusMaster('XERUS-MASTER')).toBe(true);
        });

        it('should return true for mixed case xerus-master slug', () => {
            expect(service.isXerusMaster('Xerus-Master')).toBe(true);
        });

        it('should return false for other slugs', () => {
            expect(service.isXerusMaster('scout-sally')).toBe(false);
            expect(service.isXerusMaster('vision')).toBe(false);
        });
    });

    describe('generateHeartbeatCheck', () => {
        it('should report no issues when workspace is healthy', () => {
            const result = service.generateHeartbeatCheck(0, [], 0);

            expect(result.hasIssues).toBe(false);
            expect(result.blockedTasks).toBe(0);
            expect(result.idleAgents).toBe(0);
            expect(result.pendingDecisions).toBe(0);
        });

        it('should report blocked tasks', () => {
            const result = service.generateHeartbeatCheck(5, [], 0);

            expect(result.hasIssues).toBe(true);
            expect(result.blockedTasks).toBe(5);
            expect(result.findings.some((f) => f.message.includes('blocked'))).toBe(true);
        });

        it('should report idle agents over 2 hours', () => {
            const idleAgents = [{ agentId: 'agent-1', idleMinutes: 150 }];
            const result = service.generateHeartbeatCheck(0, idleAgents, 0);

            expect(result.hasIssues).toBe(true);
            expect(result.idleAgents).toBe(1);
            expect(result.findings.some((f) => f.message.includes('idle'))).toBe(true);
        });

        it('should not report idle agents under 2 hours', () => {
            const idleAgents = [{ agentId: 'agent-1', idleMinutes: 60 }];
            const result = service.generateHeartbeatCheck(0, idleAgents, 0);

            expect(result.findings.filter((f) => f.message.includes('idle'))).toHaveLength(0);
        });

        it('should report pending decisions', () => {
            const result = service.generateHeartbeatCheck(0, [], 3);

            expect(result.hasIssues).toBe(true);
            expect(result.pendingDecisions).toBe(3);
            expect(result.findings.some((f) => f.message.includes('pending'))).toBe(true);
        });

        it('should report high credit burn rate as alert', () => {
            const result = service.generateHeartbeatCheck(0, [], 0, 85);

            expect(result.hasIssues).toBe(true);
            expect(result.creditBurnRate).toBe(85);
            expect(result.findings.some((f) => f.severity === 'alert')).toBe(true);
        });
    });

    describe('formatHeartbeatResponse', () => {
        it('should return HEARTBEAT_OK when no issues', () => {
            const check = service.generateHeartbeatCheck(0, [], 0);
            const responses = service.formatHeartbeatResponse(check);

            expect(responses).toHaveLength(1);
            expect(responses[0].type).toBe('ok');
            expect(responses[0].content).toBe('HEARTBEAT_OK');
        });

        it('should return alert for high severity findings', () => {
            const check = service.generateHeartbeatCheck(0, [], 0, 90);
            const responses = service.formatHeartbeatResponse(check);

            expect(responses.some((r) => r.type === 'alert')).toBe(true);
            expect(responses.some((r) => r.content.includes('[ALERT @human]'))).toBe(true);
        });
    });

    describe('suggestProactiveTasks', () => {
        it('should suggest review tasks for drafts', () => {
            const channelsWithDrafts = [{ channelId: 'ch-1', draftCount: 3 }];
            const suggestions = service.suggestProactiveTasks(channelsWithDrafts, [], []);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].title).toContain('draft');
        });

        it('should suggest high priority for many drafts', () => {
            const channelsWithDrafts = [{ channelId: 'ch-1', draftCount: 5 }];
            const suggestions = service.suggestProactiveTasks(channelsWithDrafts, [], []);

            expect(suggestions[0].priority).toBe('high');
        });

        it('should suggest tasks for missed schedules', () => {
            const missedSchedules = [
                { taskName: 'Weekly Report', lastRun: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), intervalDays: 7 },
            ];
            const suggestions = service.suggestProactiveTasks([], missedSchedules, []);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].title).toContain('overdue');
            expect(suggestions[0].priority).toBe('high');
        });

        it('should suggest tasks for frequent queries', () => {
            const frequentQueries = [{ query: 'Q4 planning', count: 4 }];
            const suggestions = service.suggestProactiveTasks([], [], frequentQueries);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0].title).toContain('frequent query');
        });

        it('should not suggest for infrequent queries', () => {
            const frequentQueries = [{ query: 'random question', count: 2 }];
            const suggestions = service.suggestProactiveTasks([], [], frequentQueries);

            expect(suggestions).toHaveLength(0);
        });
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const instance1 = getXerusMasterService();
            const instance2 = getXerusMasterService();
            expect(instance1).toBe(instance2);
        });

        it('should reset instance', () => {
            const instance1 = getXerusMasterService();
            resetXerusMasterService();
            const instance2 = getXerusMasterService();
            expect(instance1).not.toBe(instance2);
        });
    });
});

describe('CallChainTracker', () => {
    let tracker: CallChainTracker;

    beforeEach(() => {
        tracker = new CallChainTracker();
    });

    describe('push', () => {
        it('should allow first delegation', () => {
            const result = tracker.push('agent', 'agent-1');
            expect(result.allowed).toBe(true);
        });

        it('should allow sequential non-circular delegations', () => {
            tracker.push('agent', 'agent-1');
            const result = tracker.push('agent', 'agent-2');
            expect(result.allowed).toBe(true);
        });

        it('should prevent circular dependency (same agent)', () => {
            tracker.push('agent', 'agent-1');
            const result = tracker.push('agent', 'agent-1');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('circular_dependency');
        });

        it('should prevent circular dependency (indirect)', () => {
            tracker.push('agent', 'agent-1');
            tracker.push('agent', 'agent-2');
            const result = tracker.push('agent', 'agent-1');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('circular_dependency');
        });

        it('should prevent exceeding max depth', () => {
            for (let i = 0; i < MAX_DELEGATION_DEPTH; i++) {
                tracker.push('agent', `agent-${i}`);
            }

            const result = tracker.push('agent', 'agent-extra');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('max_depth_exceeded');
        });

        it('should prevent exceeding max delegations', () => {
            for (let i = 0; i < DEFAULT_DELEGATION_BUDGET.maxDelegations; i++) {
                const pushResult = tracker.push('agent', `agent-${i}`);
                if (pushResult.allowed) {
                    tracker.pop();
                }
            }

            const result = tracker.push('agent', 'agent-extra');

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('budget_exceeded');
        });
    });

    describe('pop', () => {
        it('should remove last entry from stack', () => {
            tracker.push('agent', 'agent-1');
            tracker.push('agent', 'agent-2');

            const popped = tracker.pop();

            expect(popped?.id).toBe('agent-2');
            expect(tracker.getDepth()).toBe(1);
        });

        it('should return undefined for empty stack', () => {
            const popped = tracker.pop();
            expect(popped).toBeUndefined();
        });
    });

    describe('getDepth', () => {
        it('should return 0 for empty tracker', () => {
            expect(tracker.getDepth()).toBe(0);
        });

        it('should return correct depth after pushes', () => {
            tracker.push('agent', 'agent-1');
            tracker.push('team', 'team-1');
            expect(tracker.getDepth()).toBe(2);
        });
    });

    describe('getStackTrace', () => {
        it('should return empty string for empty tracker', () => {
            expect(tracker.getStackTrace()).toBe('');
        });

        it('should return formatted stack trace', () => {
            tracker.push('agent', 'agent-1');
            tracker.push('team', 'team-1');
            tracker.push('agent', 'agent-2');

            const trace = tracker.getStackTrace();

            expect(trace).toBe('agent:agent-1 -> team:team-1 -> agent:agent-2');
        });
    });

    describe('addTokenUsage', () => {
        it('should allow token usage within budget', () => {
            const result = tracker.addTokenUsage(1000);
            expect(result).toBe(true);
        });

        it('should reject token usage exceeding budget', () => {
            tracker.addTokenUsage(DEFAULT_DELEGATION_BUDGET.maxTokensDelegated - 100);
            const result = tracker.addTokenUsage(200);
            expect(result).toBe(false);
        });
    });

    describe('getRemainingBudget', () => {
        it('should return full budget initially', () => {
            const remaining = tracker.getRemainingBudget();

            expect(remaining.delegations).toBe(DEFAULT_DELEGATION_BUDGET.maxDelegations);
            expect(remaining.tokens).toBe(DEFAULT_DELEGATION_BUDGET.maxTokensDelegated);
        });

        it('should decrease after usage', () => {
            tracker.push('agent', 'agent-1');
            tracker.addTokenUsage(5000);

            const remaining = tracker.getRemainingBudget();

            expect(remaining.delegations).toBe(DEFAULT_DELEGATION_BUDGET.maxDelegations - 1);
            expect(remaining.tokens).toBe(DEFAULT_DELEGATION_BUDGET.maxTokensDelegated - 5000);
        });
    });

    describe('custom budget', () => {
        it('should use custom budget when provided', () => {
            const customBudget = {
                maxDelegations: 2,
                maxParallel: 1,
                maxTokensDelegated: 10000,
            };
            const customTracker = new CallChainTracker(customBudget);

            customTracker.push('agent', 'agent-1');
            customTracker.pop();
            customTracker.push('agent', 'agent-2');
            customTracker.pop();

            const result = customTracker.push('agent', 'agent-3');
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('budget_exceeded');
        });
    });
});
