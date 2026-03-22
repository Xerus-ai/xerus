// Hooks Registry
// Manages hook handler registration and builds hook configurations for agent execution

import {
    HookEvent,
    HookHandler,
    BaseHookInput,
    HookTriggerContext,
    HookHandlerMap,
    HookAgentContext,
    HOOK_EVENTS,
    isValidHookEvent,
} from './hooks.types';

// -----------------------------------------------------------------------------
// Hook Registry
// -----------------------------------------------------------------------------

export class HookRegistry {
    private handlers: Map<HookEvent, HookHandler[]> = new Map();

    constructor() {
        // Initialize empty handler arrays for all hook events
        for (const event of HOOK_EVENTS) {
            this.handlers.set(event, []);
        }
    }

    /**
     * Register a handler for a specific hook event
     */
    registerHook<T extends BaseHookInput>(event: HookEvent, handler: HookHandler<T>): void {
        const handlers = this.handlers.get(event);
        if (!handlers) {
            throw new Error(`Invalid hook event: ${event}`);
        }
        handlers.push(handler as HookHandler);
    }

    /**
     * Get all handlers for a specific hook event
     */
    getHandlers(event: HookEvent): HookHandler[] {
        const handlers = this.handlers.get(event);
        if (!handlers) {
            throw new Error(`Invalid hook event: ${event}`);
        }
        return [...handlers];
    }

    /**
     * Check if any handlers are registered for an event
     */
    hasHandlers(event: HookEvent): boolean {
        const handlers = this.handlers.get(event);
        return handlers !== undefined && handlers.length > 0;
    }

    /**
     * Get count of handlers for an event
     */
    getHandlerCount(event: HookEvent): number {
        const handlers = this.handlers.get(event);
        return handlers?.length ?? 0;
    }

    /**
     * Remove all handlers for an event
     */
    clearHandlers(event: HookEvent): void {
        if (!this.handlers.has(event)) {
            throw new Error(`Invalid hook event: ${event}`);
        }
        this.handlers.set(event, []);
    }

    /**
     * Clear all handlers from the registry
     */
    clearAll(): void {
        for (const event of HOOK_EVENTS) {
            this.handlers.set(event, []);
        }
    }

    /**
     * Get a snapshot of all registered events and their handler counts
     */
    getRegistrySnapshot(): Record<HookEvent, number> {
        const snapshot: Partial<Record<HookEvent, number>> = {};
        for (const event of HOOK_EVENTS) {
            const handlers = this.handlers.get(event);
            snapshot[event] = handlers?.length ?? 0;
        }
        return snapshot as Record<HookEvent, number>;
    }
}

// -----------------------------------------------------------------------------
// Hook Handler Builder
// -----------------------------------------------------------------------------

/**
 * Build hook handlers for a specific agent execution.
 * Filters and organizes custom handlers based on agent config and trigger context.
 * Team hooks (TeammateIdle, TaskCompleted) are only included when trigger has team_id.
 */
export function buildHookHandlers(
    _agent: HookAgentContext,
    trigger: HookTriggerContext,
    customHandlers?: Partial<HookHandlerMap>,
): HookHandlerMap {
    if (!customHandlers) return {};

    const handlers: HookHandlerMap = {};

    for (const event of HOOK_EVENTS) {
        const eventHandlers = customHandlers[event];
        if (!eventHandlers) continue;

        // Skip team hooks when not in a team
        if ((event === 'TeammateIdle' || event === 'TaskCompleted') && !trigger.team_id) {
            continue;
        }

        (handlers as Record<string, unknown>)[event] = eventHandlers;
    }

    return handlers;
}

/**
 * Create a fresh registry with handlers from a handler map
 */
export function createRegistryFromMap(handlerMap: HookHandlerMap): HookRegistry {
    const registry = new HookRegistry();

    for (const event of HOOK_EVENTS) {
        const handlers = handlerMap[event] as HookHandler[] | undefined;
        if (handlers) {
            for (const handler of handlers) {
                registry.registerHook(event, handler);
            }
        }
    }

    return registry;
}

/**
 * Validate that a hook event string is valid
 */
export function validateHookEvent(event: string): HookEvent {
    if (!isValidHookEvent(event)) {
        throw new Error(`Invalid hook event: ${event}. Valid events: ${HOOK_EVENTS.join(', ')}`);
    }
    return event;
}
