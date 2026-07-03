// Runner Event Router Tests — DB Write Handlers, Metadata Sync, Logging
// Category B and C handlers split from runner-event-router.test.ts

import { routeEventToBackend } from '../runner-event-router';
import type { ResolvedExecutionDeps } from '../execution-pipeline.types';
import { ChannelNotFoundError } from '../../inbox/messaging';
import {
    InMemoryDatabase,
    createTestContext,
    createTestDeps,
} from './runner-event-router-test-deps';

describe('routeEventToBackend — DB write handlers', () => {
    describe('create_inbox_item', () => {
        function createDepsWithWorkspaceDb() {
            const { deps, db } = createTestDeps();
            const executedCommands: string[] = [];
            deps.sandboxService = {
                getDaytonaProvider: () => ({
                    executeCommand: async (_sandboxId: string, command: string) => {
                        executedCommands.push(command);
                        return { code: 0, result: '[]' };
                    },
                }),
                invalidateRegistryCache: () => {},
            } as unknown as ResolvedExecutionDeps['sandboxService'];
            return { deps, db, executedCommands };
        }

        it('should insert inbox item into workspace.db with correct fields', async () => {
            const ctx = createTestContext();
            const { deps, executedCommands } = createDepsWithWorkspaceDb();

            await routeEventToBackend('create_inbox_item', {
                data: { channel: 'ch-001', content: 'Task completed', priority: 'high' },
            }, ctx, deps);

            expect(executedCommands).toHaveLength(1);
            const sql = executedCommands[0];
            expect(sql).toContain('INSERT INTO inbox_items');
            expect(sql).toContain('test-agent');
            expect(sql).toContain('Task completed');
            expect(sql).toContain('high');
        });

        it('should default priority to normal', async () => {
            const ctx = createTestContext();
            const { deps, executedCommands } = createDepsWithWorkspaceDb();

            await routeEventToBackend('create_inbox_item', {
                data: { content: 'No priority specified' },
            }, ctx, deps);

            const sql = executedCommands[0];
            expect(sql).toContain("'normal'");
        });

        it('should truncate long content for subject', async () => {
            const ctx = createTestContext();
            const { deps, executedCommands } = createDepsWithWorkspaceDb();
            const longContent = 'A'.repeat(100);

            await routeEventToBackend('create_inbox_item', {
                data: { content: longContent },
            }, ctx, deps);

            const sql = executedCommands[0];
            expect(sql).toContain('...');
        });

        it('should throw when sandboxId is not set', async () => {
            const ctx = createTestContext({ sandboxId: null });
            const { deps } = createDepsWithWorkspaceDb();

            await expect(routeEventToBackend('create_inbox_item', {
                data: { content: 'test' },
            }, ctx, deps)).rejects.toThrow('sandboxId not set');
        });

        it('should throw when content is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createDepsWithWorkspaceDb();

            await expect(routeEventToBackend('create_inbox_item', {
                data: { channel: 'ch-001' },
            }, ctx, deps)).rejects.toThrow('create_inbox_item');
        });

        it('should write to workspace.db even without channel', async () => {
            const ctx = createTestContext();
            const { deps, executedCommands } = createDepsWithWorkspaceDb();

            await routeEventToBackend('create_inbox_item', {
                data: { content: 'No channel' },
            }, ctx, deps);

            expect(executedCommands).toHaveLength(1);
            expect(executedCommands[0]).toContain('No channel');
        });
    });

    describe('agent_message', () => {
        it('should delegate to messageBridge.handleOutboundMessage', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const calls: Array<{ provider: unknown; sandboxId: string; userId: string; message: unknown }> = [];
            deps.sandboxService = {
                getDaytonaProvider: () => ({ fake: true }),
                invalidateRegistryCache: () => {},
            } as unknown as ResolvedExecutionDeps['sandboxService'];
            deps.messageBridge = {
                handleOutboundMessage: async (provider: unknown, sandboxId: string, userId: string, message: unknown) => {
                    calls.push({ provider, sandboxId, userId, message });
                    return { message_id: 'msg-001', channel_id: 'ch-001' };
                },
            } as unknown as ResolvedExecutionDeps['messageBridge'];

            await routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello team!', agent_slug: 'writer', project: 'marketing' },
            }, ctx, deps);

            expect(calls).toHaveLength(1);
            expect(calls[0].sandboxId).toBe('sbx-001');
            expect(calls[0].userId).toBe('user-123');
            const msg = calls[0].message as Record<string, unknown>;
            expect(msg.content).toBe('Hello team!');
            expect(msg.message_type).toBe('chat');
        });

        it('should throw when messageBridge is not available', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            deps.messageBridge = null;

            await expect(routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello' },
            }, ctx, deps)).rejects.toThrow('messageBridge not initialized');
        });

        it('should warn when messageBridge throws ChannelNotFoundError', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            deps.sandboxService = {
                getDaytonaProvider: () => ({ fake: true }),
                invalidateRegistryCache: () => {},
            } as unknown as ResolvedExecutionDeps['sandboxService'];
            deps.messageBridge = {
                handleOutboundMessage: async () => { throw new ChannelNotFoundError('marketing', 'general'); },
            } as unknown as ResolvedExecutionDeps['messageBridge'];
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello', project: 'marketing' },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('should throw when channel is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await expect(routeEventToBackend('agent_message', {
                data: { content: 'No channel' },
            }, ctx, deps)).rejects.toThrow('agent_message');
        });

        it('should throw when content is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await expect(routeEventToBackend('agent_message', {
                data: { channel: 'general' },
            }, ctx, deps)).rejects.toThrow('agent_message');
        });
    });

    describe('hook_log', () => {
        it('should log hook event without DB insert', async () => {
            const ctx = createTestContext({ sessionId: 'session-001' });
            const { deps, db } = createTestDeps();
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await routeEventToBackend('hook_log', {
                data: { hook_event: 'PreToolUse', duration_ms: 15, success: true },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hook_log'));
            logSpy.mockRestore();
        });

        it('should not write to DB when sessionId is empty', async () => {
            const ctx = createTestContext({ sessionId: '' });
            const { deps, db } = createTestDeps();

            await routeEventToBackend('hook_log', { data: { hook_event: 'PreToolUse' } }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });
    });

    describe('subagent_failure', () => {
        it('should not write to DB (no table exists)', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('subagent_failure', {
                data: { subagent_type: 'researcher', error_message: 'timeout' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });
    });

    describe('sandbox_lifecycle', () => {
        it('should update sandbox status for known actions', async () => {
            const actionMap: Record<string, string> = {
                start: 'running', stop: 'paused', archive: 'archived',
                delete: 'stopped', restore: 'running',
            };

            for (const [action, expectedStatus] of Object.entries(actionMap)) {
                const ctx = createTestContext();
                const db = new InMemoryDatabase();
                const { deps } = createTestDeps(db);
                deps.sandboxService = {
                    invalidateRegistryCache: (_userId: string) => {},
                } as unknown as ResolvedExecutionDeps['sandboxService'];

                await routeEventToBackend('sandbox_lifecycle', {
                    data: { sandbox_id: 'sbx-001', action },
                }, ctx, deps);

                expect(db.queries).toHaveLength(1);
                const q = db.getLastQuery()!;
                expect(q.sql).toContain('UPDATE workspaces');
                expect(q.params[0]).toBe('sbx-001');
                expect(q.params[1]).toBe(expectedStatus);
            }
        });

        it('should throw when sandbox_id is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await expect(routeEventToBackend('sandbox_lifecycle', {
                data: { action: 'start' },
            }, ctx, deps)).rejects.toThrow('sandbox_lifecycle');
        });

        it('should throw when action is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await expect(routeEventToBackend('sandbox_lifecycle', {
                data: { sandbox_id: 'sbx-001' },
            }, ctx, deps)).rejects.toThrow('sandbox_lifecycle');
        });
    });
});

describe('routeEventToBackend — metadata_sync', () => {
    it('should warn for unsupported entities', async () => {
        const ctx = createTestContext();
        const { deps } = createTestDeps();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await routeEventToBackend('metadata_sync', {
            data: { entity: 'unknown_thing', action: 'create', data: { slug: 'test' } },
        }, ctx, deps);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unsupported entity'));
        warnSpy.mockRestore();
    });

    it('should warn when action is missing', async () => {
        const ctx = createTestContext();
        const { deps } = createTestDeps();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await routeEventToBackend('metadata_sync', {
            data: { entity: 'agent', data: { slug: 'test' } },
        }, ctx, deps);

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('should warn for unknown actions', async () => {
        const ctx = createTestContext();
        const { deps } = createTestDeps();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await routeEventToBackend('metadata_sync', {
            entity: 'agent', action: 'purge', data: { slug: 'test-agent' },
        }, ctx, deps);

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

describe('routeEventToBackend — structured logging and errors', () => {
    const logOnlyEvents = [
        'session_analytics', 'health', 'sessions', 'credit_check',
        'ace_reflection', 'skill_suggestion',
    ];

    for (const event of logOnlyEvents) {
        it(`should not write to DB for ${event} events`, async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend(event, {
                data: { agent_slug: 'test-agent', some_field: 'value' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });
    }

    it('error event should log with console.error', async () => {
        const ctx = createTestContext();
        const { deps } = createTestDeps();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await routeEventToBackend('error', {
            data: { code: 'TIMEOUT', message: 'Execution timed out' },
        }, ctx, deps);

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('should warn for unknown event types', async () => {
        const ctx = createTestContext();
        const { deps } = createTestDeps();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await routeEventToBackend('completely_unknown_event', {}, ctx, deps);

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
