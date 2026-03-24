// Channel CLAUDE.md Template
// Generates project/channel-specific CLAUDE.md content for agent working directories.
// SDK lazy-loads descendant CLAUDE.md files via ancestor walk, so this file auto-loads
// when agent cwd is set to a channel path.
// Reference: xerus-y5v.4.173

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ChannelClaudeMdParams {
    projectName: string;
    projectDescription: string;
    channelName: string;
    channelPurpose: string;
    agentRole: string;
    sharedResources?: string[];
    coordinationMode?: 'sequential' | 'parallel' | 'hierarchical' | 'consensus';
    teamMembers?: Array<{ slug: string; role: string }>;
    channelPriorities?: string[];
}

// -----------------------------------------------------------------------------
// Coordination Mode Descriptions
// -----------------------------------------------------------------------------

const COORDINATION_DESCRIPTIONS: Record<string, string> = {
    sequential:
        'Tasks flow from one agent to the next in order. Wait for upstream agent to complete before starting your part.',
    parallel:
        'All agents work simultaneously on their assigned tasks. Sync at checkpoints via the task board.',
    hierarchical:
        'A lead agent delegates and reviews. Follow the lead agent\'s direction and report back when done.',
    consensus:
        'Decisions require agreement from team members. Propose actions in posts and wait for team alignment before executing.',
};

function describeCoordinationMode(mode: string): string {
    return COORDINATION_DESCRIPTIONS[mode] || COORDINATION_DESCRIPTIONS.sequential;
}

// -----------------------------------------------------------------------------
// Template Generator
// -----------------------------------------------------------------------------

/**
 * Generate channel-specific CLAUDE.md content.
 * Kept concise (< 500 tokens) so it doesn't bloat the SDK context.
 */
export function generateChannelClaudeMd(params: ChannelClaudeMdParams): string {
    const {
        projectName,
        projectDescription,
        channelName,
        channelPurpose,
        agentRole,
        sharedResources,
        coordinationMode,
        teamMembers,
        channelPriorities,
    } = params;

    const sections: string[] = [];

    sections.push(`# #${channelName}`);
    sections.push('');

    if (channelPurpose) {
        sections.push(channelPurpose);
        sections.push('');
    }

    sections.push(`## Project: ${projectName}`);
    sections.push('');
    if (projectDescription) {
        sections.push(projectDescription);
        sections.push('');
    }

    sections.push('## Your Role');
    sections.push('');
    sections.push(agentRole || 'Team member');
    sections.push('');

    sections.push('## Channel Directories');
    sections.push('');
    sections.push('- `.beads/issues.jsonl` -- Task board');
    sections.push('- `output/posts.jsonl` -- Channel posts');
    sections.push('- `output/deliverables/` -- Published files');
    sections.push('- `scratch/` -- Temporary working files');
    sections.push('- `data/` -- Channel data');
    sections.push('');

    if (sharedResources && sharedResources.length > 0) {
        sections.push('## Resources');
        sections.push('');
        for (const resource of sharedResources) {
            sections.push(`- ${resource}`);
        }
        sections.push('');
    }

    if (teamMembers && teamMembers.length > 0) {
        sections.push('## Team');
        sections.push('');
        for (const member of teamMembers) {
            sections.push(`- @${member.slug}: ${member.role}`);
        }
        sections.push('');
    }

    if (coordinationMode) {
        sections.push('## How We Work: ' + coordinationMode);
        sections.push('');
        sections.push(describeCoordinationMode(coordinationMode));
        sections.push('');
    }

    // Standup Protocol - always included
    sections.push('## Standup Protocol');
    sections.push('');
    sections.push('When prompted or at session start:');
    sections.push('1. Read .memory/agents/{your-slug}/working.md');
    sections.push('2. Summarize: completed, planned, blockers');
    sections.push('3. Post to output/posts.jsonl');
    sections.push('');

    if (channelPriorities && channelPriorities.length > 0) {
        sections.push('## Current Priorities');
        sections.push('');
        channelPriorities.forEach((priority, i) => {
            sections.push(`${i + 1}. ${priority}`);
        });
        sections.push('');
    }

    return sections.join('\n');
}
