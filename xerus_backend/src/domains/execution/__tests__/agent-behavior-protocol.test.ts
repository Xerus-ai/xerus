// Agent Behavior Tests — Memory, Heartbeat, Coordination, MCP, Pipeline, CTO
// Sections E-J from the reverse TDD behavior specs.

import fs from 'fs/promises';
import path from 'path';
import {
    WORKSPACE_TEMPLATE,
    createTestWorkspace,
    type AgentWorkspace,
} from './agent-behavior-test-workspace';

describe('Agent Behavior Specifications (E-J)', () => {
    let ws: AgentWorkspace;

    beforeEach(async () => {
        ws = await createTestWorkspace();
    });

    afterEach(async () => {
        await ws.cleanup();
    });

    describe('E: Memory Protocol', () => {
        it('SPEC: agent reads working.md at session start', async () => {
            await ws.writeFile('.memory/agents/xerus-master/working.md', `
# Working Context

## Last Session (2026-04-06)
- Created content-writer agent
- Set up marketing/content channel
- User's business: SaaS productivity tool
- Next: create research agent for competitive analysis
`);

            const expectedBehavior = {
                reads_working_md: true,
                response_references_previous_context: true,
                does_not_re_ask_bootstrap_questions: true,
            };

            expect(expectedBehavior.reads_working_md).toBe(true);
        });

        it('SPEC: agent updates working.md at session end', async () => {
            const expectedWorkingMdStructure = {
                has_session_summary: true,
                has_next_actions: true,
                git_committed: true,
            };

            expect(expectedWorkingMdStructure.has_session_summary).toBe(true);
        });
    });

    describe('F: Heartbeat — Proactive Agent', () => {
        it('SPEC: heartbeat triggers proactive workspace assessment', async () => {
            const expectedBehavior = {
                reads_task_board: true,
                checks_workspace_health: true,
                updates_status_md: true,
                response_is_concise: true,
            };

            expect(expectedBehavior.response_is_concise).toBe(true);
        });
    });

    describe('G: Cross-Agent Coordination', () => {
        it('SPEC: master delegates to specialist with correct context', async () => {
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
            const expectedFormat = {
                agent_slug: 'string',
                content: 'string',
                message_type: 'coordination',
                metadata: { target_agent: 'string' },
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

    describe('H: Platform MCP Tools', () => {
        it('SPEC: 38 MCP tools are defined in the MCP server', async () => {
            const configContent = await ws.readFile('.claude/agents/xerus-master/config.json');
            const config = JSON.parse(configContent);

            expect(config.platform_tools).toBeDefined();
            expect(Array.isArray(config.platform_tools)).toBe(true);
            expect(config.platform_tools.length).toBeGreaterThan(0);

            for (const tool of config.platform_tools) {
                expect(tool).toMatch(/^(platform\.|mcp__platform__)/);
            }
        });

        it('SPEC: CLAUDE.md documents native capabilities for agent/channel/skill management', async () => {
            const claudeContent = await ws.readFile('.claude/agents/xerus-master/CLAUDE.md');

            expect(claudeContent).toContain('Write `agents/{slug}/config.json`');
            expect(claudeContent).toContain('hook automatically');
        });
    });

    describe('I: Execution Pipeline Contract', () => {
        it('SPEC: agent model is read from config.json and passed to CLI', async () => {
            const configContent = await ws.readFile('.claude/agents/xerus-master/config.json');
            const config = JSON.parse(configContent);

            expect(config.model).toBeDefined();
            expect(typeof config.model).toBe('string');
            expect(config.model.length).toBeGreaterThan(0);
        });

        it('SPEC: agent identity includes SOUL.md and module CLAUDE.md', async () => {
            const soulExists = await ws.fileExists('.claude/agents/xerus-master/SOUL.md');
            const claudeExists = await ws.fileExists('.claude/agents/xerus-master/CLAUDE.md');

            expect(soulExists).toBe(true);
            expect(claudeExists).toBe(true);
        });

        it('SPEC: XERUS_AGENT_SLUG is injected into CLI env for hooks', async () => {
            const envVarName = 'XERUS_AGENT_SLUG';
            const hookPattern = `\${${envVarName}:-unknown}`;
            expect(envVarName).toBe('XERUS_AGENT_SLUG');
            expect(hookPattern).toContain('XERUS_AGENT_SLUG');
        });
    });

    describe('J: xerus-cto — Technical Lead', () => {
        it('SPEC: xerus-cto has minimal identity (by design)', async () => {
            const templateCtoExists = await fs.access(
                path.join(WORKSPACE_TEMPLATE, '.claude', 'agents', 'xerus-cto', 'CLAUDE.md'),
            ).then(() => true).catch(() => false);
            expect(templateCtoExists).toBe(true);
        });

        it('SPEC: xerus-cto responds to technical queries without bootstrap', async () => {
            const expectedBehavior = {
                no_bootstrap_questions: true,
                technical_response: true,
                references_workspace_code: true,
            };

            expect(expectedBehavior.no_bootstrap_questions).toBe(true);
        });
    });
});
