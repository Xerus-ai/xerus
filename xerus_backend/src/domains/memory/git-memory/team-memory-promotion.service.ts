// Team Memory Promotion Service
// Evaluates and promotes significant agent memories to team scope
// after team execution completes.
// Reference: docs/planning/execution/memory-integration-team-episodic.md

import { GitMemoryRepository } from './git-memory.repository';
import {
    stripMemoryPrefix,
    readFileOrEmpty,
    formatDate,
} from './memory-file-writer.helpers';
import { buildAgentMemoryPath, buildProjectPath } from './git-memory.types';
import { computeContentHash } from './memory-search-index.service';
import type {
    TeamContext,
    PromotionCandidate,
    PromotionResult,
} from './team-memory.types';
import {
    PROMOTION_SIGNIFICANCE_THRESHOLD,
    MAX_PROMOTIONS_PER_MERGE,
} from './team-memory.types';

// Team memory file paths (relative to .memory/)
function buildTeamFilePath(projectSlug: string): string {
    return `${stripMemoryPrefix(buildProjectPath(projectSlug))}/team.md`;
}

// -----------------------------------------------------------------------------
// Team Memory Promotion Service
// -----------------------------------------------------------------------------

export class TeamMemoryPromotionService {
    private readonly repo: GitMemoryRepository;

    constructor(repo: GitMemoryRepository) {
        this.repo = repo;
    }

    /**
     * Evaluate and promote significant agent memories to team scope.
     * Called after team execution completes. Reads each agent's episodic and
     * semantic memories from the current session, evaluates significance,
     * and promotes entries above the threshold to the project-level team file.
     */
    async mergeAgentMemoriesToTeam(
        _teamContext: TeamContext,
        agentSlugs: string[],
        projectSlug: string
    ): Promise<PromotionResult[]> {
        const candidates = await this.collectPromotionCandidates(
            agentSlugs,
            projectSlug
        );

        if (candidates.length === 0) {
            return [];
        }

        // Sort by significance descending, limit to max promotions
        const sorted = candidates
            .filter((c) => c.significance >= PROMOTION_SIGNIFICANCE_THRESHOLD)
            .sort((a, b) => b.significance - a.significance)
            .slice(0, MAX_PROMOTIONS_PER_MERGE);

        const results: PromotionResult[] = [];
        const teamFilePath = buildTeamFilePath(projectSlug);
        await this.ensureParentDirectory(teamFilePath);

        // Read existing team file to check for duplicates
        const existingContent = await readFileOrEmpty(this.repo, teamFilePath);
        const existingHashes = this.extractContentHashes(existingContent);

        for (const candidate of sorted) {
            const hash = computeContentHash(candidate.content);

            if (existingHashes.has(hash)) {
                results.push({
                    promoted: false,
                    filePath: teamFilePath,
                    reason: 'Duplicate content already exists in team memory',
                });
                continue;
            }

            await this.appendToTeamFile(teamFilePath, candidate);
            existingHashes.add(hash);

            results.push({
                promoted: true,
                filePath: teamFilePath,
                reason: `Promoted from ${candidate.agentSlug} (significance: ${candidate.significance.toFixed(2)})`,
            });
        }

        return results;
    }

    // -------------------------------------------------------------------------
    // Private: Candidate Collection
    // -------------------------------------------------------------------------

    private async collectPromotionCandidates(
        agentSlugs: string[],
        _projectSlug: string
    ): Promise<PromotionCandidate[]> {
        const candidates: PromotionCandidate[] = [];

        for (const slug of agentSlugs) {
            const agentDir = stripMemoryPrefix(buildAgentMemoryPath(slug));

            // Check expertise memories for promotable facts
            const expertisePath = `${agentDir}/expertise.md`;
            const expertiseExists = await this.repo.fileExists(expertisePath);
            if (expertiseExists) {
                const expertiseContent = await this.repo.readFile(expertisePath);
                const facts = this.extractSemanticFacts(expertiseContent);

                for (const fact of facts) {
                    if (fact.confidence >= PROMOTION_SIGNIFICANCE_THRESHOLD) {
                        candidates.push({
                            agentId: 0,
                            agentSlug: slug,
                            memoryType: 'expertise',
                            content: fact.text,
                            filePath: expertisePath,
                            significance: fact.confidence,
                        });
                    }
                }
            }

            // Check working memories for promotable entries
            const workingPath = `${agentDir}/working.md`;
            const workingExists = await this.repo.fileExists(workingPath);
            if (workingExists) {
                const workingContent = await this.repo.readFile(workingPath);
                const teamEntries = this.extractTeamEpisodicEntries(workingContent);

                for (const entry of teamEntries) {
                    candidates.push({
                        agentId: 0,
                        agentSlug: slug,
                        memoryType: 'working',
                        content: entry,
                        filePath: workingPath,
                        significance: PROMOTION_SIGNIFICANCE_THRESHOLD,
                    });
                }
            }
        }

        return candidates;
    }

    // -------------------------------------------------------------------------
    // Private: Content Parsing
    // -------------------------------------------------------------------------

    private extractSemanticFacts(
        content: string
    ): Array<{ text: string; confidence: number }> {
        const factPattern = /^- (.+?) \(confidence: ([\d.]+)\)$/gm;
        const facts: Array<{ text: string; confidence: number }> = [];
        let match: RegExpExecArray | null;

        while ((match = factPattern.exec(content)) !== null) {
            facts.push({
                text: match[1].trim(),
                confidence: parseFloat(match[2]),
            });
        }

        return facts;
    }

    private extractTeamEpisodicEntries(content: string): string[] {
        return content
            .split('\n')
            .filter((line) => line.startsWith('- [') && line.includes('[team:'))
            .map((line) => line.trim());
    }

    private extractContentHashes(content: string): Set<string> {
        const hashes = new Set<string>();
        const lines = content.split('\n').filter((l) => l.startsWith('- '));
        for (const line of lines) {
            hashes.add(computeContentHash(line));
        }
        return hashes;
    }

    // -------------------------------------------------------------------------
    // Private: File Operations
    // -------------------------------------------------------------------------

    private async appendToTeamFile(
        teamFilePath: string,
        candidate: PromotionCandidate
    ): Promise<void> {
        const timestamp = formatDate(new Date());
        const entry = `- [${timestamp}] [${candidate.agentSlug}] [${candidate.memoryType}] ${candidate.content}`;

        const existing = await readFileOrEmpty(this.repo, teamFilePath);
        if (existing.trim().length === 0) {
            await this.repo.writeFile(
                teamFilePath,
                `## Team Knowledge\n\n${entry}\n`
            );
        } else {
            await this.repo.writeFile(
                teamFilePath,
                `${existing.trimEnd()}\n${entry}\n`
            );
        }
    }

    private async ensureParentDirectory(relativePath: string): Promise<void> {
        const lastSlash = relativePath.lastIndexOf('/');
        if (lastSlash > 0) {
            await this.repo.ensureDirectory(relativePath.substring(0, lastSlash));
        }
    }
}
