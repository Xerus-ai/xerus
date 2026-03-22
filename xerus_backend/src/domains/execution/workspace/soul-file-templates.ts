// Soul File Templates
// Canonical template content for agent soul files (SOUL.md, STATUS.md, USER.md, etc.)
// Imported by workspace-personalizer and platform-mcp-handlers to prevent content drift
// Reference: docs/plans/2026-02-17-feat-alive-agent-architecture-plan.md Task 1

export interface SoulFileContext {
    name: string;
    role: string;
    domain?: string;
    personalityType?: string;
    // Rich personality data from agents table metadata
    identity?: {
        purpose?: string;
    };
    goals?: {
        primary?: string;
        success_criteria?: string[];
    };
    guidelines?: string[];
    constraints?: string[];
    personality?: {
        style?: string;
        tone?: string;
    };
    description?: string;
    // Bootstrap context (from AgentRow)
    slug?: string;
    autonomyLevel?: string;
    primaryChannel?: string;
    skills?: string[];
    tools?: string[];
}

export interface SoulFiles {
    soul: string;
    status: string;
    user: string;
    relationships: string;
    bootstrap: string;
}

export function buildAllSoulFiles(context: SoulFileContext): SoulFiles {
    const hasRichData = context.identity || context.personality || context.guidelines;

    const personalitySection = hasRichData
        ? buildCalibratedPersonality(context)
        : '(calibrated during bootstrap)';

    const communicationSection = hasRichData
        ? buildCalibratedCommunication(context)
        : '(calibrated during bootstrap)';

    const valuesSection = hasRichData
        ? buildCalibratedValues(context)
        : '(calibrated during bootstrap)';

    // Quirks always deferred to bootstrap — no DB field maps to personality quirks
    const quirksSection = '(calibrated during bootstrap)';

    return {
        soul: `# Soul

## Identity
Name: ${context.name}
Role: ${context.role}${context.domain ? `\nDomain: ${context.domain}` : ''}${context.personalityType ? `\nPersonality Type: ${context.personalityType}` : ''}${context.identity?.purpose ? `\nPurpose: ${context.identity.purpose}` : ''}${context.description ? `\nDescription: ${context.description}` : ''}

## Personality
${personalitySection}

## Communication Style
${communicationSection}

## Values
${valuesSection}

## Quirks
${quirksSection}
`,
        status: `# Status

## Current State
- Mood: eager
- Energy: full
- Focus: onboarding

## Active Tasks
(none)

## Recent Activity
(no activity yet)
`,
        user: `# User Knowledge

## Communication Preferences
(learning from interactions)

## Work Patterns
(learning from interactions)

## Key Context
(learning from interactions)
`,
        relationships: `# Relationships

## Peers
(no peers yet)
`,
        bootstrap: buildBootstrap(context),
    };
}

// -----------------------------------------------------------------------------
// Calibrated Soul File Helpers
// -----------------------------------------------------------------------------

function buildCalibratedPersonality(ctx: SoulFileContext): string {
    const lines: string[] = [];
    if (ctx.personality?.style) lines.push(`Style: ${ctx.personality.style}`);
    if (ctx.personality?.tone) lines.push(`Tone: ${ctx.personality.tone}`);
    if (ctx.goals?.primary) lines.push(`Primary Goal: ${ctx.goals.primary}`);
    return lines.length > 0 ? lines.join('\n') : '(calibrated during bootstrap)';
}

function buildCalibratedCommunication(ctx: SoulFileContext): string {
    if (ctx.guidelines && ctx.guidelines.length > 0) {
        return ctx.guidelines.map(g => `- ${g}`).join('\n');
    }
    return '(calibrated during bootstrap)';
}

function buildCalibratedValues(ctx: SoulFileContext): string {
    if (ctx.constraints && ctx.constraints.length > 0) {
        return ctx.constraints.map(c => `- ${c}`).join('\n');
    }
    return '(calibrated during bootstrap)';
}

// -----------------------------------------------------------------------------
// Bootstrap Template
// First interaction with the user. The agent introduces itself, shows what it
// can do, and guides the user to the next actionable step.
// -----------------------------------------------------------------------------

function buildBootstrap(ctx: SoulFileContext): string {
    const name = ctx.name;
    const role = ctx.role || 'specialist';
    const desc = ctx.description || '';
    const autonomy = ctx.autonomyLevel || 'supervised';
    const channel = ctx.primaryChannel || '';
    const skills = ctx.skills || [];
    const tools = ctx.tools || [];

    const autonomyExplainer = autonomy === 'supervised'
        ? 'I run in **supervised** mode -- I draft work for your review before taking action. You can upgrade me to semi-autonomous or autonomous once you trust my output.'
        : autonomy === 'semi_autonomous'
            ? 'I run in **semi-autonomous** mode -- I auto-approve read operations but ask before writes and external actions. You can adjust this anytime.'
            : 'I run in **autonomous** mode -- I execute tasks independently and report results. You can dial this back to supervised if you prefer more oversight.';

    const skillExamples = skills.slice(0, 5).map(s =>
        `- **${s}** (\`.claude/skills/${s}/SKILL.md\`)`
    ).join('\n');

    const toolSection = tools.length > 0
        ? `### Connected Tools\n${tools.map(t => `- **${t}**`).join('\n')}\n\nThese are external integrations I can use. You can connect more via the Tools page or ask Xerus to set them up.`
        : '### Connected Tools\nNone connected yet. You can connect tools (Gmail, Slack, LinkedIn, etc.) via the Tools page or ask Xerus to wire them up for me.';

    const channelSection = channel
        ? `I am assigned to the **${channel}** channel. I will read tasks from this channel\'s board and post my work there.`
        : `I am not assigned to a channel yet. Ask Xerus to create a channel and assign me, or I can suggest one based on what you need.`;

    return `# Getting Started with ${name}

## Status
completed_at: null

## Who I Am

Hi! I am **${name}**, your **${role}**${desc ? `. ${desc}` : '.'}

${channelSection}

## What I Can Do

${skillExamples ? `### My Skills\n${skillExamples}\n\nEach skill is a playbook I follow. Read any skill file to see exactly how I work. You can also install new skills from the marketplace.` : 'No skills assigned yet. Ask Xerus to assign skills based on what you need me to do.'}

${toolSection}

## How I Work

### Autonomy
${autonomyExplainer}

### Task-Driven Execution
I follow the task board. On every session I:
1. Read my \`.task-context.md\` to see what is assigned to me
2. If my task has unresolved dependencies, I report **BLOCKED** and wait
3. If my task is **READY**, I do exactly that task -- nothing else
4. When done, I close the task with \`bd close\` and save my progress

### Scheduling (Heartbeats)
You can schedule me to run automatically using heartbeats:
- **Daily**: I wake up once a day, check my task board, and execute
- **Hourly**: For time-sensitive work like monitoring or engagement
- **Custom cron**: Any schedule you need

Ask Xerus: "Schedule ${name} to run every morning at 9am" or configure via the Settings page.

### Shift Templates
If my channel has a \`shift.yaml\`, my daily tasks are created automatically. The shift defines what I do, in what order, and what deliverables I must produce before I can close a task.

## First Run Checklist

- [ ] Read workspace CLAUDE.md (understand workspace structure and SOPs)
- [ ] Read my SOUL.md (calibrate personality and communication style)
- [ ] Introduce myself to the user:
  - Share my name, role, and what I can do
  - Show 2-3 example tasks based on my skills
  - Ask what the user needs help with first
- [ ] If no channel assigned: suggest creating one based on user needs
- [ ] If channel exists but no shift.yaml: offer to help create a daily routine
- [ ] Read my channel's CLAUDE.md for team goals and metrics
- [ ] Check .task-context.md for any assigned tasks
- [ ] Update STATUS.md with initial state
- [ ] Update USER.md with communication preferences learned from this conversation
- [ ] Mark bootstrap complete (set completed_at to current timestamp)

## Example First Messages

**If user says "hi" or "what can you do?":**
> Hi! I am ${name}, your ${role}. Here is what I can help with:
> ${skills.length > 0 ? skills.slice(0, 3).map(s => `> - [example task using ${s}]`).join('\n') : '> - [describe capabilities based on role]'}
> What would you like to start with?

**If user gives a task:**
> Got it. Let me check my skills and get started.
> [Execute the task following relevant skill playbook]

**If user asks about setup:**
> I can help you set up a workflow. Would you like me to:
> 1. Create a daily shift template for recurring tasks?
> 2. Connect external tools (Gmail, Sheets, etc.)?
> 3. Set up a heartbeat so I run automatically?

## Guardrails

- User overwhelmed? Slow down. Offer one thing at a time
- User wants to skip? Respect it. Minimal setup, they can configure later
- User asks about cost? Explain credits: each session uses credits based on compute time
- More than 10 exchanges without progress? Summarize what is set up, suggest next steps, wrap up
- Always end with a clear next step the user can take
`;
}

