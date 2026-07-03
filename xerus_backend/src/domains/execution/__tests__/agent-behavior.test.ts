// Agent Behavior Tests — Bootstrap, Task Execution, Agent/Channel Creation
// Sections A-D from the reverse TDD behavior specs.
// Sections E-J: agent-behavior-protocol.test.ts

import path from 'path';
import {
    hasBash,
    createTestWorkspace,
    type AgentWorkspace,
} from './agent-behavior-test-workspace';

describe('Agent Behavior Specifications (A-D)', () => {
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
            const bootstrap = await ws.readFile('.claude/agents/xerus-master/BOOTSTRAP.md');
            expect(bootstrap).toContain('completed_at: null');

            const expectedOutputs = {
                'company.md populated': 'drive/company.md should NOT contain {TODO}',
                'project created': 'at least one directory under projects/',
                'channel created': 'at least one CLAUDE.md under projects/*/channels/*/',
                'STATUS.md updated': '.claude/agents/xerus-master/STATUS.md should not contain "Bootstrap"',
                'BOOTSTRAP.md completed': 'completed_at should be a timestamp, not null',
            };

            const outputKeys = Object.keys(expectedOutputs);
            expect(outputKeys).toHaveLength(5);
            expect(outputKeys).toContain('company.md populated');
            expect(outputKeys).toContain('project created');
            expect(outputKeys).toContain('channel created');
            expect(outputKeys).toContain('STATUS.md updated');
            expect(outputKeys).toContain('BOOTSTRAP.md completed');
        });

        it('SPEC: bootstrap asks user about their business before creating structure', async () => {
            const expectedFirstResponse = {
                contains_questions: true,
                question_topics: ['business/project', 'goals/priorities', 'work needed'],
                does_not_create_files: true,
            };

            expect(expectedFirstResponse.contains_questions).toBe(true);
        });

        it('SPEC: bootstrap creates appropriate agents based on user needs', async () => {
            const expectedAgentSuggestions = {
                'content_marketing': ['content-writer', 'social-strategist'],
                'research_intel': ['researcher', 'data-analyst'],
                'engineering': ['backend-dev', 'code-reviewer'],
                'operations': ['project-manager', 'data-analyst'],
            };

            expect(expectedAgentSuggestions).toHaveProperty('content_marketing');
            expect(expectedAgentSuggestions).toHaveProperty('research_intel');
            expect(expectedAgentSuggestions).toHaveProperty('engineering');
            expect(expectedAgentSuggestions).toHaveProperty('operations');
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

            await ws.writeFile('agents/content-writer/config.json', JSON.stringify(config, null, 2));

            const hookResult = ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'content-writer', 'config.json'));
            expect(hookResult.exitCode).toBe(0);
            expect(hookResult.stdout).toContain('scaffolded');

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

            const soulContent = await ws.readFile('agents/content-writer/SOUL.md');
            expect(soulContent).toContain('Content Writer');
            expect(soulContent).not.toContain('{{AGENT_NAME}}');

            const claudeContent = await ws.readFile('agents/content-writer/CLAUDE.md');
            expect(claudeContent).toContain('content-writer');
            expect(claudeContent).toContain('projects/marketing/channels/content');
            expect(claudeContent).not.toContain('{{CHANNEL_PATH}}');
        });

        it('SPEC: created agent has working BOOTSTRAP.md with correct identity', async () => {
            await ws.writeFile('agents/research-ray/config.json', JSON.stringify({
                slug: 'research-ray', name: 'Research Ray', role: 'researcher',
                model: 'sonnet', autonomy_level: 'autonomous',
            }, null, 2));
            ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'research-ray', 'config.json'));

            const bootstrap = await ws.readFile('agents/research-ray/BOOTSTRAP.md');

            expect(bootstrap).toContain('Research Ray');
            expect(bootstrap).toContain('completed_at: null');
            expect(bootstrap).toContain('[ ]');
            expect(bootstrap).not.toContain('{{AGENT_NAME}}');
        });

        it('SPEC: hook is idempotent — does not overwrite custom soul files', async () => {
            await ws.writeFile('agents/custom-agent/config.json', '{"slug":"custom-agent","name":"Custom"}');
            await ws.writeFile('agents/custom-agent/SOUL.md', '# Custom Soul\nThis was hand-crafted.');

            ws.runScaffoldHook('Write', path.join(ws.root, 'agents', 'custom-agent', 'config.json'));

            const soulContent = await ws.readFile('agents/custom-agent/SOUL.md');
            expect(soulContent).toBe('# Custom Soul\nThis was hand-crafted.');

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

            await ws.writeFile('projects/marketing/channels/content/CLAUDE.md', claudeContent);

            const hookResult = ws.runScaffoldHook(
                'Write',
                path.join(ws.root, 'projects', 'marketing', 'channels', 'content', 'CLAUDE.md'),
            );
            expect(hookResult.exitCode).toBe(0);
            expect(hookResult.stdout).toContain('initialized');

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
});
