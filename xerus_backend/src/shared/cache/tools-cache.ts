import NodeCache from 'node-cache';
import type { PipedreamAction } from '../../domains/tools/types';

/** Cached Pipedream trigger (same shape as PipedreamAction) */
export type PipedreamTrigger = PipedreamAction;

class ToolsCache {
    private cache: NodeCache;

    constructor() {
        this.cache = new NodeCache({
            stdTTL: 3600,
            checkperiod: 600,
            useClones: false,
        });
    }

    getActions(appSlug: string): PipedreamAction[] | undefined {
        return this.cache.get(`actions:${appSlug}`);
    }

    setActions(appSlug: string, actions: PipedreamAction[]): void {
        this.cache.set(`actions:${appSlug}`, actions);
    }

    getTriggers(appSlug: string): PipedreamTrigger[] | undefined {
        return this.cache.get(`triggers:${appSlug}`);
    }

    setTriggers(appSlug: string, triggers: PipedreamTrigger[]): void {
        this.cache.set(`triggers:${appSlug}`, triggers);
    }

    clear(): void {
        this.cache.flushAll();
    }

    getStats() {
        return this.cache.getStats();
    }
}

export const toolsCache = new ToolsCache();
