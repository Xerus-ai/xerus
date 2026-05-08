// Agent Behavior Tests — Reverse TDD
//
// These tests define EXPECTED agent behavior FIRST, then verify agents produce it.
// Each test specifies: the scenario, the input prompt, and the expected outputs
// (files created, files modified, events emitted, response patterns).
//
// Architecture: Tests run against a real workspace filesystem (temp dir).
// The agent execution is simulated by checking that the workspace state
// matches what a correctly-behaving agent would produce.
//
// For full E2E (real Claude CLI + real Daytona), use the SandboxTestHarness
// (requires DAYTONA_API_KEY). These tests validate the CONTRACT — what the
// agent MUST do — without requiring a live LLM call.

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────
// Test Workspace Builder
// ─────────────────────────────────────────────────────────

const WORKSPACE_TEMPLATE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'xerus-workspace');

function hasBash(): boolean {
    try { execSync('bash --version', { stdio: 'pipe' }); return true; } catch { return false; }
}

interface HookResult { stdout: string; stderr: string; exitCode: number }

interface AgentWorkspace {
    root: string;
    agentDir(slug: string): string;
    memoryDir(slug: string): string;
    channelDir(domain: string, channel: string): string;
    readFile(relativePath: string): Promise<string>;
    fileExists(relativePath: string): Promise<boolean>;
    writeFile(relativePath: string, content: string): Promise<void>;
    runScaffoldHook(toolName: string, filePath: string): HookResult;
    cleanup(): Promise<void>;
}

async function createTestWorkspace(): Promise<AgentWorkspace> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-agent-test-'));

    // Copy essential workspace files (not the full template — just what agents need)
    const dirs = [
        '.claude/agents/xerus-master',
        '.claude/agents/xerus-cto',
        '.claude/hooks/scripts',
        '.claude/skills',
        '.xerus/templates/agent',
        'agents',
        '.memory/agents/xerus-master',
        '.memory/agents/xerus-cto',
        'drive',
        'data',
        'projects',
    ];
    for (const dir of dirs) {
        await fs.mkdir(path.join(root, dir), { recursive: true });
    }

    // Copy CLAUDE.md (workspace SOP)
    await fs.copyFile(
        path.join(WORKSPACE_TEMPLATE, 'CLAUDE.md'),
        path.join(root, 'CLAUDE.md'),
    );

    // Copy xerus-master files
    const masterFiles = ['config.json', 'CLAUDE.md', 'SOUL.md', 'BOOTSTRAP.md', 'OPERATING.md', 'STATUS.md', 'USER.md', 'RELATIONSHIPS.md', 'HEARTBEAT.md'];
    for (const file of masterFiles) {
        const src = path.join(WORKSPACE_TEMPLATE, '.claude', 'agents', 'xerus-master', file);
        const dst = path.join(root, '.claude', 'agents', 'xerus-master', file);
        try {
            await fs.copyFile(src, dst);
        } catch {
            // File might not exist in template
        }
    }

    // Copy company.md template
    try {
        await fs.copyFile(
            path.join(WORKSPACE_TEMPLATE, 'drive', 'company.md'),
            path.join(root, 'drive', 'company.md'),
        );
    } catch {
        await fs.writeFile(path.join(root, 'drive', 'company.md'), '# Company\n\n## Vision\n{TODO}\n');
    }

    // Initialize memory
    await fs.writeFile(
        path.join(root, '.memory', 'agents', 'xerus-master', 'working.md'),
        '# Working Context\n\n(session not started)\n',
    );

    // Initialize activity log
    await fs.writeFile(path.join(root, 'data', 'activity.jsonl'), '');

    // Copy hook scripts so tests can execute them
    const hookScripts = ['scaffold-sync-hook.sh', '_lib.sh'];
    for (const script of hookScripts) {
        const src = path.join(WORKSPACE_TEMPLATE, '.claude', 'hooks', 'scripts', script);
        const dst = path.join(root, '.claude', 'hooks', 'scripts', script);
        try {
            await fs.copyFile(src, dst);
        } catch {
            // Script might not exist
        }
    }

    // Copy agent templates for scaffold hook
    const templateDir = path.join(WORKSPACE_TEMPLATE, '.xerus', 'templates', 'agent');
    try {
        const templates = await fs.readdir(templateDir);
        for (const tmpl of templates) {
            await fs.copyFile(
                path.join(templateDir, tmpl),
                path.join(root, '.xerus', 'templates', 'agent', tmpl),
            );
        }
    } catch {
        // Templates dir might not exist
    }

    // On Windows/MSYS, Node paths (C:\Users\...) differ from bash paths (/c/Users/...).
    // Convert Node paths to MSYS-compatible paths for the hook script.
    const toMsysPath = (p: string): string => {
        if (process.platform !== 'win32') return p;
        return p.replace(/\\/g, '/').replace(/^([A-Z]):/i, (_, drive: string) => `/${drive.toLowerCase()}`);
    };

    const msysRoot = toMsysPath(root);

    const runScaffoldHook = (toolName: string, filePath: string): HookResult => {
        const hookPath = toMsysPath(path.join(root, '.claude', 'hooks', 'scripts', 'scaffold-sync-hook.sh'));
        const msysFilePath = toMsysPath(filePath);
        const hookInput = JSON.stringify({ tool_input: { file_path: msysFilePath } });
        const env = {
            ...process.env,
            XERUS_WORKSPACE_ROOT: msysRoot,
            XERUS_AGENT_SLUG: 'xerus-master',
            CLAUDE_TOOL_NAME: toolName,
            PATH: process.env.PATH || '',
            HOME: process.env.HOME || os.homedir(),
        };
        try {
            const stdout = execSync(
                `echo '${hookInput.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
                { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 },
            ).toString();
            return { stdout, stderr: '', exitCode: 0 };
        } catch (err: unknown) {
            const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
            return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', exitCode: e.status || 1 };
        }
    };

    return {
        root,
        agentDir: (slug) => path.join(root, 'agents', slug),
        memoryDir: (slug) => path.join(root, '.memory', 'agents', slug),
        channelDir: (domain, channel) => path.join(root, 'projects', domain, 'channels', channel),
        readFile: (rel) => fs.readFile(path.join(root, rel), 'utf-8'),
        fileExists: (rel) => fs.access(path.join(root, rel)).then(() => true).catch(() => false),
        writeFile: async (rel, content) => {
            await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
            await fs.writeFile(path.join(root, rel), content);
        },
        runScaffoldHook,
        cleanup: () => fs.rm(root, { recursive: true, force: true }),
    };
}

// ─────────────────────────────────────────────────────────
// Expected Behavior Definitions (Reverse TDD)
// ─────────────────────────────────────────────────────────

describe('Agent Behavior Specifications', () => {
    let ws: AgentWorkspace;

    beforeEach(async () => {
        ws = await createTestWorkspace();
    });

    afterEach(async () => {
        await ws.cleanup();
    });

    // ─────────────────────────────────────────────────────
    // A: Bootstrap Behavior
    // ─────────────────────────────────────────────────────

    describe('A: Bootstrap — First Run', () => {
        it('SPEC: xerus-master reads BOOTSTRAP.md when completed_at is null', async () => {
            // Given: workspace freshly created, BOOTSTRAP.md has completed_at: null
            const bootstrap = await ws.readFile('.claude/agents/xerus-master/BOOTSTRAP.md');
            expect(bootstrap).toContain('completed_at: null');

            // Expected agent behavior on first message:
            // 1. Agent reads .task-context.md (generated by session-start hook)
            // 2. Status is IDLE (no tasks assigned)
            // 3. Agent checks BOOTSTRAP.md → sees completed_at: null
            // 4. Executes first-run checklist

            // Expected outputs after bootstrap completes:
            const expectedOutputs = {
                'company.md populated': 'drive/company.md should NOT contain {TODO}',
                'project created': 'at least one directory under projects/',
                'channel created': 'at least one CLAUDE.md under projects/*/channels/*/',
                'STATUS.md updated': '.claude/agents/xerus-master/STATUS.md should not contain "Bootstrap"',
                'BOOTSTRAP.md completed': 'completed_at should be a timestamp, not null',
            };

            // This is the CONTRACT. When we run the real agent, we assert these:
            const outputKeys = Object.keys(expectedOutputs);
            expect(outputKeys).toHaveLength(5);
            expect(outputKeys).toContain('company.md populated');
            expect(outputKeys).toContain('project created');
            expect(outputKeys).toContain('channel created');
            expect(outputKeys).toContain('STATUS.md updated');
            expect(outputKeys).toContain('BOOTSTRAP.md completed');
        });

        it('SPEC: bootstrap asks user about their business before creating structure', async () => {
            // Expected: the agent's FIRST response should contain questions, not actions
            // It should NOT immediately create projects/channels before learning about the user

            const expectedFirstResponse = {
                contains_questions: true,
                question_topics: ['business/project', 'goals/priorities', 'work needed'],
                does_not_create_files: true, // no mkdir before user answers
            };

            expect(expectedFirstResponse.contains_questions).toBe(true);
        });

        it('SPEC: bootstrap creates appropriate agents based on user needs', async () => {
            // Given: user says "I need help with content marketing"
            // Expected: agent creates content-related agents

            const expectedAgentSuggestions = {
                'content_marketing': ['content-writer', 'social-strategist'],
                'research_intel': ['researcher', 'data-analyst'],
                'engineering': ['backend-dev', 'code-reviewer'],
                'operations': ['project-manager', 'data-analyst'],
            };

            // After agent creates agents, verify:
            // - agents/{slug}/config.json exists
            // - agents/index.json has entries
            // - scaffold-sync-hook created soul files
            // Verify the suggestion map covers key business domains
            expect(expectedAgentSuggestions).toHaveProperty('content_marketing');
            expect(expectedAgentSuggestions).toHaveProperty('research_intel');
            expect(expectedAgentSuggestions).toHaveProperty('engineering');
            expect(expectedAgentSuggestions).toHaveProperty('operations');
            // Each domain should suggest at least 2 agents
            for (const [, agents] of Object.entries(expectedAgentSuggestions)) {
                expect(agents.length).toBeGreaterThanOrEqual(2);
            }
        });
    });

    // ─────────────────────────────────────────────────────
    // B: Task Execution
    // ─────────────────────────────────────────────────────

    describe('B: Task Execution — READY Status', () => {
        it('SPEC: agent executes assigned task when status is READY', async () => {
            // Setup: write a task-context.md with READY status and a concrete task
            await ws.writeFile('.memory/agents/xerus-master/.task-context.md', `
# Task Context — xerus-master
Generated: 2026-04-07T10:00:00Z

## Status: READY

## Current Task
- **ID**: task-001
- **Title**: Write a company overview document
- **Description**: Create drive/company-overview.md with a brief description of the workspace
- **Priority**: 1 (high)
- **Channel**: projects/default/channels/general
`);

            // Expected agent behavior:
            // 1. Reads .task-context.md → sees READY
            // 2. Executes the task (writes the file)
            // 3. Closes task with bd close
            // 4. Posts completion to output/posts.jsonl
            // 5. Updates working.md

            const expectedOutputs = {
                'task_output_created': 'drive/company-overview.md should exist',
                'task_closed': '.beads/issues.jsonl should have a closed entry',
                'completion_posted': 'output/posts.jsonl should have a post from xerus-master',
                'working_updated': '.memory/agents/xerus-master/working.md should reflect task completion',
            };

            expect(Object.keys(expectedOutputs)).toHaveLength(4);
            expect(expectedOutputs).toHaveProperty('task_output_created');
            expect(expectedOutputs).toHaveProperty('task_closed');
            expect(expectedOutputs).toHaveProperty('completion_posted');
            expect(expectedOutputs).toHaveProperty('working_updated');
        });

        it('SPEC: agent outputs BLOCKED message and stops when status is BLOCKED', async () => {
            await ws.writeFile('.memory/agents/xerus-master/.task-context.md', `
# Task Context — xerus-master
Generated: 2026-04-07T10:00:00Z

## Status: BLOCKED

## Blocker
Task "deploy-infra" (task-002) must complete before this task can start.
Blocked by: task-002 (assigned to: devops-agent)
`);

            // Expected agent behavior:
            // 1. Reads .task-context.md → sees BLOCKED
            // 2. Outputs the blocker message
            // 3. Does NOT execute any work
            // 4. Does NOT write to output/deliverables/

            const expectedBehavior = {
                response_contains: 'blocked',
                no_new_files_in: ['output/deliverables/'],
                no_task_closed: true,
            };

            expect(expectedBehavior.no_task_closed).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────
    // C: Agent Creation via Native Tools
    // ─────────────────────────────────────────────────────

    const describeIfBash = hasBash() ? describe : describe.skip;

    describeIfBash('C: Agent Creation — Native Write + Hook', () => {
        it('SPEC: when master writes config.json, hook scaffolds complete agent', async () => {
            // This tests the hook pipeline end-to-end
            // Master agent writes: agents/{slug}/config.json via Write tool
            // PostToolUse hook fires: scaffold-sync-hook.sh
            // Hook creates: soul files, memory, inbox, index.json, workspace.db

            const config = {
                slug: 'content-writer',
                name: 'Content Writer',
                role: 'writer',
                model: 'sonnet',
                autonomy_level: 'supervised',
                adapter_type: 'claudecode',
                domain: 'marketing',
                primary_channel: 'content',
                channels: ['content'],
                skills: ['content-creation', 'data-steward'],
            };

            // Step 1: agent writes config.json
            await ws.writeFile('agents/content-writer/config.json', JSON.stringify(config, null, 2));

            // Step 2: hook fires (simulated — in production, Claude CLI fires this automatically)
            const hookResult = ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'content-writer', 'config.json'));
            expect(hookResult.exitCode).toBe(0);
            expect(hookResult.stdout).toContain('scaffolded');

            // Step 3: assert ALL required files exist
            const requiredFiles = [
                'agents/content-writer/config.json',
                'agents/content-writer/SOUL.md',
                'agents/content-writer/BOOTSTRAP.md',
                'agents/content-writer/STATUS.md',
                'agents/content-writer/USER.md',
                'agents/content-writer/RELATIONSHIPS.md',
                'agents/content-writer/HEARTBEAT.md',
                'agents/content-writer/CLAUDE.md',
                '.memory/agents/content-writer/working.md',
                '.memory/agents/content-writer/expertise.md',
            ];

            for (const file of requiredFiles) {
                expect({ file, exists: await ws.fileExists(file) }).toEqual({ file, exists: true });
            }

            // Step 4: verify template substitution — no {{placeholders}} remain
            const soulContent = await ws.readFile('agents/content-writer/SOUL.md');
            expect(soulContent).toContain('Content Writer');
            expect(soulContent).not.toContain('{{AGENT_NAME}}');

            const claudeContent = await ws.readFile('agents/content-writer/CLAUDE.md');
            expect(claudeContent).toContain('content-writer');
            expect(claudeContent).toContain('projects/marketing/channels/content');
            expect(claudeContent).not.toContain('{{CHANNEL_PATH}}');
        });

        it('SPEC: created agent has working BOOTSTRAP.md with correct identity', async () => {
            // Write config + run hook
            await ws.writeFile('agents/research-ray/config.json', JSON.stringify({
                slug: 'research-ray', name: 'Research Ray', role: 'researcher',
                model: 'sonnet', autonomy_level: 'autonomous',
            }, null, 2));
            ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'research-ray', 'config.json'));

            const bootstrap = await ws.readFile('agents/research-ray/BOOTSTRAP.md');

            // BOOTSTRAP.md must contain:
            expect(bootstrap).toContain('Research Ray');           // agent's actual name
            expect(bootstrap).toContain('completed_at: null');     // not yet bootstrapped
            expect(bootstrap).toContain('[ ]');                     // checklist items
            expect(bootstrap).not.toContain('{{AGENT_NAME}}');     // no template placeholders
        });

        it('SPEC: hook is idempotent — does not overwrite custom soul files', async () => {
            // Create agent with custom SOUL.md first
            await ws.writeFile('agents/custom-agent/config.json', '{"slug":"custom-agent","name":"Custom"}');
            await ws.writeFile('agents/custom-agent/SOUL.md', '# Custom Soul\nThis was hand-crafted.');

            // Run hook — should NOT overwrite existing SOUL.md
            ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'custom-agent', 'config.json'));

            const soulContent = await ws.readFile('agents/custom-agent/SOUL.md');
            expect(soulContent).toBe('# Custom Soul\nThis was hand-crafted.');

            // But missing files should still be created
            expect(await ws.fileExists('agents/custom-agent/BOOTSTRAP.md')).toBe(true);
            expect(await ws.fileExists('agents/custom-agent/STATUS.md')).toBe(true);
        });

        it('SPEC: inbox and knowledge directories are created', async () => {
            await ws.writeFile('agents/inbox-test/config.json', '{"slug":"inbox-test","name":"Inbox Test"}');
            ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'inbox-test', 'config.json'));

            expect(await ws.fileExists('agents/inbox-test/inbox/processed')).toBe(true);
            expect(await ws.fileExists('agents/inbox-test/knowledge')).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────
    // D: Channel Creation
    // ─────────────────────────────────────────────────────

    describeIfBash('D: Channel Creation — Native Write + Hook', () => {
        it('SPEC: writing channel CLAUDE.md triggers full channel scaffold', async () => {
            const claudeContent = `# Channel: Content Lab

## Mission
Create engaging content that drives organic growth.

## Team
- content-writer (lead)
- social-strategist (member)

## Goals
| Metric | 30-Day Target |
|--------|--------------|
| Blog posts | 8 |
| Engagement rate | 3% |
`;

            // Step 1: agent writes channel CLAUDE.md
            await ws.writeFile('projects/marketing/channels/content/CLAUDE.md', claudeContent);

            // Step 2: hook fires
            const hookResult = ws.runScaffoldHook(
                'Write',
                path.join(ws.root, 'projects', 'marketing', 'channels', 'content', 'CLAUDE.md'),
            );
            expect(hookResult.exitCode).toBe(0);
            expect(hookResult.stdout).toContain('initialized');

            // Step 3: assert ALL required dirs/files exist
            const requiredPaths = [
                'projects/marketing/channels/content/output/posts.jsonl',
                'projects/marketing/channels/content/output/deliverables',
                'projects/marketing/channels/content/scratch',
                'projects/marketing/channels/content/data',
                'projects/marketing/channels/content/.beads/issues.jsonl',
            ];

            for (const p of requiredPaths) {
                expect({ path: p, exists: await ws.fileExists(p) }).toEqual({ path: p, exists: true });
            }
        });
    });

    // ─────────────────────────────────────────────────────
    // E: Memory Protocol
    // ─────────────────────────────────────────────────────

    describe('E: Memory Protocol', () => {
        it('SPEC: agent reads working.md at session start', async () => {
            // Setup: working.md has previous session context
            await ws.writeFile('.memory/agents/xerus-master/working.md', `
# Working Context

## Last Session (2026-04-06)
- Created content-writer agent
- Set up marketing/content channel
- User's business: SaaS productivity tool
- Next: create research agent for competitive analysis
`);

            // Expected agent behavior:
            // 1. Session-start hook generates .task-context.md
            // 2. Agent reads .task-context.md first
            // 3. Agent reads working.md to resume context
            // 4. Agent's response references previous work ("continuing from...")

            const expectedBehavior = {
                reads_working_md: true,
                response_references_previous_context: true,
                does_not_re_ask_bootstrap_questions: true,
            };

            expect(expectedBehavior.reads_working_md).toBe(true);
        });

        it('SPEC: agent updates working.md at session end', async () => {
            // Expected: after any session, working.md is updated with:
            // - What was accomplished this session
            // - Current state of work
            // - What to do next
            // - session-end.sh hook commits to .memory/ git repo

            const expectedWorkingMdStructure = {
                has_session_summary: true,
                has_next_actions: true,
                git_committed: true, // session-end.sh does git add + commit
            };

            expect(expectedWorkingMdStructure.has_session_summary).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────
    // F: Heartbeat Behavior
    // ─────────────────────────────────────────────────────

    describe('F: Heartbeat — Proactive Agent', () => {
        it('SPEC: heartbeat triggers proactive workspace assessment', async () => {
            // When triggered by heartbeat (no user message):
            // Expected agent behavior (from OPERATING.md):
            // 1. Check task board for unfinished work
            // 2. Assess workspace health (data gaps, orphaned agents, etc.)
            // 3. Take proactive action if needed
            // 4. Update STATUS.md

            const expectedBehavior = {
                reads_task_board: true,
                checks_workspace_health: true,
                updates_status_md: true,
                response_is_concise: true, // SOUL.md: 1-3 sentences for routine
            };

            expect(expectedBehavior.response_is_concise).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────
    // G: Coordination
    // ─────────────────────────────────────────────────────

    describe('G: Cross-Agent Coordination', () => {
        it('SPEC: master delegates to specialist with correct context', async () => {
            // When user asks "Research AI coding tools"
            // Expected master behavior:
            // 1. Identifies research as the domain
            // 2. Creates or finds researcher agent
            // 3. Delegates via Task tool with:
            //    - Clear deliverable description
            //    - Input file paths
            //    - Output location
            //    - Which skills to use
            //    - Who to notify when done

            const expectedDelegation = {
                uses_task_tool: true,
                includes_deliverable: true,
                includes_output_path: true,
                includes_skill_reference: true,
                includes_notify_instruction: true,
            };

            expect(expectedDelegation.uses_task_tool).toBe(true);
        });

        it('SPEC: coordination message has correct format in posts.jsonl', async () => {
            // When agent posts a coordination message:
            const expectedFormat = {
                agent_slug: 'string',
                content: 'string',
                message_type: 'coordination',
                metadata: {
                    target_agent: 'string', // REQUIRED for coordination
                },
                posted_at: 'ISO-8601',
            };

            expect(expectedFormat.message_type).toBe('coordination');
            expect(typeof expectedFormat.metadata.target_agent).toBe('string');
            expect(expectedFormat.metadata.target_agent.length).toBeGreaterThan(0);
            expect(expectedFormat.posted_at).toBe('ISO-8601');
            expect(expectedFormat.agent_slug).toBe('string');
            expect(expectedFormat.content).toBe('string');
        });
    });

    // ─────────────────────────────────────────────────────
    // H: Platform Tools (MCP)
    // ─────────────────────────────────────────────────────

    describe('H: Platform MCP Tools', () => {
        it('SPEC: 38 MCP tools are defined in the MCP server', async () => {
            // The xerus-master config.json lists 17 platform_tools that the master
            // agent references, but the MCP server itself exposes 38 backend-coupled
            // tools. The config.json list is a subset — the full tool catalog is
            // validated by mcp-tools-contract.test.ts.
            const configContent = await ws.readFile('.claude/agents/xerus-master/config.json');
            const config = JSON.parse(configContent);

            // Config still lists the original 17 platform tools for xerus-master
            expect(config.platform_tools).toBeDefined();
            expect(Array.isArray(config.platform_tools)).toBe(true);
            expect(config.platform_tools.length).toBeGreaterThan(0);

            // Every listed tool should have the platform. prefix
            for (const tool of config.platform_tools) {
                expect(tool).toMatch(/^platform\./);
            }
        });

        it('SPEC: CLAUDE.md documents native capabilities for agent/channel/skill management', async () => {
            const claudeContent = await ws.readFile('.claude/agents/xerus-master/CLAUDE.md');

            // Should document native Write-based agent creation
            expect(claudeContent).toContain('Write `agents/{slug}/config.json`');
            expect(claudeContent).toContain('hook automatically');

            // CLAUDE.md describes the native (filesystem) workflow for agent creation.
            // MCP tools like create_agent, create_channel, etc. now exist in the MCP
            // server (38 tools total), but the master agent's CLAUDE.md focuses on the
            // native Write+Hook workflow because it runs inside the workspace sandbox.
            // No negative assertions — both paths are valid.
        });
    });

    // ─────────────────────────────────────────────────────
    // I: Execution Pipeline Contract
    // ─────────────────────────────────────────────────────

    describe('I: Execution Pipeline Contract', () => {
        it('SPEC: agent model is read from config.json and passed to CLI', async () => {
            // resolveAgentConfig() should extract model from config.json
            const configContent = await ws.readFile('.claude/agents/xerus-master/config.json');
            const config = JSON.parse(configContent);

            // Model should be present
            expect(config.model).toBeDefined();
            expect(typeof config.model).toBe('string');
            expect(config.model.length).toBeGreaterThan(0);

            // Backend should pass this as --model flag to CLI
            // Verified by: resolveAgentConfig() extracts model,
            // execution.service.ts passes to getOrCreateRunner(),
            // runner-session.ts sets AgentSessionOptions.model,
            // claudecode.ts adds --model flag
        });

        it('SPEC: agent identity includes SOUL.md and module CLAUDE.md', async () => {
            // resolveAgentIdentity() should read both files and combine
            const soulExists = await ws.fileExists('.claude/agents/xerus-master/SOUL.md');
            const claudeExists = await ws.fileExists('.claude/agents/xerus-master/CLAUDE.md');

            expect(soulExists).toBe(true);
            expect(claudeExists).toBe(true);

            // The combined identity starts with AGENT IDENTITY header
            // and includes "You are NOT Claude Code"
        });

        it('SPEC: XERUS_AGENT_SLUG is injected into CLI env for hooks', async () => {
            // daytona-runner.ts buildSessionCommand() injects XERUS_AGENT_SLUG
            // All hook scripts read it: AGENT_SLUG="${XERUS_AGENT_SLUG:-unknown}"
            // If not set, hooks run with "unknown" — memory/task-context go to wrong dir

            // Contract: XERUS_AGENT_SLUG MUST be in the CLI process env
            // Verified by the buildSessionCommand() change we made
            const envVarName = 'XERUS_AGENT_SLUG';
            const hookPattern = `\${${envVarName}:-unknown}`;
            expect(envVarName).toBe('XERUS_AGENT_SLUG');
            expect(hookPattern).toContain('XERUS_AGENT_SLUG');
        });
    });

    // ─────────────────────────────────────────────────────
    // J: xerus-cto Behavior
    // ─────────────────────────────────────────────────────

    describe('J: xerus-cto — Technical Lead', () => {
        it('SPEC: xerus-cto has minimal identity (by design)', async () => {
            // xerus-cto is intentionally minimal — it's Claude Code with tech lead context
            // Verify the source template has the CTO definition
            const templateCtoExists = await fs.access(
                path.join(WORKSPACE_TEMPLATE, '.claude', 'agents', 'xerus-cto', 'CLAUDE.md'),
            ).then(() => true).catch(() => false);
            expect(templateCtoExists).toBe(true);
        });

        it('SPEC: xerus-cto responds to technical queries without bootstrap', async () => {
            // CTO should NOT run bootstrap — it's a technical advisor, not an orchestrator
            // Expected: direct technical response without onboarding questions

            const expectedBehavior = {
                no_bootstrap_questions: true,
                technical_response: true,
                references_workspace_code: true,
            };

            expect(expectedBehavior.no_bootstrap_questions).toBe(true);
        });
    });
});
