// Execution domain utilities
// NOTE: ThinkingLevel, AutonomyLevel, THINKING_TOKENS, COT_PROMPTS, PERMISSION_MAP
// are exported from ../types.ts (canonical source). Only export functions and unique types here.

export {
    isClaudeModel,
    resolvePermissionMode,
    resolveThinkingConfig,
} from './thinking';

export type {
    PermissionMode,
    ThinkingConfig,
} from './thinking';
