// Skills Domain Service
// Business logic for skills CRUD, marketplace browsing, and install/uninstall
// Filesystem-based: all skill data lives in sandbox

import {
    Skill,
    SkillDetail,
    PaginatedSkills,
    SkillFile,
} from './types';
import {
    SkillNotFoundError,
    SkillAccessDeniedError,
    SkillNotInstalledError,
    SkillNotModifiableError,
} from './errors';
import { SkillRepository, skillRepository } from './repository';
import { SkillValidator, skillValidator } from './validators';
import { SkillWorkspaceService, channelIdToWorkspacePath } from './workspace.service';
import { generatePuzzleConfig } from './skill-avatar';
import { skillSecretsService } from './secrets.service';
import { canUserViewSkill } from './skill-access';

export class SkillService {
    private workspaceService: SkillWorkspaceService | undefined;

    constructor(
        private readonly repository: SkillRepository = skillRepository,
        private readonly validator: SkillValidator = skillValidator,
    ) {}

    setWorkspaceService(svc: SkillWorkspaceService): void {
        this.workspaceService = svc;
        this.repository.setWorkspaceService(svc);
    }

    private requireWorkspace(): SkillWorkspaceService {
        if (!this.workspaceService) {
            throw new Error('Workspace service not configured');
        }
        return this.workspaceService;
    }

    // ===== DETAIL =====

    async getBySlug(slug: string, userId: string): Promise<SkillDetail> {
        const skill = await this.repository.findBySlug(userId, slug);
        if (!skill) {
            throw new SkillNotFoundError(slug);
        }

        // Check install status first — installed skills are always viewable by the user
        const isInstalled = await this.repository.isInstalled(userId, slug);

        if (!isInstalled && !canUserViewSkill(skill, userId)) {
            throw new SkillAccessDeniedError(slug);
        }

        const files = await this.getSkillFiles(skill, userId);

        return {
            ...skill,
            files,
            is_installed: isInstalled,
        };
    }

    // ===== USER CRUD =====

    async create(data: unknown, userId: string): Promise<Skill> {
        const validated = this.validator.validateCreate(data);

        if (!validated.avatar_config) {
            validated.avatar_config = generatePuzzleConfig();
        }

        return this.repository.create(userId, validated);
    }

    async update(slug: string, data: unknown, userId: string): Promise<Skill> {
        const existing = await this.repository.findBySlug(userId, slug);
        if (!existing) {
            throw new SkillNotFoundError(slug);
        }
        this.checkOwnership(existing, userId);

        const validated = this.validator.validateUpdate(data);
        const updated = await this.repository.update(userId, slug, validated);
        if (!updated) {
            throw new SkillNotFoundError(slug);
        }
        return updated;
    }

    async delete(slug: string, userId: string): Promise<void> {
        const existing = await this.repository.findBySlug(userId, slug);
        if (!existing) {
            throw new SkillNotFoundError(slug);
        }
        this.checkOwnership(existing, userId);

        await this.repository.delete(userId, slug);
        await skillSecretsService.cleanupOnUninstall(slug, userId);
    }

    async listUserSkills(userId: string): Promise<Skill[]> {
        return this.repository.listUserSkills(userId);
    }

    async list(userId: string, options: unknown): Promise<PaginatedSkills> {
        const validated = this.validator.validateListOptions(options || {});
        return this.repository.list(userId, validated);
    }

    // ===== INSTALL / UNINSTALL =====

    async install(
        skillSlug: string,
        data: unknown,
        userId: string,
    ): Promise<void> {
        const validated = this.validator.validateInstall(data);
        const skill = await this.repository.findBySlug(userId, skillSlug);

        if (!skill) {
            throw new SkillNotFoundError(skillSlug);
        }
        if (!canUserViewSkill(skill, userId)) {
            throw new SkillAccessDeniedError(skillSlug);
        }

        // Copy skill files to workspace
        const ws = this.requireWorkspace();
        let channelPath: string | undefined;
        if (validated.scope === 'channel' && validated.channel_id) {
            channelPath = channelIdToWorkspacePath(validated.channel_id);
        }
        await ws.installSkillToWorkspace(
            userId,
            skill.slug,
            validated.scope,
            channelPath,
        );
    }

    async uninstall(
        skillSlug: string,
        userId: string,
        scope: 'channel' | 'global' = 'global',
        channelId?: string,
    ): Promise<void> {
        const skill = await this.repository.findBySlug(userId, skillSlug);
        if (!skill) {
            throw new SkillNotFoundError(skillSlug);
        }

        // Translate channel_id ("marketing/seo") to workspace path ("projects/marketing/channels/seo")
        const channelPath = scope === 'channel' && channelId
            ? channelIdToWorkspacePath(channelId)
            : undefined;

        // Check installed at the specific scope/path
        const isInstalled = await this.repository.isInstalled(userId, skillSlug, channelPath);
        if (!isInstalled) {
            throw new SkillNotInstalledError(skillSlug);
        }

        const ws = this.requireWorkspace();
        await ws.uninstallSkillFromWorkspace(
            userId,
            skillSlug,
            scope,
            channelPath,
        );

        await skillSecretsService.cleanupOnUninstall(skillSlug, userId);
    }

    async getInstalledSkills(userId: string): Promise<Skill[]> {
        return this.repository.listInstalled(userId);
    }

    // ===== FILE OPERATIONS =====

    async listFiles(slug: string, userId: string): Promise<SkillFile[]> {
        const skill = await this.repository.findBySlug(userId, slug);
        if (!skill) {
            throw new SkillNotFoundError(slug);
        }
        const isInstalled = await this.repository.isInstalled(userId, slug);
        if (!isInstalled && !canUserViewSkill(skill, userId)) {
            throw new SkillAccessDeniedError(slug);
        }
        return this.getSkillFiles(skill, userId);
    }

    async readFile(slug: string, filePath: string, userId: string): Promise<string> {
        const skill = await this.repository.findBySlug(userId, slug);
        if (!skill) throw new SkillNotFoundError(slug);
        const isInstalled = await this.repository.isInstalled(userId, slug);
        if (!isInstalled && !canUserViewSkill(skill, userId)) throw new SkillAccessDeniedError(slug);
        const ws = this.requireWorkspace();
        return ws.readSkillFile(userId, skill.slug, filePath, skill.is_global);
    }

    async writeFile(slug: string, filePath: string, content: string, userId: string): Promise<void> {
        const skill = await this.repository.findBySlug(userId, slug);
        if (!skill) throw new SkillNotFoundError(slug);
        this.checkOwnership(skill, userId);
        const ws = this.requireWorkspace();
        await ws.writeSkillFile(userId, skill.slug, filePath, content);
    }

    async deleteFile(slug: string, filePath: string, userId: string): Promise<void> {
        const skill = await this.repository.findBySlug(userId, slug);
        if (!skill) throw new SkillNotFoundError(slug);
        this.checkOwnership(skill, userId);
        const ws = this.requireWorkspace();
        await ws.deleteSkillFile(userId, skill.slug, filePath);
    }

    // ===== MASTER AGENT PORT =====

    async searchForMaster(userId: string, input: { query: string; scope?: string }): Promise<Skill[]> {
        const { query: searchQuery, scope } = input;

        if (scope === 'mine') {
            const userSkills = await this.repository.listUserSkills(userId);
            return userSkills.filter(s =>
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.description.toLowerCase().includes(searchQuery.toLowerCase()),
            );
        }

        return this.repository.search(userId, searchQuery);
    }

    async createForMaster(userId: string, input: {
        name: string;
        description: string;
        instructions: string;
        category?: string;
    }): Promise<Skill> {
        const skill = await this.create({
            name: input.name,
            description: input.description,
            category: input.category,
        }, userId);

        // Write SKILL.md content
        const ws = this.requireWorkspace();
        await ws.writeSkillFile(userId, skill.slug, 'SKILL.md', input.instructions);

        return skill;
    }

    /**
     * Write an additional file to an existing skill directory.
     * Used by import routes to write supporting files (references, scripts, etc.)
     */
    async writeAdditionalFile(userId: string, skillSlug: string, filename: string, content: string): Promise<void> {
        const ws = this.requireWorkspace();
        await ws.writeSkillFile(userId, skillSlug, filename, content);
    }

    // ===== PRIVATE HELPERS =====

    private checkOwnership(skill: Skill, userId: string): void {
        if (skill.user_id === null && skill.is_global) {
            throw new SkillNotModifiableError(skill.slug, 'marketplace skills are read-only');
        }
        if (skill.user_id !== userId) {
            throw new SkillAccessDeniedError(skill.slug);
        }
    }

    private async getSkillFiles(skill: Skill, userId: string): Promise<SkillFile[]> {
        const ws = this.requireWorkspace();
        return ws.listSkillFiles(userId, skill.slug, skill.is_global);
    }
}

export const skillService = new SkillService();
