// Hooks Types Tests

import {
    HOOK_EVENTS,
    CORE_HOOK_EVENTS,
    TEAM_HOOK_EVENTS,
    BaseHookInput,
    PreToolUseInput,
    PostToolUseInput,
    PostToolUseFailureInput,
    SubagentStartInput,
    PermissionRequestInput,
    SetupInput,
    NotificationInput,
    TeammateIdleInput,
    TaskCompletedInput,
    isPreToolUseInput,
    isPostToolUseInput,
    isPostToolUseFailureInput,
    isSubagentStartInput,
    isPermissionRequestInput,
    isSetupInput,
    isNotificationInput,
    isTeammateIdleInput,
    isTaskCompletedInput,
    isValidHookEvent,
} from '../hooks.types';

describe('Hook Event Constants', () => {
    describe('HOOK_EVENTS', () => {
        it('should contain all 15 hook events', () => {
            expect(HOOK_EVENTS).toEqual([
                'SessionStart',
                'UserPromptSubmit',
                'PreToolUse',
                'PostToolUse',
                'PostToolUseFailure',
                'PreCompact',
                'SessionEnd',
                'Stop',
                'SubagentStop',
                'SubagentStart',
                'Notification',
                'PermissionRequest',
                'Setup',
                'TeammateIdle',
                'TaskCompleted',
            ]);
        });

        it('should have exactly 15 events', () => {
            expect(HOOK_EVENTS.length).toBe(15);
        });
    });

    describe('CORE_HOOK_EVENTS', () => {
        it('should contain 13 core SDK hooks', () => {
            expect(CORE_HOOK_EVENTS).toEqual([
                'SessionStart',
                'UserPromptSubmit',
                'PreToolUse',
                'PostToolUse',
                'PostToolUseFailure',
                'PreCompact',
                'SessionEnd',
                'Stop',
                'SubagentStop',
                'SubagentStart',
                'Notification',
                'PermissionRequest',
                'Setup',
            ]);
        });
    });

    describe('TEAM_HOOK_EVENTS', () => {
        it('should contain 2 team-specific hooks', () => {
            expect(TEAM_HOOK_EVENTS).toEqual(['TeammateIdle', 'TaskCompleted']);
        });
    });
});

describe('Type Guards', () => {
    const createBaseInput = (): BaseHookInput => ({
        session_id: 'session-123',
        transcript_path: '/workspace/transcript.json',
        cwd: '/workspace/agents/test-agent',
        permission_mode: 'default',
    });

    describe('isPreToolUseInput', () => {
        it('should return true for PreToolUseInput', () => {
            const input: PreToolUseInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: { command: 'ls' },
                agent_id: 'agent-123',
                user_id: 'user-456',
            };

            expect(isPreToolUseInput(input)).toBe(true);
        });

        it('should return false for PostToolUseInput', () => {
            const input: PostToolUseInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: { command: 'ls' },
                tool_result: 'file.txt',
                duration_ms: 100,
                success: true,
                agent_id: 'agent-123',
                user_id: 'user-456',
            };

            expect(isPreToolUseInput(input)).toBe(false);
        });

        it('should return false for other input types', () => {
            const input: NotificationInput = {
                ...createBaseInput(),
                notification_type: 'info',
                message: 'Hello',
            };

            expect(isPreToolUseInput(input)).toBe(false);
        });
    });

    describe('isPostToolUseInput', () => {
        it('should return true for PostToolUseInput', () => {
            const input: PostToolUseInput = {
                ...createBaseInput(),
                tool_name: 'Write',
                tool_input: { path: '/file.txt', content: 'hello' },
                tool_result: { success: true },
                duration_ms: 50,
                success: true,
                agent_id: 'agent-123',
                user_id: 'user-456',
            };

            expect(isPostToolUseInput(input)).toBe(true);
        });

        it('should return false for PreToolUseInput', () => {
            const input: PreToolUseInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: { command: 'ls' },
                agent_id: 'agent-123',
                user_id: 'user-456',
            };

            expect(isPostToolUseInput(input)).toBe(false);
        });
    });

    describe('isNotificationInput', () => {
        it('should return true for NotificationInput', () => {
            const input: NotificationInput = {
                ...createBaseInput(),
                notification_type: 'alert',
                message: 'Task completed',
                priority: 'high',
            };

            expect(isNotificationInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            const input: PreToolUseInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: {},
                agent_id: 'agent-123',
                user_id: 'user-456',
            };

            expect(isNotificationInput(input)).toBe(false);
        });
    });

    describe('isTeammateIdleInput', () => {
        it('should return true for TeammateIdleInput', () => {
            const input: TeammateIdleInput = {
                ...createBaseInput(),
                teammate_id: 'teammate-123',
                teammate_name: 'researcher',
                last_task_id: 'task-456',
                output_summary: 'Research completed',
            };

            expect(isTeammateIdleInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            const input: NotificationInput = {
                ...createBaseInput(),
                notification_type: 'info',
                message: 'Hello',
            };

            expect(isTeammateIdleInput(input)).toBe(false);
        });
    });

    describe('isTaskCompletedInput', () => {
        it('should return true for TaskCompletedInput', () => {
            const input: TaskCompletedInput = {
                ...createBaseInput(),
                task_id: 'task-123',
                task_title: 'Implement feature',
                completed_by: 'agent-456',
                deliverables: ['/output/report.md'],
            };

            expect(isTaskCompletedInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            const input: TeammateIdleInput = {
                ...createBaseInput(),
                teammate_id: 'teammate-123',
                teammate_name: 'researcher',
            };

            expect(isTaskCompletedInput(input)).toBe(false);
        });
    });

    describe('isPostToolUseFailureInput', () => {
        it('should return true for PostToolUseFailureInput', () => {
            const input: PostToolUseFailureInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: { command: 'bad-command' },
                agent_id: 'agent-123',
                user_id: 'user-456',
                error_message: 'Command not found',
                error_code: 'ENOENT',
                duration_ms: 50,
            };
            expect(isPostToolUseFailureInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            expect(isPostToolUseFailureInput(createBaseInput())).toBe(false);
        });
    });

    describe('isSubagentStartInput', () => {
        it('should return true for SubagentStartInput', () => {
            const input: SubagentStartInput = {
                ...createBaseInput(),
                subagent_type: 'researcher',
                subagent_id: 'sub-123',
                parent_agent_id: 'agent-456',
                task_description: 'Research topic X',
            };
            expect(isSubagentStartInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            expect(isSubagentStartInput(createBaseInput())).toBe(false);
        });
    });

    describe('isPermissionRequestInput', () => {
        it('should return true for PermissionRequestInput', () => {
            const input: PermissionRequestInput = {
                ...createBaseInput(),
                tool_name: 'Bash',
                tool_input: { command: 'rm -rf /' },
                agent_id: 'agent-123',
                user_id: 'user-456',
                permission_type: 'dangerous_command',
                reason: 'Destructive operation',
            };
            expect(isPermissionRequestInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            expect(isPermissionRequestInput(createBaseInput())).toBe(false);
        });
    });

    describe('isSetupInput', () => {
        it('should return true for SetupInput', () => {
            const input: SetupInput = {
                ...createBaseInput(),
                agent_id: 'agent-123',
                user_id: 'user-456',
                workspace_path: '/workspace',
                is_first_session: true,
            };
            expect(isSetupInput(input)).toBe(true);
        });

        it('should return false for other input types', () => {
            expect(isSetupInput(createBaseInput())).toBe(false);
        });
    });

    describe('isValidHookEvent', () => {
        it('should return true for valid hook events', () => {
            expect(isValidHookEvent('SessionStart')).toBe(true);
            expect(isValidHookEvent('UserPromptSubmit')).toBe(true);
            expect(isValidHookEvent('PreToolUse')).toBe(true);
            expect(isValidHookEvent('PostToolUse')).toBe(true);
            expect(isValidHookEvent('PostToolUseFailure')).toBe(true);
            expect(isValidHookEvent('PreCompact')).toBe(true);
            expect(isValidHookEvent('SessionEnd')).toBe(true);
            expect(isValidHookEvent('Stop')).toBe(true);
            expect(isValidHookEvent('SubagentStop')).toBe(true);
            expect(isValidHookEvent('SubagentStart')).toBe(true);
            expect(isValidHookEvent('Notification')).toBe(true);
            expect(isValidHookEvent('PermissionRequest')).toBe(true);
            expect(isValidHookEvent('Setup')).toBe(true);
            expect(isValidHookEvent('TeammateIdle')).toBe(true);
            expect(isValidHookEvent('TaskCompleted')).toBe(true);
        });

        it('should return false for invalid hook events', () => {
            expect(isValidHookEvent('InvalidEvent')).toBe(false);
            expect(isValidHookEvent('sessionStart')).toBe(false); // case sensitive
            expect(isValidHookEvent('')).toBe(false);
            expect(isValidHookEvent('PreTool')).toBe(false);
        });
    });
});

describe('Input Type Structures', () => {
    it('should allow creating BaseHookInput with all fields', () => {
        const input: BaseHookInput = {
            session_id: 'session-123',
            transcript_path: '/workspace/transcript.json',
            cwd: '/workspace/agents/test-agent',
            permission_mode: 'default',
        };

        expect(input.session_id).toBe('session-123');
        expect(input.permission_mode).toBe('default');
    });

    it('should allow creating BaseHookInput without optional fields', () => {
        const input: BaseHookInput = {
            session_id: 'session-123',
            transcript_path: '/workspace/transcript.json',
            cwd: '/workspace/agents/test-agent',
        };

        expect(input.permission_mode).toBeUndefined();
    });

    it('should allow creating PreToolUseInput with all fields', () => {
        const input: PreToolUseInput = {
            session_id: 'session-123',
            transcript_path: '/workspace/transcript.json',
            cwd: '/workspace/agents/test-agent',
            permission_mode: 'acceptEdits',
            tool_name: 'Bash',
            tool_input: { command: 'rm -rf /' },
            agent_id: 'agent-123',
            user_id: 'user-456',
        };

        expect(input.tool_name).toBe('Bash');
        expect(input.tool_input.command).toBe('rm -rf /');
    });

    it('should allow creating PostToolUseInput extending PreToolUseInput', () => {
        const input: PostToolUseInput = {
            session_id: 'session-123',
            transcript_path: '/workspace/transcript.json',
            cwd: '/workspace/agents/test-agent',
            tool_name: 'WebSearch',
            tool_input: { query: 'Claude Agent SDK' },
            agent_id: 'agent-123',
            user_id: 'user-456',
            tool_result: { results: ['result1', 'result2'] },
            duration_ms: 1500,
            success: true,
            tokens_used: 500,
        };

        expect(input.tool_result).toEqual({ results: ['result1', 'result2'] });
        expect(input.duration_ms).toBe(1500);
    });

    it('should allow creating NotificationInput with all priority levels', () => {
        const priorities: ('low' | 'medium' | 'high' | 'critical')[] = ['low', 'medium', 'high', 'critical'];

        for (const priority of priorities) {
            const input: NotificationInput = {
                session_id: 'session-123',
                transcript_path: '/workspace/transcript.json',
                cwd: '/workspace/agents/test-agent',
                notification_type: 'alert',
                message: 'Test message',
                priority,
            };

            expect(input.priority).toBe(priority);
        }
    });
});
