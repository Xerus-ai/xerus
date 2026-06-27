// Operating Protocol Template (Layer 2)
// Generates OPERATING.md that teaches agents HOW to operate autonomously.
// Placed at /workspace/agents/{slug}/OPERATING.md
// Kept under 800 tokens to respect context budget.
// NOTE: working.md, expertise.md, agents/index.json, and platform rules
// are already injected into the system prompt by resolveAgentIdentity().
// Do NOT tell agents to re-read them here.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface OperatingMdParams {
    agentSlug: string;
    agentName: string;
    agentType: 'proactive' | 'reactive';
    autonomyLevel: string;
    hasHeartbeat: boolean;
    channelSlug?: string;
    domainSlug?: string;
    memoryBasePath?: string;
}

// -----------------------------------------------------------------------------
// Behavior Mode Descriptions
// -----------------------------------------------------------------------------

function buildBehaviorSection(params: OperatingMdParams): string {
    if (params.agentType === 'proactive') {
        return [
            '## Behavior Mode: Proactive',
            '',
            'You operate on a heartbeat schedule. Each tick:',
            '1. Check for new tasks and messages',
            '2. Continue in-progress work',
            '3. Report status and findings',
            '',
            'Between ticks, your state persists in working memory.',
        ].join('\n');
    }

    return [
        '## Behavior Mode: Reactive',
        '',
        'You activate when prompted by a user or another agent.',
        'Focus on the immediate request, complete it, then save state.',
    ].join('\n');
}

// -----------------------------------------------------------------------------
// Generator
// -----------------------------------------------------------------------------

export function generateOperatingMd(params: OperatingMdParams): string {
    const memBase = params.memoryBasePath || '.memory';
    const sections: string[] = [];

    sections.push('# Operating Protocol');
    sections.push('');
    sections.push(buildBehaviorSection(params));
    sections.push('');

    // Session Start Protocol
    sections.push('## Session Start');
    sections.push('');
    sections.push('Your working memory, expertise, team roster, and platform rules are already in your system prompt.');
    sections.push('Do NOT re-read working.md, expertise.md, or agents/index.json — they are already injected.');
    sections.push('');
    sections.push('1. Handle the user\'s message immediately');
    sections.push('2. Read files only when the current task requires them');
    sections.push('3. Check `agents/' + params.agentSlug + '/inbox/` for coordination messages');
    if (params.channelSlug) {
        sections.push('4. If channel lead: check for handoffs in `.channel/state/handoffs/`');
    }
    sections.push('');

    // Delegation
    sections.push('## Delegation');
    sections.push('');
    sections.push('SDK-native subagent types via the Task tool:');
    sections.push('| Type | Purpose |');
    sections.push('|------|---------|');
    sections.push('| Explore | Read-only context gathering |');
    sections.push('| Plan | Create implementation plans |');
    sections.push('| general-purpose | Full capability agent |');
    sections.push('');
    sections.push('Channel teammates are also available as subagent types (by slug).');
    sections.push('');

    // Skills First
    sections.push('## Skills First');
    sections.push('');
    sections.push('Before implementing from scratch:');
    sections.push("1. Search installed skills: `Glob('**/.claude/skills/*/SKILL.md')`");
    sections.push('2. If matching skill exists, follow its framework');
    sections.push('');

    // Output Rules
    sections.push('## Output Rules');
    sections.push('');
    sections.push('Follow the "Platform Rules" section in your system prompt.');
    sections.push('- Tasks → `mcp__platform__create_task` (NEVER beads for team-visible tasks)');
    sections.push('- Activity → automatic (every MCP mutation creates an activity entry)');
    sections.push('- Deliverables → write file to `output/deliverables/`, register via MCP if needed');
    sections.push('- Status updates → `mcp__platform__send_notification`');
    sections.push('- Personal subtasks → beads (only you see these)');
    sections.push('- Notify user → `mcp__platform__send_notification`');
    sections.push('');

    // Memory Efficiency
    sections.push('## Memory Efficiency');
    sections.push('');
    sections.push('- Save progress to `' + memBase + '/agents/' + params.agentSlug + '/working.md` frequently');
    sections.push('- After compaction, re-read working.md to resume');
    sections.push('- Use Explore subagents instead of reading large files yourself');
    sections.push('');

    // Self-Verification
    sections.push('## Self-Verification');
    sections.push('');
    sections.push('After completing any deliverable:');
    sections.push('1. Use general-purpose subagent to review against requirements');
    sections.push('2. Address issues before marking complete');
    sections.push('');

    // Channel Lead Duties
    if (params.channelSlug) {
        sections.push('## If Channel Lead');
        sections.push('');
        sections.push('- Distribute tasks to teammates via TaskCreate');
        sections.push('- Monitor teammate progress via SendMessage');
        sections.push('');
    }

    // Before Session End
    sections.push('## Before Session End');
    sections.push('');
    sections.push('1. Save state to `' + memBase + '/agents/' + params.agentSlug + '/working.md`');
    sections.push('2. Update `agents/' + params.agentSlug + '/STATUS.md` (mood, energy, active focus)');
    if (params.channelSlug) {
        sections.push('3. If shift ending and next-shift agent exists: write handoff to `.channel/state/handoffs/`');
    }

    return sections.join('\n') + '\n';
}
