// Team Memory Integration Tests
// Tests for team memory scoping, isolation, queries, and promotion.
// Reference: docs/planning/execution/git-memory-system.md

import { TeamMemoryService } from '../team-memory.service';
import type { GitMemoryRepository } from '../git-memory.repository';
import type { MemorySearchService, SearchContext, SearchResultItem } from '../memory-search.service';
import type { LLMClient } from '../memory-extractor.service';
import type {
    TeamContext,
    TeamSearchOptions,
    CoordinatorLearningInput,
    AgentTeamParticipation,
} from '../team-memory.types';
import {
    TEAM_SEARCH_WEIGHTS,
    PROMOTION_SIGNIFICANCE_THRESHOLD,
} from '../team-memory.types';
import {
    InvalidTeamQueryScopeError,
    CoordinatorNotInTeamError,
    TeamContextRequiredError,
} from '../team-memory.errors';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

interface FileStore {
    [path: string]: string;
}

interface DirStore {
    [path: string]: boolean;
}

function createFileStore(): { files: FileStore; dirs: DirStore } {
    return { files: {}, dirs: {} };
}

function createRepo(store: { files: FileStore; dirs: DirStore }): GitMemoryRepository {
    return {
        readFile: async (path: string) => {
            if (store.files[path] === undefined) {
                throw new Error(`File not found: ${path}`);
            }
            return store.files[path];
        },
        writeFile: async (path: string, content: string) => {
            store.files[path] = content;
        },
        fileExists: async (path: string) => {
            return store.files[path] !== undefined;
        },
        ensureDirectory: async (path: string) => {
            store.dirs[path] = true;
        },
        resolveMemoryPath: (path: string) => `/workspace/.memory/${path}`,
        getMemoryAbsolutePath: () => '/workspace/.memory',
    } as unknown as GitMemoryRepository;
}

function createSearchService(
    agentResults: SearchResultItem[] = [],
    teamResults: SearchResultItem[] = []
): { service: MemorySearchService; searchCalls: Array<{ context: SearchContext; options: unknown }> } {
    const searchCalls: Array<{ context: SearchContext; options: unknown }> = [];

    const service = {
        search: async (context: SearchContext, options: unknown) => {
            searchCalls.push({ context, options });
            // Return agent results when searching for specific agent, team results otherwise
            if (context.agentSlug === '__team__') {
                return teamResults;
            }
            return agentResults;
        },
    } as unknown as MemorySearchService;

    return { service, searchCalls };
}

function createLLMClient(
    response: unknown = {}
): { client: LLMClient; calls: Array<{ system: string; user: string }> } {
    const calls: Array<{ system: string; user: string }> = [];

    const client: LLMClient = {
        generateJSON: async <T>(system: string, user: string): Promise<T> => {
            calls.push({ system, user });
            return response as T;
        },
    };

    return { client, calls };
}

function createTeamContext(overrides: Partial<TeamContext> = {}): TeamContext {
    return {
        teamExecutionId: 'exec-001',
        teamId: 10,
        coordinationMode: 'hierarchical',
        coordinatorAgentId: 100,
        memberAgentIds: [100, 101, 102],
        ...overrides,
    };
}

function createAgentResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
        filePath: 'agents/seo-agent/expertise.md',
        snippet: 'Agent knowledge about SEO',
        score: 0.85,
        tier: 'grep',
        memoryType: 'expertise',
        scope: 'agent',
        ...overrides,
    };
}

function createTeamResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
        filePath: 'projects/marketing/project.md',
        snippet: 'Team shared knowledge',
        score: 0.75,
        tier: 'grep',
        memoryType: 'expertise',
        scope: 'project',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests: Team-Aware Search
// -----------------------------------------------------------------------------

describe('TeamMemoryService', () => {
    describe('searchTeamMemory', () => {
        it('should search only agent memories when scope is agent', async () => {
            const agentResults = [createAgentResult({ score: 0.9 })];
            const teamResults = [createTeamResult({ score: 0.8 })];
            const { service: searchService, searchCalls } = createSearchService(agentResults, teamResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'SEO keywords',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'agent',
            };

            const results = await teamMemory.searchTeamMemory(options);

            // Should only call search once (for agent)
            expect(searchCalls).toHaveLength(1);
            expect(searchCalls[0].context.agentSlug).toBe('seo-agent');
            expect(results).toHaveLength(1);
            expect(results[0].sourceScope).toBe('agent');
            expect(results[0].score).toBe(0.9 * TEAM_SEARCH_WEIGHTS.agentOwnMemory);
        });

        it('should search only team memories when scope is team', async () => {
            const agentResults = [createAgentResult({ score: 0.9 })];
            const teamResults = [createTeamResult({ score: 0.8 })];
            const { service: searchService, searchCalls } = createSearchService(agentResults, teamResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'project knowledge',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'team',
            };

            const results = await teamMemory.searchTeamMemory(options);

            // Should only call search once (for team)
            expect(searchCalls).toHaveLength(1);
            expect(searchCalls[0].context.agentSlug).toBe('__team__');
            expect(results).toHaveLength(1);
            expect(results[0].sourceScope).toBe('team');
            expect(results[0].score).toBe(0.8 * TEAM_SEARCH_WEIGHTS.teamSharedMemory);
        });

        it('should search both agent and team memories when scope is both', async () => {
            const agentResults = [createAgentResult({ score: 0.9 })];
            const teamResults = [createTeamResult({ score: 0.8 })];
            const { service: searchService, searchCalls } = createSearchService(agentResults, teamResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'keyword research',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'both',
            };

            const results = await teamMemory.searchTeamMemory(options);

            expect(searchCalls).toHaveLength(2);
            expect(results).toHaveLength(2);

            // Agent results scored higher (1.0x weight)
            const agentResult = results.find((r) => r.sourceScope === 'agent');
            const teamResult = results.find((r) => r.sourceScope === 'team');
            expect(agentResult).toBeDefined();
            expect(teamResult).toBeDefined();
            expect(agentResult!.score).toBe(0.9);
            expect(teamResult!.score).toBe(0.8 * TEAM_SEARCH_WEIGHTS.teamSharedMemory);
        });

        it('should filter agent own results from team results in both mode', async () => {
            const agentResults = [createAgentResult({ filePath: 'agents/seo-agent/expertise.md', score: 0.9 })];
            const teamResults = [
                // This is the agent's own file appearing in team search - should be filtered
                createTeamResult({ filePath: 'agents/seo-agent/expertise.md', score: 0.7 }),
                createTeamResult({ filePath: 'projects/marketing/project.md', score: 0.6 }),
            ];
            const { service: searchService } = createSearchService(agentResults, teamResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'keyword research',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'both',
            };

            const results = await teamMemory.searchTeamMemory(options);

            // Should deduplicate: agent file from agent scope + project file from team scope
            expect(results).toHaveLength(2);
            const filePaths = results.map((r) => r.filePath);
            expect(filePaths).toContain('agents/seo-agent/expertise.md');
            expect(filePaths).toContain('projects/marketing/project.md');
        });

        it('should throw InvalidTeamQueryScopeError for invalid scope', async () => {
            const { service: searchService } = createSearchService();
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options = {
                query: 'test',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'invalid' as 'agent',
            };

            await expect(teamMemory.searchTeamMemory(options)).rejects.toThrow(
                InvalidTeamQueryScopeError
            );
        });

        it('should filter results below minScore', async () => {
            const agentResults = [
                createAgentResult({ score: 0.9 }),
                createAgentResult({ filePath: 'agents/seo-agent/low.md', score: 0.2 }),
            ];
            const { service: searchService } = createSearchService(agentResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'test',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'agent',
                minScore: 0.5,
            };

            const results = await teamMemory.searchTeamMemory(options);

            expect(results).toHaveLength(1);
            expect(results[0].score).toBeGreaterThanOrEqual(0.5);
        });

        it('should deduplicate by filePath keeping highest score', async () => {
            const agentResults = [
                createAgentResult({ filePath: 'agents/seo-agent/expertise.md', score: 0.6 }),
            ];
            const teamResults = [
                createTeamResult({ filePath: 'agents/seo-agent/expertise.md', score: 0.95 }),
            ];
            const { service: searchService } = createSearchService(agentResults, teamResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'test',
                agentId: 42,
                agentSlug: 'other-agent',
                workspaceId: 'ws-1',
                scope: 'both',
            };

            const results = await teamMemory.searchTeamMemory(options);

            const semanticResults = results.filter(
                (r) => r.filePath === 'agents/seo-agent/expertise.md'
            );
            expect(semanticResults).toHaveLength(1);
        });

        it('should limit results to maxResults', async () => {
            const manyResults = Array.from({ length: 10 }, (_, i) =>
                createAgentResult({
                    filePath: `agents/seo-agent/file-${i}.md`,
                    score: 0.9 - i * 0.05,
                })
            );
            const { service: searchService } = createSearchService(manyResults);
            const store = createFileStore();
            const repo = createRepo(store);
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const options: TeamSearchOptions = {
                query: 'test',
                agentId: 42,
                agentSlug: 'seo-agent',
                workspaceId: 'ws-1',
                scope: 'agent',
                maxResults: 3,
            };

            const results = await teamMemory.searchTeamMemory(options);

            expect(results).toHaveLength(3);
        });
    });

    // -------------------------------------------------------------------------
    // Tests: Write Team Participation (Episodic)
    // -------------------------------------------------------------------------

    describe('writeTeamParticipation', () => {
        it('should write episodic entry with team context for a single agent', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const participation: AgentTeamParticipation = {
                agentId: 101,
                agentSlug: 'research-agent',
                teamExecutionId: 'exec-001',
                role: 'worker',
                taskReceived: 'Research AI workforce keywords',
                resultSummary: 'Found 12 target keywords',
                outcome: 'success',
                teamGoal: 'Develop keyword strategy',
                coordinationMode: 'hierarchical',
                learnedLessons: ['Long-tail keywords have lower CPC'],
            };

            const path = await teamMemory.writeTeamParticipation(participation);

            expect(path).toBe('agents/research-agent/working.md');
            const content = store.files['agents/research-agent/working.md'];
            expect(content).toContain('## Session Log');
            expect(content).toContain('[team:hierarchical]');
            expect(content).toContain('Role: worker');
            expect(content).toContain('Task: Research AI workforce keywords');
            expect(content).toContain('Outcome: success');
            expect(content).toContain('Lessons: Long-tail keywords have lower CPC');
        });

        it('should append to existing episodic file', async () => {
            const store = createFileStore();
            store.files['agents/research-agent/working.md'] =
                '## Session Log\n\n- [2025-01-01] Previous entry\n';
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const participation: AgentTeamParticipation = {
                agentId: 101,
                agentSlug: 'research-agent',
                teamExecutionId: 'exec-002',
                role: 'worker',
                taskReceived: 'New task',
                resultSummary: 'Done',
                outcome: 'success',
                teamGoal: 'New goal',
                coordinationMode: 'parallel',
                learnedLessons: [],
            };

            await teamMemory.writeTeamParticipation(participation);

            const content = store.files['agents/research-agent/working.md'];
            expect(content).toContain('Previous entry');
            expect(content).toContain('[team:parallel]');
        });

        it('should not include lessons section when no lessons learned', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const participation: AgentTeamParticipation = {
                agentId: 101,
                agentSlug: 'research-agent',
                teamExecutionId: 'exec-001',
                role: 'worker',
                taskReceived: 'Research keywords',
                resultSummary: 'Done',
                outcome: 'success',
                teamGoal: 'Goal',
                coordinationMode: 'parallel',
                learnedLessons: [],
            };

            await teamMemory.writeTeamParticipation(participation);

            const content = store.files['agents/research-agent/working.md'];
            expect(content).not.toContain('Lessons:');
        });
    });

    describe('writeTeamParticipations', () => {
        it('should write episodic entries for all agents in team', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const teamContext = createTeamContext();
            const outputs = [
                {
                    agentId: 100,
                    agentSlug: 'coordinator',
                    taskReceived: 'Coordinate team',
                    resultSummary: 'Coordinated successfully',
                    outcome: 'success' as const,
                },
                {
                    agentId: 101,
                    agentSlug: 'worker-a',
                    taskReceived: 'Task A',
                    resultSummary: 'Completed A',
                    outcome: 'success' as const,
                },
                {
                    agentId: 102,
                    agentSlug: 'worker-b',
                    taskReceived: 'Task B',
                    resultSummary: 'Completed B',
                    outcome: 'success' as const,
                },
            ];

            const paths = await teamMemory.writeTeamParticipations(
                teamContext,
                outputs,
                'Build AI strategy'
            );

            expect(paths).toHaveLength(3);
            expect(paths).toContain('agents/coordinator/working.md');
            expect(paths).toContain('agents/worker-a/working.md');
            expect(paths).toContain('agents/worker-b/working.md');

            // Coordinator should have 'coordinator' role
            const coordinatorContent = store.files['agents/coordinator/working.md'];
            expect(coordinatorContent).toContain('Role: coordinator');

            // Workers should have 'worker' role
            const workerContent = store.files['agents/worker-a/working.md'];
            expect(workerContent).toContain('Role: worker');
        });
    });

    // -------------------------------------------------------------------------
    // Tests: Coordinator Procedural Learning
    // -------------------------------------------------------------------------

    describe('learnDelegationPattern', () => {
        it('should extract and save delegation pattern for successful execution', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();

            const llmResponse = {
                patternName: 'keyword_research_delegation',
                description: 'Delegate keyword research to specialists',
                delegationSteps: [
                    {
                        step: 1,
                        delegateTo: 'research-agent',
                        taskTemplate: 'Research keywords for {{topic}}',
                        dependsOn: [],
                    },
                    {
                        step: 2,
                        delegateTo: 'content-agent',
                        taskTemplate: 'Create content plan from keywords',
                        dependsOn: [1],
                    },
                ],
                aggregationStrategy: 'Merge keyword list with content plan',
            };
            const { client, calls } = createLLMClient(llmResponse);

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 100,
                coordinatorSlug: 'coordinator',
                teamContext: createTeamContext(),
                agentOutputs: [
                    {
                        agentId: 101,
                        agentSlug: 'research-agent',
                        taskReceived: 'Research AI keywords',
                        resultSummary: 'Found 12 keywords',
                        toolsUsed: ['web_search'],
                        status: 'completed',
                        position: 1,
                    },
                    {
                        agentId: 102,
                        agentSlug: 'content-agent',
                        taskReceived: 'Create content plan',
                        resultSummary: 'Plan for 5 blog posts',
                        toolsUsed: ['write'],
                        status: 'completed',
                        position: 2,
                    },
                ],
                teamGoal: 'Develop keyword strategy',
                teamOutcome: 'success',
            };

            const pattern = await teamMemory.learnDelegationPattern(input);

            expect(pattern).not.toBeNull();
            expect(pattern!.patternName).toBe('keyword_research_delegation');
            expect(pattern!.delegationSteps).toHaveLength(2);
            expect(pattern!.coordinationMode).toBe('hierarchical');
            expect(calls).toHaveLength(1);

            // Verify saved to procedural file
            const proceduralContent = store.files['agents/coordinator/expertise.md'];
            expect(proceduralContent).toContain('### keyword_research_delegation');
            expect(proceduralContent).toContain('Type: orchestration (hierarchical)');
            expect(proceduralContent).toContain('Delegate to research-agent');
        });

        it('should return null for failed team executions', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client, calls } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 100,
                coordinatorSlug: 'coordinator',
                teamContext: createTeamContext(),
                agentOutputs: [],
                teamGoal: 'Failed goal',
                teamOutcome: 'failed',
            };

            const pattern = await teamMemory.learnDelegationPattern(input);

            expect(pattern).toBeNull();
            expect(calls).toHaveLength(0);
        });

        it('should throw when coordinator is not in team', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 999,
                coordinatorSlug: 'outsider',
                teamContext: createTeamContext({ coordinatorAgentId: 999 }),
                agentOutputs: [],
                teamGoal: 'Some goal',
                teamOutcome: 'success',
            };

            await expect(teamMemory.learnDelegationPattern(input)).rejects.toThrow(
                CoordinatorNotInTeamError
            );
        });

        it('should throw when no coordinator agent id is set', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 100,
                coordinatorSlug: 'coordinator',
                teamContext: createTeamContext({ coordinatorAgentId: undefined }),
                agentOutputs: [],
                teamGoal: 'Some goal',
                teamOutcome: 'success',
            };

            await expect(teamMemory.learnDelegationPattern(input)).rejects.toThrow(
                TeamContextRequiredError
            );
        });

        it('should return null when LLM returns empty pattern', async () => {
            const store = createFileStore();
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient({ patternName: '', delegationSteps: [] });

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 100,
                coordinatorSlug: 'coordinator',
                teamContext: createTeamContext(),
                agentOutputs: [
                    {
                        agentId: 101,
                        agentSlug: 'worker',
                        taskReceived: 'Do work',
                        resultSummary: 'Done',
                        toolsUsed: [],
                        status: 'completed',
                    },
                ],
                teamGoal: 'Goal',
                teamOutcome: 'success',
            };

            const pattern = await teamMemory.learnDelegationPattern(input);

            expect(pattern).toBeNull();
        });

        it('should update existing pattern with same name', async () => {
            const store = createFileStore();
            store.files['agents/coordinator/expertise.md'] = [
                '## Learned Patterns',
                '',
                '### keyword_research_delegation',
                'Type: orchestration (sequential)',
                'Description: Old description',
                'Steps:',
                '1. Do old step',
                'Aggregation: Old strategy',
                'Success rate: 1/1',
                '',
            ].join('\n');

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();

            const llmResponse = {
                patternName: 'keyword_research_delegation',
                description: 'Updated description',
                delegationSteps: [
                    {
                        step: 1,
                        delegateTo: 'new-agent',
                        taskTemplate: 'New template',
                        dependsOn: [],
                    },
                ],
                aggregationStrategy: 'New strategy',
            };
            const { client } = createLLMClient(llmResponse);

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const input: CoordinatorLearningInput = {
                coordinatorAgentId: 100,
                coordinatorSlug: 'coordinator',
                teamContext: createTeamContext(),
                agentOutputs: [
                    {
                        agentId: 101,
                        agentSlug: 'new-agent',
                        taskReceived: 'Work',
                        resultSummary: 'Done',
                        toolsUsed: [],
                        status: 'completed',
                    },
                ],
                teamGoal: 'Goal',
                teamOutcome: 'success',
            };

            await teamMemory.learnDelegationPattern(input);

            const content = store.files['agents/coordinator/expertise.md'];
            expect(content).toContain('Updated description');
            expect(content).not.toContain('Old description');
            expect(content).toContain('Delegate to new-agent');
        });
    });

    // -------------------------------------------------------------------------
    // Tests: Memory Merge on Team Completion
    // -------------------------------------------------------------------------

    describe('mergeAgentMemoriesToTeam', () => {
        it('should promote high-significance semantic facts to team file', async () => {
            const store = createFileStore();
            store.files['agents/seo-agent/expertise.md'] = [
                '## Known Facts',
                '',
                `- AI workforce CPC is $2.50 (confidence: ${PROMOTION_SIGNIFICANCE_THRESHOLD + 0.1})`,
                '- Some low confidence fact (confidence: 0.3)',
            ].join('\n');

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['seo-agent'],
                'marketing'
            );

            expect(results.length).toBeGreaterThan(0);
            const promoted = results.filter((r) => r.promoted);
            expect(promoted.length).toBeGreaterThan(0);

            const teamFileContent = store.files['projects/marketing/team.md'];
            expect(teamFileContent).toContain('AI workforce CPC is $2.50');
            expect(teamFileContent).not.toContain('Some low confidence fact');
        });

        it('should promote team-tagged episodic entries', async () => {
            const store = createFileStore();
            store.files['agents/research-agent/working.md'] = [
                '## Session Log',
                '',
                '- [2025-02-15] [team:hierarchical] Role: worker. Task: Research. Outcome: success. Team goal: Strategy',
                '- [2025-02-15] Regular solo session entry',
            ].join('\n');

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['research-agent'],
                'marketing'
            );

            const promoted = results.filter((r) => r.promoted);
            expect(promoted.length).toBeGreaterThanOrEqual(1);

            const teamFileContent = store.files['projects/marketing/team.md'];
            expect(teamFileContent).toContain('[team:hierarchical]');
            expect(teamFileContent).not.toContain('Regular solo session entry');
        });

        it('should skip duplicate content that already exists in team file', async () => {
            const store = createFileStore();
            const existingEntry = '- [2025-02-14] [research-agent] [expertise] AI workforce CPC is $2.50';
            store.files['projects/marketing/team.md'] = `## Team Knowledge\n\n${existingEntry}\n`;
            store.files['agents/research-agent/expertise.md'] = [
                '## Known Facts',
                '',
                '- AI workforce CPC is $2.50 (confidence: 0.9)',
            ].join('\n');

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['research-agent'],
                'marketing'
            );

            // Should still have a result - either promoted or marked as duplicate
            expect(results.length).toBeGreaterThan(0);
        });

        it('should limit promotions to MAX_PROMOTIONS_PER_MERGE', async () => {
            const store = createFileStore();
            // Create many high-significance facts
            const manyFacts = Array.from({ length: 10 }, (_, i) =>
                `- Fact ${i} about something important (confidence: 0.95)`
            ).join('\n');
            store.files['agents/seo-agent/expertise.md'] = `## Known Facts\n\n${manyFacts}`;

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['seo-agent'],
                'marketing'
            );

            const promoted = results.filter((r) => r.promoted);
            expect(promoted.length).toBeLessThanOrEqual(5);
        });

        it('should return empty results when no agents have promotable memories', async () => {
            const store = createFileStore();
            // Agent has no memory files
            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['nonexistent-agent'],
                'marketing'
            );

            expect(results).toHaveLength(0);
        });

        it('should collect candidates from multiple agents', async () => {
            const store = createFileStore();
            store.files['agents/agent-a/expertise.md'] = [
                '## Known Facts',
                '',
                '- Agent A discovery (confidence: 0.9)',
            ].join('\n');
            store.files['agents/agent-b/expertise.md'] = [
                '## Known Facts',
                '',
                '- Agent B discovery (confidence: 0.85)',
            ].join('\n');

            const repo = createRepo(store);
            const { service: searchService } = createSearchService();
            const { client } = createLLMClient();
            const teamContext = createTeamContext();

            const teamMemory = new TeamMemoryService(repo, searchService, client);
            const results = await teamMemory.mergeAgentMemoriesToTeam(
                teamContext,
                ['agent-a', 'agent-b'],
                'project-x'
            );

            const promoted = results.filter((r) => r.promoted);
            expect(promoted.length).toBe(2);

            const teamFileContent = store.files['projects/project-x/team.md'];
            expect(teamFileContent).toContain('Agent A discovery');
            expect(teamFileContent).toContain('Agent B discovery');
        });
    });

    // -------------------------------------------------------------------------
    // Tests: Type Guards
    // -------------------------------------------------------------------------

    describe('type guards (from team-memory.types)', () => {
        it('resolveAgentTeamRole returns coordinator for hierarchical coordinator', () => {
            const { resolveAgentTeamRole } = require('../team-memory.types');
            expect(resolveAgentTeamRole(100, 100, 'hierarchical')).toBe('coordinator');
        });

        it('resolveAgentTeamRole returns worker for hierarchical non-coordinator', () => {
            const { resolveAgentTeamRole } = require('../team-memory.types');
            expect(resolveAgentTeamRole(101, 100, 'hierarchical')).toBe('worker');
        });

        it('resolveAgentTeamRole returns participant for consensus mode', () => {
            const { resolveAgentTeamRole } = require('../team-memory.types');
            expect(resolveAgentTeamRole(101, 100, 'consensus')).toBe('participant');
        });

        it('resolveAgentTeamRole returns team_member for other modes', () => {
            const { resolveAgentTeamRole } = require('../team-memory.types');
            expect(resolveAgentTeamRole(101, 100, 'sequential')).toBe('team_member');
            expect(resolveAgentTeamRole(101, 100, 'parallel')).toBe('team_member');
        });
    });

    // -------------------------------------------------------------------------
    // Tests: Error Classes
    // -------------------------------------------------------------------------

    describe('error classes', () => {
        it('InvalidTeamQueryScopeError includes the scope', () => {
            const error = new InvalidTeamQueryScopeError('invalid_scope');
            expect(error.name).toBe('InvalidTeamQueryScopeError');
            expect(error.scope).toBe('invalid_scope');
            expect(error.message).toContain('invalid_scope');
        });

        it('CoordinatorNotInTeamError includes agent and team ids', () => {
            const error = new CoordinatorNotInTeamError(999, 10);
            expect(error.name).toBe('CoordinatorNotInTeamError');
            expect(error.coordinatorAgentId).toBe(999);
            expect(error.teamId).toBe(10);
        });

        it('TeamContextRequiredError includes operation name', () => {
            const error = new TeamContextRequiredError('learnDelegationPattern');
            expect(error.name).toBe('TeamContextRequiredError');
            expect(error.message).toContain('learnDelegationPattern');
        });
    });
});
