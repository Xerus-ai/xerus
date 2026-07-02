// Intent Gate — classifies the agent's final message disposition.
// Ported from Kortix continuation engine pattern.

export type IntentDisposition =
    | 'completed'
    | 'executing'
    | 'planning'
    | 'blocked-human'
    | 'blocked-external'
    | 'premature-stop';

const BLOCKED_HUMAN_PATTERNS = [
    /\bwait(?:ing)?\s+(?:for\s+)?(?:your|user|human)\s+(?:input|response|feedback|approval|confirmation)/i,
    /\bplease\s+(?:provide|share|confirm|let\s+me\s+know)/i,
    /\bneed\s+(?:your|user)\s+(?:input|credentials|api.?key|token|password)/i,
    /\bcannot\s+proceed\s+without/i,
    /\brequires?\s+(?:your|manual|human)\s+(?:action|intervention|approval)/i,
];

const BLOCKED_EXTERNAL_PATTERNS = [
    /\bapi\s+(?:key|token|secret)\s+(?:is\s+)?(?:missing|invalid|expired|not\s+(?:set|configured))/i,
    /\bcredentials?\s+(?:are\s+)?(?:missing|invalid|expired)/i,
    /\bauthentication\s+(?:failed|required|error)/i,
    /\brate\s+limit/i,
    /\bservice\s+unavailable/i,
    /\btimeout/i,
];

const COMPLETED_PATTERNS = [
    /\ball\s+(?:tasks?|items?|work)\s+(?:(?:have\s+been|are)\s+)?completed/i,
    /\bsuccessfully\s+(?:completed|finished|implemented|delivered)/i,
    /\beverything\s+(?:is\s+)?(?:done|complete|finished|in\s+place)/i,
    /\bnothing\s+(?:else|more|further)\s+(?:to\s+do|remains?|needed)/i,
];

const PLANNING_PATTERNS = [
    /\bhere(?:'s|\s+is)\s+(?:my|the|a)\s+plan/i,
    /\bi\s+(?:will|would|can|should)\s+(?:start|begin|proceed)\s+(?:by|with)/i,
    /\bsteps?\s+(?:to|for|i(?:'ll| will))\s+(?:take|follow)/i,
    /\blet\s+me\s+(?:outline|plan|think\s+through)/i,
];

export function classifyIntent(finalMessage: string): IntentDisposition {
    const text = finalMessage.slice(-2000);

    for (const pattern of BLOCKED_HUMAN_PATTERNS) {
        if (pattern.test(text)) return 'blocked-human';
    }

    for (const pattern of BLOCKED_EXTERNAL_PATTERNS) {
        if (pattern.test(text)) return 'blocked-external';
    }

    for (const pattern of PLANNING_PATTERNS) {
        if (pattern.test(text)) return 'planning';
    }

    for (const pattern of COMPLETED_PATTERNS) {
        if (pattern.test(text)) return 'completed';
    }

    return 'premature-stop';
}
