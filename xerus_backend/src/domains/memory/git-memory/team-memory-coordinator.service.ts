// Team Memory Coordinator Service
// Handles coordinator procedural learning (delegation pattern extraction)
// and team participation episodic memory writing.
// Reference: docs/planning/execution/memory-integration-team-procedural.md

import { GitMemoryRepository } from './git-memory.repository';
import type { LLMClient } from './memory-extractor.service';
import {
    stripMemoryPrefix,
    readFileOrEmpty,
    formatDate,
} from './memory-file-writer.helpers';
import { buildAgentMemoryPath } from './git-memory.types';
import type {
    TeamContext,
    CoordinatorLearningInput,
    AgentTeamParticipation,
    PromotionResult,
    DelegationPattern,
} from './team-memory.types';
import {
    resolveAgentTeamRole,
} from './team-memory.types';
import {
    TeamContextRequiredError,
    CoordinatorNotInTeamError,
} from './team-memory.errors';
import { TeamMemoryPromotionService } from './team-memory-promotion.service';
import { LEGACY_LIGHT_MODEL } from '../../agents/types';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const HAIKU_MODEL = LEGACY_LIGHT_MODEL;
const DELEGATION_EXTRACTION_MAX_TOKENS = 1024;

// -----------------------------------------------------------------------------
// Team Memory Coordinator Service
// -----------------------------------------------------------------------------

export class TeamMemoryCoordinatorService {
    private readonly repo: GitMemoryRepository;
    private readonly llmClient: LLMClient;
    private readonly promotionService: TeamMemoryPromotionService;

    constructor(repo: GitMemoryRepository, llmClient: LLMClient) {
        this.repo = repo;
        this.llmClient = llmClient;
        this.promotionService = new TeamMemoryPromotionService(repo);
    }

    // -------------------------------------------------------------------------
    // 1. Write Team Participation (Episodic)
    // -------------------------------------------------------------------------

    /**
     * Write episodic memory for an agent's participation in a team execution.
     */
    async writeTeamParticipation(
        participation: AgentTeamParticipation
    ): Promise<string> {
        const agentDir = stripMemoryPrefix(buildAgentMemoryPath(participation.agentSlug));
        await this.repo.ensureDirectory(agentDir);

        const episodicPath = `${agentDir}/episodic.md`;
        const timestamp = formatDate(new Date());
        const role = participation.role;
        const lessons = participation.learnedLessons.length > 0
            ? `\n  Lessons: ${participation.learnedLessons.join('; ')}`
            : '';

        const entry = [
            `- [${timestamp}] [team:${participation.coordinationMode}] `,
            `Role: ${role}. `,
            `Task: ${participation.taskReceived}. `,
            `Outcome: ${participation.outcome}. `,
            `Team goal: ${participation.teamGoal}`,
            lessons,
        ].join('');

        const existing = await readFileOrEmpty(this.repo, episodicPath);
        if (existing.trim().length === 0) {
            await this.repo.writeFile(episodicPath, `## Session Log\n\n${entry}\n`);
        } else {
            await this.repo.writeFile(episodicPath, `${existing.trimEnd()}\n${entry}\n`);
        }

        return episodicPath;
    }

    /**
     * Write episodic memories for all agents in a team execution.
     */
    async writeTeamParticipations(
        teamContext: TeamContext,
        agentOutputs: Array<{
            agentId: number;
            agentSlug: string;
            taskReceived: string;
            resultSummary: string;
            outcome: 'success' | 'partial' | 'failed';
        }>,
        teamGoal: string
    ): Promise<string[]> {
        const writtenFiles: string[] = [];

        for (const output of agentOutputs) {
            const role = resolveAgentTeamRole(
                output.agentId,
                teamContext.coordinatorAgentId,
                teamContext.coordinationMode
            );

            const participation: AgentTeamParticipation = {
                agentId: output.agentId,
                agentSlug: output.agentSlug,
                teamExecutionId: teamContext.teamExecutionId,
                role,
                taskReceived: output.taskReceived,
                resultSummary: output.resultSummary,
                outcome: output.outcome,
                teamGoal,
                coordinationMode: teamContext.coordinationMode,
                learnedLessons: [],
            };

            const path = await this.writeTeamParticipation(participation);
            writtenFiles.push(path);
        }

        return writtenFiles;
    }

    // -------------------------------------------------------------------------
    // 2. Coordinator Procedural Learning
    // -------------------------------------------------------------------------

    /**
     * Extract and save a delegation pattern from a completed team execution.
     * Only called for coordinators of successful team executions.
     */
    async learnDelegationPattern(
        input: CoordinatorLearningInput
    ): Promise<DelegationPattern | null> {
        if (!input.teamContext.coordinatorAgentId) {
            throw new TeamContextRequiredError('learnDelegationPattern');
        }

        if (!input.teamContext.memberAgentIds.includes(input.coordinatorAgentId)) {
            throw new CoordinatorNotInTeamError(
                input.coordinatorAgentId,
                input.teamContext.teamId
            );
        }

        if (input.teamOutcome !== 'success') {
            return null;
        }

        const pattern = await this.extractDelegationPattern(input);
        if (!pattern) {
            return null;
        }

        await this.saveDelegationPattern(input.coordinatorSlug, pattern, input.teamContext);
        return pattern;
    }

    // -------------------------------------------------------------------------
    // 3. Memory Merge (delegates to TeamMemoryPromotionService)
    // -------------------------------------------------------------------------

    async mergeAgentMemoriesToTeam(
        teamContext: TeamContext,
        agentSlugs: string[],
        projectSlug: string
    ): Promise<PromotionResult[]> {
        return this.promotionService.mergeAgentMemoriesToTeam(teamContext, agentSlugs, projectSlug);
    }

    // -------------------------------------------------------------------------
    // Private: Delegation Pattern Extraction
    // -------------------------------------------------------------------------

    private async extractDelegationPattern(
        input: CoordinatorLearningInput
    ): Promise<DelegationPattern | null> {
        const agentSummaries = input.agentOutputs
            .map(
                (o) =>
                    `Agent: ${o.agentSlug} (step ${o.position ?? '?'})\n` +
                    `  Task: ${o.taskReceived}\n` +
                    `  Result: ${o.resultSummary.slice(0, 200)}\n` +
                    `  Status: ${o.status}`
            )
            .join('\n\n');

        const userPrompt = [
            `Extract a reusable delegation pattern from this successful team execution.`,
            ``,
            `Team Goal: ${input.teamGoal}`,
            `Coordination Mode: ${input.teamContext.coordinationMode}`,
            ``,
            `Agent Assignments:`,
            agentSummaries,
            ``,
            `Return JSON:`,
            `{`,
            `  "patternName": "descriptive_snake_case_name",`,
            `  "description": "What kind of multi-agent task this solves",`,
            `  "delegationSteps": [`,
            `    {"step": 1, "delegateTo": "agent_type", "taskTemplate": "what to ask", "dependsOn": []}`,
            `  ],`,
            `  "aggregationStrategy": "How to combine results"`,
            `}`,
        ].join('\n');

        const systemPrompt =
            'You are a delegation pattern extractor. Analyze successful team coordination ' +
            'and produce a reusable pattern. Output valid JSON only.';

        const raw = await this.llmClient.generateJSON<{
            patternName: string;
            description: string;
            delegationSteps: Array<{
                step: number;
                delegateTo: string;
                taskTemplate: string;
                dependsOn: number[];
            }>;
            aggregationStrategy: string;
        }>(systemPrompt, userPrompt, {
            model: HAIKU_MODEL,
            maxTokens: DELEGATION_EXTRACTION_MAX_TOKENS,
            temperature: 0.2,
        });

        if (!raw.patternName || !raw.delegationSteps || raw.delegationSteps.length === 0) {
            return null;
        }

        return {
            patternName: raw.patternName,
            description: raw.description || '',
            coordinationMode: input.teamContext.coordinationMode,
            delegationSteps: raw.delegationSteps.map((s) => ({
                step: s.step,
                delegateTo: s.delegateTo,
                taskTemplate: s.taskTemplate,
                dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
            })),
            aggregationStrategy: raw.aggregationStrategy || '',
            successCount: 1,
            totalCount: 1,
            lastUsed: new Date(),
        };
    }

    private async saveDelegationPattern(
        coordinatorSlug: string,
        pattern: DelegationPattern,
        _teamContext: TeamContext
    ): Promise<void> {
        const agentDir = stripMemoryPrefix(buildAgentMemoryPath(coordinatorSlug));
        const proceduralPath = `${agentDir}/procedural.md`;
        await this.repo.ensureDirectory(agentDir);

        const stepsFormatted = pattern.delegationSteps
            .map(
                (s) =>
                    `${s.step}. Delegate to ${s.delegateTo}: "${s.taskTemplate}"` +
                    (s.dependsOn.length > 0 ? ` (after steps: ${s.dependsOn.join(', ')})` : '')
            )
            .join('\n');

        const entry = [
            `### ${pattern.patternName}`,
            `Type: orchestration (${pattern.coordinationMode})`,
            `Description: ${pattern.description}`,
            `Steps:`,
            stepsFormatted,
            `Aggregation: ${pattern.aggregationStrategy}`,
            `Success rate: ${pattern.successCount}/${pattern.totalCount}`,
        ].join('\n');

        const existing = await readFileOrEmpty(this.repo, proceduralPath);
        if (existing.trim().length === 0) {
            await this.repo.writeFile(proceduralPath, `## Learned Patterns\n\n${entry}\n`);
        } else {
            const patternHeader = `### ${pattern.patternName}`;
            if (existing.includes(patternHeader)) {
                const updated = this.replaceProceduralSection(
                    existing,
                    pattern.patternName,
                    entry
                );
                await this.repo.writeFile(proceduralPath, updated);
            } else {
                await this.repo.writeFile(proceduralPath, `${existing.trimEnd()}\n\n${entry}\n`);
            }
        }
    }

    private replaceProceduralSection(
        content: string,
        patternName: string,
        replacement: string
    ): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let skipping = false;

        for (const line of lines) {
            if (line === `### ${patternName}`) {
                skipping = true;
                result.push(replacement);
                continue;
            }

            if (skipping && line.startsWith('### ')) {
                skipping = false;
            }

            if (!skipping) {
                result.push(line);
            }
        }

        return result.join('\n');
    }
}
