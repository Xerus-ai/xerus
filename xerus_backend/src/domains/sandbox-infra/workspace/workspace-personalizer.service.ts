// Workspace Personalizer
// Writes dynamic, user-specific content on top of the cloned xerus-workspace template.
// The template repo (git clone) provides all static files: CLAUDE.md, settings.json,
// hooks, skills, agent soul files, shared resources, marketplace catalog.
// This service only generates content that requires runtime values (userId, session state).
// Idempotent: safe to re-run on existing workspace.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 5, Section 14

import { WorkspaceManager, SandboxFileSystem } from './workspace.manager';
import { WORKSPACE_DIRECTORIES } from './workspace.types';
const XERUS_MASTER_SLUG = 'xerus-master';
const XERUS_CTO_SLUG = 'xerus-cto';
import { PLATFORM_HOOKS, PLATFORM_PERMISSIONS } from './platform-settings';

export interface WorkspacePersonalizeOptions {
    userId: string;
}

export interface WorkspacePersonalizeResult {
    success: boolean;
    alreadyInitialized: boolean;
    createdFiles: string[];
}

/**
 * Write dynamic content after git clone of xerus-workspace template.
 * Five things require runtime generation:
 *   1. Merge XERUS_USER_ID + XERUS_WORKSPACE_ROOT into .claude/settings.json
 *   2. Inject BROWSER_DATA_DIR and BROWSER_STATE_DIR (derived from workspace root)
 *   3. Seed .memory/agents/{main-agents}/ working.md and expertise.md (session state)
 *   4. Create data/company.db placeholder (real init by SessionStart hook)
 *   5. Seed drive/ starter files (company.md, welcome.md) if missing
 * Everything else comes from the template clone.
 * Idempotent: each step checks before writing.
 */
export async function personalizeWorkspace(
    sandboxFs: SandboxFileSystem,
    options: WorkspacePersonalizeOptions,
    basePath?: string,
): Promise<WorkspacePersonalizeResult> {
    const manager = new WorkspaceManager(sandboxFs, basePath);
    const createdFiles: string[] = [];

    // Detect whether clone already ran (agents dir exists = cloned)
    const info = await manager.getWorkspaceInfo();
    const alreadyInitialized = info.initialized;

    // 1. Merge provider-specific and user-specific env vars into .claude/settings.json
    // Template has path-independent env vars; workspace root + user ID injected at scaffold time
    const settingsPath = `${manager.getBasePath()}/${WORKSPACE_DIRECTORIES.claudeSettings}`;
    if (await sandboxFs.exists(settingsPath)) {
        const raw = await sandboxFs.readFile(settingsPath);
        let existing: { env?: Record<string, string> };
        try {
            existing = JSON.parse(raw) as { env?: Record<string, string> };
        } catch (err) {
            throw new Error(`Failed to parse ${settingsPath}: ${(err as Error).message}`);
        }
        const workspaceRoot = manager.getBasePath();
        existing.env = {
            ...existing.env,
            XERUS_USER_ID: options.userId,
            XERUS_WORKSPACE_ROOT: workspaceRoot,
            BROWSER_DATA_DIR: `${workspaceRoot}/.browser/chromium-data`,
            BROWSER_STATE_DIR: `${workspaceRoot}/.browser/state`,
        };
        // Ensure platform-defined hooks and permissions survive S3 snapshot restore.
        // Old snapshots may have settings.json without hooks (created before hooks were added).
        const full = existing as Record<string, unknown>;
        if (!full.hooks) full.hooks = PLATFORM_HOOKS;
        if (!full.permissions) full.permissions = PLATFORM_PERMISSIONS;
        await sandboxFs.writeFile(settingsPath, JSON.stringify(full, null, 2));
    }

    // 2. Seed main agent memory files (session state, not version-controlled in template)
    for (const agentSlug of [XERUS_MASTER_SLUG, XERUS_CTO_SLUG]) {
        const memoryDir = manager.getAgentMemoryPath(agentSlug);
        await sandboxFs.mkdir(memoryDir);

        const workingMdPath = `${memoryDir}/working.md`;
        if (!(await sandboxFs.exists(workingMdPath))) {
            await sandboxFs.writeFile(workingMdPath, `# Working Context\n\n(session not started)\n`);
            createdFiles.push(workingMdPath);
        }

        const expertiseMdPath = `${memoryDir}/expertise.md`;
        if (!(await sandboxFs.exists(expertiseMdPath))) {
            await sandboxFs.writeFile(expertiseMdPath, `# Expertise\n\nCapabilities and knowledge developed through work.\n`);
            createdFiles.push(expertiseMdPath);
        }
    }

    // 3. Create data/company.db placeholder (SessionStart hook performs real SQLite init)
    const dataDir = `${manager.getBasePath()}/data`;
    await sandboxFs.mkdir(dataDir);
    const companyDbPath = `${dataDir}/company.db`;
    if (!(await sandboxFs.exists(companyDbPath))) {
        await sandboxFs.writeFile(companyDbPath, '');
        createdFiles.push(companyDbPath);
    }

    // 4. Seed drive/ starter files (company.md, welcome.md)
    // These are template seed content — created once so agents have company context.
    // Never overwritten: once the user edits them, their version is the source of truth.
    const driveDir = `${manager.getBasePath()}/drive`;
    await sandboxFs.mkdir(driveDir);
    for (const [fileName, content] of Object.entries(DRIVE_SEED_FILES)) {
        const filePath = `${driveDir}/${fileName}`;
        if (!(await sandboxFs.exists(filePath))) {
            await sandboxFs.writeFile(filePath, content);
            createdFiles.push(filePath);
        }
    }

    return {
        success: true,
        alreadyInitialized,
        createdFiles,
    };
}

const DRIVE_SEED_FILES: Record<string, string> = {
    'company.md': `# Company

## Vision
<!-- What does the world look like if you succeed? -->
{TODO: Your long-term vision. Example: "Every solo founder has an AI workforce that handles operations while they focus on what matters."}

## Mission
<!-- What are you doing right now to get there? -->
{TODO: Your current mission. Example: "Build the best AI virtual office for small teams."}

## Values
<!-- What principles guide decisions when there's no playbook? -->
{TODO: 3-5 core values. These are for your agents too — they shape how your AI workforce behaves.}

## North Star Metric
<!-- The ONE number that tells you if the company is winning. -->
{TODO: Example: "Weekly active workspaces" or "Revenue per user" or "Tasks completed by agents"}

## Who We Serve
<!-- Your ideal customer. Be specific. -->
{TODO: See drive/target-audience.md for detailed profiles.}

## What We Build
<!-- Product summary. -->
{TODO: See drive/xerus-product-brief.md for full brief.}

## Current Stage
<!-- Where are you right now? -->
{TODO: Example: "Pre-launch. Building product, growing waitlist, proving the model."}

## Current Goals (Company-Wide)
<!-- Top 3-5 goals this quarter. Projects and channels derive their goals from these. -->
{TODO: Example:
1. Launch MVP to 100 early adopters
2. Prove AI workforce can run marketing autonomously
3. Achieve $1K MRR from credits
}

---

*This file is the source of truth for company identity. All projects, channels, and agents should align their work to these goals. Updated by Xerus (CEO) or the user.*
`,

    'welcome.md': `# Welcome to Xerus

This is your drive. Everything in here belongs to you — documents, notes, research, briefs, whatever your agents need to know about your world.

## The idea in one line

**You build a workforce of AI agents. This drive is what they read to understand you.**

---

## Getting started in four moves

### 1. Put your stuff here

Drag files in, or hit Upload in the toolbar. Markdown, PDFs, docs, CSVs — if it's a document, it lives here.

The \`company.md\` starter already in your drive is a template. Fill it in and your agents will know your vision, your values, and what you're building. Delete it if it's not useful.

### 2. Connect a file to an agent

Click any file to open it, then hit **+ Add property → Connection → pick an agent**. That agent can now reference the file whenever it works.

The same thing works from \`/ai-agents/<agent>\` — the Knowledge Base card there shows every drive file connected to that agent, and lets you connect more.

Both places read from the same source. Whatever you see in one, you see in the other.

### 3. Hire an agent

Go to \`/ai-agents\`. Browse templates in the marketplace, clone one you like, and tweak its personality, tools, and knowledge. Or create one from scratch.

Each agent has five things you shape:
- **Identity** — who they are and what they know
- **Behaviour** — how they think and act
- **Schedules** — when they run without you
- **History** — what they've done
- **Memory** — what they've learned

### 4. Put them to work

Chat with an agent directly, drop a task in their inbox, or give them a cron schedule. They'll read the files you connected, do the work, and remember the outcome.

---

## A few things worth knowing

- **Memory is automatic.** Agents remember past sessions, facts about you, and workflows that worked. You don't manage it — they do.
- **Schedules are real.** An agent with a schedule runs in a sandbox on your behalf, on its own, on the cadence you set.
- **Projects group work.** When you have multiple agents on a shared goal, put them in a project channel so they share context.
- **This drive is yours.** Nothing here is shared with anyone unless you put it there. Your agents read it. No one else does.

---

## What to do next

Open \`company.md\` and spend five minutes writing your vision, values, and what you're building. It's the single most useful thing you can do — it's the first file most agents read on wake, and it's what grounds everything they do.

When you're ready, delete this file. You won't need it again.
`,
};
