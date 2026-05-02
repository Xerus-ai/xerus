// Operating Protocol Template (Layer 2)
// Generates OPERATING.md that teaches agents HOW to operate autonomously.
// Placed at /workspace/agents/{slug}/OPERATING.md
// Kept under 800 tokens to respect context budget.

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

    // Context Gathering
    sections.push('## Context Gathering');
    sections.push('');
    sections.push('1. Read `' + memBase + '/agents/' + params.agentSlug + '/working.md` (last session state)');
    sections.push('2. Read `.beads/issues.jsonl` (task board)');
    sections.push('3. Read `' + memBase + '/agents/' + params.agentSlug + '/expertise.md` (capabilities)');
    if (params.channelSlug) {
        sections.push('4. Read channel CLAUDE.md for mission/priorities');
    }
    sections.push('Use Explore subagent for reading >5 files.');
    sections.push('');

    // Delegation
    sections.push('## Delegation');
    sections.push('');
    sections.push('You have SDK-native subagent types via the Task tool:');
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
    sections.push("1. Search installed skills: `Glob('**/.claude/skills/*/SKILL.md')` (finds both channel and global skills)");
    sections.push('2. If matching skill exists, follow its framework');
    sections.push('');

    // Plan-First Workflow
    sections.push('## Plan-First Workflow');
    sections.push('');
    sections.push('For tasks with >3 steps:');
    sections.push('1. Gather context (Explore subagent)');
    sections.push('2. Create plan');
    sections.push('3. Execute step by step');
    sections.push('4. Verify (general-purpose subagent)');
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

    // Session Start Protocol
    sections.push('## Session Start');
    sections.push('');
    sections.push('1. Read `' + memBase + '/agents/' + params.agentSlug + '/.task-context.md` (your assignment)');
    sections.push('2. If BLOCKED: output blocked message, end session');
    sections.push('3. If READY: execute the task described, nothing else');
    sections.push('4. If IDLE: read HEARTBEAT.md for proactive tasks, then read working.md');
    sections.push('5. Check `agents/' + params.agentSlug + '/inbox/` for coordination messages');
    if (params.channelSlug) {
        sections.push('6. If channel lead: check `.channel/state/handoffs/` for recent handoff from previous shift');
    }
    sections.push('');

    // Channel Lead Duties
    if (params.channelSlug) {
        sections.push('## If Channel Lead');
        sections.push('');
        sections.push('- On first session of the day: TeamCreate with all channel_members');
        sections.push('- Distribute tasks to teammates via TaskCreate');
        sections.push('- Monitor teammate progress via SendMessage');
        sections.push('- Run daily standup: collect updates from each agent, post summary');
        sections.push('');
    }

    // Communication
    sections.push('## Communication');
    sections.push('');
    sections.push('- Post updates to `output/posts.jsonl` in your channel');
    sections.push('- For agent-to-agent: use coordination message with `target_agent` in metadata');
    sections.push('- For escalation: set `metadata.requires_approval: true`');
    if (params.channelSlug && params.domainSlug) {
        sections.push('- For cross-channel: post to target channel\'s `output/posts.jsonl`');
    }
    sections.push('- When blocked: write to `agents/xerus-master/inbox/`');
    sections.push('');

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
