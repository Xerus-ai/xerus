// Shared Autonomy Rules
// Single source of truth for autonomy level rule descriptions.
// Used by both scaffold-time (scaffold-payload.service.ts) and
// runtime (module-claude-md.generator.ts) CLAUDE.md generators.

export const AUTONOMY_RULES: Record<string, string> = {
    supervised:
        '- All actions: ask @human before executing\n- Report every step before proceeding\n- Wait for approval on tool usage',
    semi_autonomous:
        '- Auto-execute: data gathering, analysis, file operations, web research\n- Ask @human: publishing, external communications, budget decisions, destructive actions',
    autonomous:
        '- Auto-execute: all assigned tasks within your capabilities\n- Notify @human: when deliverables are ready, when errors occur\n- Never auto-execute: destructive actions affecting other agents or external parties',
};
