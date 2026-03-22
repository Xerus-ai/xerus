// Hooks Registry Tests

import { HookRegistry, buildHookHandlers, createRegistryFromMap, validateHookEvent } from '../hooks.registry';
import {
    HookEvent,
    HOOK_EVENTS,
    CORE_HOOK_EVENTS,
    TEAM_HOOK_EVENTS,
    HookResult,
    HookAgentContext,
    HookTriggerContext,
    HookHandlerMap,
} from '../hooks.types';

describe('HookRegistry', () => {
    let registry: HookRegistry;

    beforeEach(() => {
        registry = new HookRegistry();
    });

    describe('initialization', () => {
        it('should initialize with empty handler arrays for all events', () => {
            const snapshot = registry.getRegistrySnapshot();

            for (const event of HOOK_EVENTS) {
                expect(snapshot[event]).toBe(0);
            }
        });

        it('should have 15 hook events defined', () => {
            expect(HOOK_EVENTS.length).toBe(15);
        });

        it('should have 13 core hook events', () => {
            expect(CORE_HOOK_EVENTS.length).toBe(13);
        });

        it('should have 2 team-specific hook events', () => {
            expect(TEAM_HOOK_EVENTS.length).toBe(2);
            expect(TEAM_HOOK_EVENTS).toContain('TeammateIdle');
            expect(TEAM_HOOK_EVENTS).toContain('TaskCompleted');
        });
    });

    describe('registerHook', () => {
        it('should register a handler for a valid event', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('SessionStart', handler);

            expect(registry.getHandlerCount('SessionStart')).toBe(1);
        });

        it('should allow multiple handlers for the same event', () => {
            const handler1 = async (): Promise<HookResult> => ({ success: true });
            const handler2 = async (): Promise<HookResult> => ({ success: true });
            const handler3 = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('PreToolUse', handler1);
            registry.registerHook('PreToolUse', handler2);
            registry.registerHook('PreToolUse', handler3);

            expect(registry.getHandlerCount('PreToolUse')).toBe(3);
        });

        it('should throw for invalid event', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });

            expect(() => {
                registry.registerHook('InvalidEvent' as HookEvent, handler);
            }).toThrow('Invalid hook event: InvalidEvent');
        });
    });

    describe('getHandlers', () => {
        it('should return empty array when no handlers registered', () => {
            const handlers = registry.getHandlers('PostToolUse');

            expect(handlers).toEqual([]);
        });

        it('should return all registered handlers in order', () => {
            const handler1 = async (): Promise<HookResult> => ({ success: true });
            const handler2 = async (): Promise<HookResult> => ({ success: false });

            registry.registerHook('SessionEnd', handler1);
            registry.registerHook('SessionEnd', handler2);

            const handlers = registry.getHandlers('SessionEnd');

            expect(handlers.length).toBe(2);
            expect(handlers[0]).toBe(handler1);
            expect(handlers[1]).toBe(handler2);
        });

        it('should return a copy of handlers array', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });
            registry.registerHook('Stop', handler);

            const handlers1 = registry.getHandlers('Stop');
            const handlers2 = registry.getHandlers('Stop');

            expect(handlers1).not.toBe(handlers2);
            expect(handlers1).toEqual(handlers2);
        });

        it('should throw for invalid event', () => {
            expect(() => {
                registry.getHandlers('NotAValidEvent' as HookEvent);
            }).toThrow('Invalid hook event: NotAValidEvent');
        });
    });

    describe('hasHandlers', () => {
        it('should return false when no handlers registered', () => {
            expect(registry.hasHandlers('Notification')).toBe(false);
        });

        it('should return true when handlers are registered', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });
            registry.registerHook('Notification', handler);

            expect(registry.hasHandlers('Notification')).toBe(true);
        });
    });

    describe('clearHandlers', () => {
        it('should remove all handlers for an event', () => {
            const handler1 = async (): Promise<HookResult> => ({ success: true });
            const handler2 = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('SubagentStop', handler1);
            registry.registerHook('SubagentStop', handler2);

            expect(registry.getHandlerCount('SubagentStop')).toBe(2);

            registry.clearHandlers('SubagentStop');

            expect(registry.getHandlerCount('SubagentStop')).toBe(0);
        });

        it('should not affect other events', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('PreCompact', handler);
            registry.registerHook('SessionEnd', handler);

            registry.clearHandlers('PreCompact');

            expect(registry.getHandlerCount('PreCompact')).toBe(0);
            expect(registry.getHandlerCount('SessionEnd')).toBe(1);
        });

        it('should throw for invalid event', () => {
            expect(() => {
                registry.clearHandlers('Invalid' as HookEvent);
            }).toThrow('Invalid hook event: Invalid');
        });
    });

    describe('clearAll', () => {
        it('should remove all handlers from all events', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('SessionStart', handler);
            registry.registerHook('PreToolUse', handler);
            registry.registerHook('PostToolUse', handler);
            registry.registerHook('SessionEnd', handler);

            registry.clearAll();

            const snapshot = registry.getRegistrySnapshot();
            for (const event of HOOK_EVENTS) {
                expect(snapshot[event]).toBe(0);
            }
        });
    });

    describe('getRegistrySnapshot', () => {
        it('should return handler counts for all events', () => {
            const handler = async (): Promise<HookResult> => ({ success: true });

            registry.registerHook('SessionStart', handler);
            registry.registerHook('PreToolUse', handler);
            registry.registerHook('PreToolUse', handler);

            const snapshot = registry.getRegistrySnapshot();

            expect(snapshot.SessionStart).toBe(1);
            expect(snapshot.PreToolUse).toBe(2);
            expect(snapshot.PostToolUse).toBe(0);
            expect(Object.keys(snapshot).length).toBe(15);
        });
    });
});

describe('buildHookHandlers', () => {
    const createAgent = (): HookAgentContext => ({
        agent_id: 'agent-123',
        slug: 'test-agent',
        user_id: 'user-456',
        autonomy_level: 'supervised',
        capabilities: {
            tools: ['Read', 'Write', 'Bash'],
        },
    });

    const createTrigger = (overrides?: Partial<HookTriggerContext>): HookTriggerContext => ({
        trigger_type: 'user_message',
        payload: { message: 'test' },
        ...overrides,
    });

    it('should return empty handler map when no custom handlers provided', () => {
        const agent = createAgent();
        const trigger = createTrigger();

        const handlers = buildHookHandlers(agent, trigger);

        expect(Object.keys(handlers).length).toBe(0);
    });

    it('should include provided custom handlers', () => {
        const agent = createAgent();
        const trigger = createTrigger();
        const sessionStartHandler = async (): Promise<HookResult> => ({ success: true });
        const preToolUseHandler = async (): Promise<HookResult> => ({ success: true });

        const handlers = buildHookHandlers(agent, trigger, {
            SessionStart: [sessionStartHandler],
            PreToolUse: [preToolUseHandler],
        });

        expect(handlers.SessionStart).toEqual([sessionStartHandler]);
        expect(handlers.PreToolUse).toEqual([preToolUseHandler]);
    });

    it('should not include team hooks when no team_id in trigger', () => {
        const agent = createAgent();
        const trigger = createTrigger();
        const teammateIdleHandler = async (): Promise<HookResult> => ({ success: true });

        const handlers = buildHookHandlers(agent, trigger, {
            TeammateIdle: [teammateIdleHandler],
        });

        expect(handlers.TeammateIdle).toBeUndefined();
    });

    it('should include team hooks when team_id is present', () => {
        const agent = createAgent();
        const trigger = createTrigger({ team_id: 'team-789' });
        const teammateIdleHandler = async (): Promise<HookResult> => ({ success: true });
        const taskCompletedHandler = async (): Promise<HookResult> => ({ success: true });

        const handlers = buildHookHandlers(agent, trigger, {
            TeammateIdle: [teammateIdleHandler],
            TaskCompleted: [taskCompletedHandler],
        });

        expect(handlers.TeammateIdle).toEqual([teammateIdleHandler]);
        expect(handlers.TaskCompleted).toEqual([taskCompletedHandler]);
    });
});

describe('createRegistryFromMap', () => {
    it('should create registry with handlers from map', () => {
        const handler1 = async (): Promise<HookResult> => ({ success: true });
        const handler2 = async (): Promise<HookResult> => ({ success: false });

        const handlerMap: HookHandlerMap = {
            SessionStart: [handler1],
            PreToolUse: [handler1, handler2],
        };

        const registry = createRegistryFromMap(handlerMap);

        expect(registry.getHandlerCount('SessionStart')).toBe(1);
        expect(registry.getHandlerCount('PreToolUse')).toBe(2);
        expect(registry.getHandlerCount('PostToolUse')).toBe(0);
    });

    it('should create empty registry from empty map', () => {
        const registry = createRegistryFromMap({});

        const snapshot = registry.getRegistrySnapshot();
        for (const event of HOOK_EVENTS) {
            expect(snapshot[event]).toBe(0);
        }
    });
});

describe('validateHookEvent', () => {
    it('should return valid hook event', () => {
        expect(validateHookEvent('SessionStart')).toBe('SessionStart');
        expect(validateHookEvent('PreToolUse')).toBe('PreToolUse');
        expect(validateHookEvent('TeammateIdle')).toBe('TeammateIdle');
    });

    it('should throw for invalid event', () => {
        expect(() => validateHookEvent('NotValid')).toThrow(
            'Invalid hook event: NotValid. Valid events:'
        );
    });
});
