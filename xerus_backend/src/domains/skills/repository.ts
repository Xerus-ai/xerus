// Skills Domain Repository
// Filesystem-based: reads skills from sandbox via SkillWorkspaceService
// Marketplace skills: marketplace/skills/{slug}/xerushub.json
// Installed skills: .claude/skills/{slug}/SKILL.md
// Custom user skills: .claude/skills/{slug}/config.json (user-created, not from marketplace)

import type {
    Skill,
    SkillFilters,
    SkillListOptions,
    SkillInstallScope,
    PaginatedSkills,
    XerushubMetadata,
    CustomSkillConfig,
    CreateSkillDTO,
    UpdateSkillDTO,
} from './types';
import type { SkillWorkspaceService } from './workspace.service';
import { slugify } from '../../shared/slugify';
import { generatePuzzleConfig } from './skill-avatar';

export class SkillRepository {
    private workspaceService: SkillWorkspaceService | undefined;

    setWorkspaceService(svc: SkillWorkspaceService): void {
        this.workspaceService = svc;
    }

    private requireWorkspace(): SkillWorkspaceService {
        if (!this.workspaceService) {
            throw new Error('Workspace service not configured');
        }
        return this.workspaceService;
    }

    // ===== SKILL LOOKUP =====

    async findBySlug(userId: string, slug: string): Promise<Skill | null> {
        // Check marketplace first
        const marketplace = await this.readMarketplaceSkill(userId, slug);
        if (marketplace) return marketplace;

        // Check installed/custom skills
        return this.readInstalledSkill(userId, slug);
    }

    // ===== INSTALLED SKILLS =====

    async listInstalled(userId: string): Promise<Skill[]> {
        const ws = this.requireWorkspace();
        const entries = await ws.batchReadInstalled(userId);
        const skills: Skill[] = [];
        for (const entry of entries) {
            if (entry.type === 'config') {
                try {
                    const config: CustomSkillConfig = JSON.parse(entry.content);
                    const skill = this.customConfigToSkill(entry.slug, config, userId, entry.fileCount);
                    skill.installed_scope = entry.channelPath ? 'channel' : 'global';
                    skill.channel_path = entry.channelPath;
                    skills.push(skill);
                } catch { /* malformed json, skip */ }
            } else {
                const skill = this.skillMdToSkill(entry.slug, entry.content);
                if (skill) {
                    skill.file_count = entry.fileCount;
                    skill.is_global = false;
                    skill.installed_scope = entry.channelPath ? 'channel' : 'global';
                    skill.channel_path = entry.channelPath;
                    skills.push(skill);
                }
            }
        }
        return skills;
    }

    async isInstalled(userId: string, skillSlug: string, channelPath?: string): Promise<boolean> {
        const ws = this.requireWorkspace();
        const files = await ws.listSkillFiles(userId, skillSlug, false, channelPath);
        return files.length > 0;
    }

    // ===== CUSTOM SKILL CRUD =====

    async create(userId: string, data: CreateSkillDTO): Promise<Skill> {
        const ws = this.requireWorkspace();
        const slug = data.slug || slugify(data.name);
        if (!slug) {
            throw new Error(`Cannot generate slug from skill name: "${data.name}"`);
        }

        // Check for conflicts in installed skills
        const existing = await this.isInstalled(userId, slug);
        if (existing) {
            throw new Error(`A skill with slug "${slug}" already exists`);
        }

        const now = new Date().toISOString();
        const config: CustomSkillConfig = {
            name: data.name,
            description: data.description || '',
            category: data.category || undefined,
            tags: data.tags || [],
            author: data.author || undefined,
            source_url: data.source_url || undefined,
            avatar_config: data.avatar_config || generatePuzzleConfig(),
            version: '1.0.0',
            created_at: now,
            updated_at: now,
        };

        // Write config.json to .claude/skills/{slug}/
        await ws.writeSkillFile(userId, slug, 'config.json', JSON.stringify(config, null, 2));

        return this.customConfigToSkill(slug, config, userId, 1);
    }

    async update(userId: string, slug: string, data: UpdateSkillDTO): Promise<Skill | null> {
        const ws = this.requireWorkspace();
        const config = await this.readCustomConfig(userId, slug);
        if (!config) return null;

        if (data.name !== undefined) config.name = data.name;
        if (data.description !== undefined) config.description = data.description;
        if (data.category !== undefined) config.category = data.category || undefined;
        if (data.tags !== undefined) config.tags = data.tags;
        if (data.author !== undefined) config.author = data.author || undefined;
        if (data.source_url !== undefined) config.source_url = data.source_url || undefined;
        if (data.version !== undefined) config.version = data.version;
        if (data.avatar_config !== undefined) config.avatar_config = data.avatar_config || undefined;
        config.updated_at = new Date().toISOString();

        await ws.writeSkillFile(userId, slug, 'config.json', JSON.stringify(config, null, 2));
        const files = await ws.listSkillFiles(userId, slug, false);
        return this.customConfigToSkill(slug, config, userId, files.length);
    }

    async delete(userId: string, slug: string, scope: SkillInstallScope = 'global', channelPath?: string): Promise<boolean> {
        const ws = this.requireWorkspace();
        const result = await ws.uninstallSkillFromWorkspace(userId, slug, scope, channelPath);
        return result.filesDeleted > 0;
    }

    async listUserSkills(userId: string): Promise<Skill[]> {
        const installed = await this.listInstalled(userId);
        // Custom skills have user_id set, marketplace installed skills have null
        return installed.filter(s => s.user_id === userId);
    }

    async list(userId: string, options: SkillListOptions): Promise<PaginatedSkills> {
        const [marketplaceSkills, installedSkills] = await Promise.all([
            this.listMarketplaceSkillsAll(userId),
            this.listInstalled(userId),
        ]);
        const installedSlugs = new Set(installedSkills.map(s => s.slug));

        // Start with marketplace skills, mark install status
        const all: Skill[] = marketplaceSkills.map(s => ({
            ...s,
            is_installed: installedSlugs.has(s.slug),
        }));

        // Add user-created skills (not from marketplace)
        for (const s of installedSkills) {
            if (!all.some(m => m.slug === s.slug)) {
                all.push({ ...s, is_installed: true });
            }
        }

        // Compute categories from full set
        const categoryMap = new Map<string, number>();
        for (const s of all) {
            if (s.category) {
                categoryMap.set(s.category, (categoryMap.get(s.category) || 0) + 1);
            }
        }
        const categories = Array.from(categoryMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        const filtered = this.applyFilters(all, options.filters);
        const result = this.paginate(filtered, options);
        result.categories = categories;
        return result;
    }

    async search(userId: string, searchQuery: string, limit: number = 20): Promise<Skill[]> {
        const marketplace = await this.listMarketplaceSkillsAll(userId);
        const q = searchQuery.toLowerCase();
        return marketplace
            .filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.tags.some(t => t.toLowerCase() === q),
            )
            .slice(0, limit);
    }

    // ===== INTERNAL HELPERS =====

    private async readMarketplaceSkill(userId: string, slug: string): Promise<Skill | null> {
        const ws = this.requireWorkspace();

        // Try primary metadata (xerushub.json)
        try {
            const metaRaw = await ws.readSkillFile(userId, slug, 'xerushub.json', true);
            const meta: XerushubMetadata = JSON.parse(metaRaw);
            const files = await ws.listSkillFiles(userId, slug, true);
            return this.xerushubToSkill(slug, meta, files.length);
        } catch (err) {
            // If file exists but is malformed, propagate the parse error
            if (err instanceof SyntaxError) throw err;
        }

        // Fallback: SKILL.md frontmatter (skills without xerushub.json)
        try {
            const skillMd = await ws.readSkillFile(userId, slug, 'SKILL.md', true);
            return this.skillMdToSkill(slug, skillMd);
        } catch {
            return null;
        }
    }

    private async readInstalledSkill(userId: string, slug: string): Promise<Skill | null> {
        const ws = this.requireWorkspace();

        // Check for custom config.json first
        try {
            const configRaw = await ws.readSkillFile(userId, slug, 'config.json', false);
            const config: CustomSkillConfig = JSON.parse(configRaw);
            const files = await ws.listSkillFiles(userId, slug, false);
            return this.customConfigToSkill(slug, config, userId, files.length);
        } catch (err) {
            // If file exists but is malformed, propagate the parse error
            if (err instanceof SyntaxError) throw err;
        }

        // Fallback: marketplace-installed skill with SKILL.md only
        try {
            const skillMd = await ws.readSkillFile(userId, slug, 'SKILL.md', false);
            const files = await ws.listSkillFiles(userId, slug, false);
            const skill = this.skillMdToSkill(slug, skillMd);
            if (skill) {
                skill.file_count = files.length;
                skill.is_global = false;
            }
            return skill;
        } catch {
            return null;
        }
    }

    private async readCustomConfig(userId: string, slug: string): Promise<CustomSkillConfig | null> {
        const ws = this.requireWorkspace();
        try {
            const raw = await ws.readSkillFile(userId, slug, 'config.json', false);
            return JSON.parse(raw);
        } catch (err) {
            if (err instanceof SyntaxError) throw err;
            return null;
        }
    }

    private async listMarketplaceSkillsAll(userId: string): Promise<Skill[]> {
        const ws = this.requireWorkspace();
        const entries = await ws.batchReadMarketplace(userId);
        const skills: Skill[] = [];
        for (const entry of entries) {
            if (entry.type === 'xerushub') {
                try {
                    const meta: XerushubMetadata = JSON.parse(entry.content);
                    skills.push(this.xerushubToSkill(entry.slug, meta, entry.fileCount));
                } catch { /* malformed json, skip */ }
            } else {
                const skill = this.skillMdToSkill(entry.slug, entry.content);
                if (skill) {
                    skill.file_count = entry.fileCount;
                    skills.push(skill);
                }
            }
        }
        return skills;
    }

    private xerushubToSkill(slug: string, meta: XerushubMetadata, fileCount: number): Skill {
        return {
            slug,
            name: meta.displayName || slug,
            description: meta.summary || '',
            user_id: null,
            is_global: true,
            category: meta.category || null,
            tags: meta.tags || [],
            avatar_config: meta.avatar_config || null,
            version: meta.version || '1.0.0',
            file_count: fileCount,
            is_published: true,
            author: meta.author || null,
            source_url: meta.source_url || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    private skillMdToSkill(slug: string, content: string): Skill | null {
        const frontmatter = this.parseFrontmatter(content);
        return {
            slug,
            name: frontmatter.name || slug,
            description: frontmatter.description || '',
            user_id: null,
            is_global: true,
            category: null,
            tags: [],
            avatar_config: null,
            version: '1.0.0',
            file_count: 1,
            is_published: true,
            author: null,
            source_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    private customConfigToSkill(slug: string, config: CustomSkillConfig, userId: string, fileCount: number): Skill {
        return {
            slug,
            name: config.name || slug,
            description: config.description || '',
            user_id: userId,
            is_global: false,
            category: config.category || null,
            tags: config.tags || [],
            avatar_config: config.avatar_config || null,
            version: config.version || '1.0.0',
            file_count: fileCount,
            is_published: false,
            author: config.author || null,
            source_url: config.source_url || null,
            created_at: config.created_at || new Date().toISOString(),
            updated_at: config.updated_at || new Date().toISOString(),
        };
    }

    private parseFrontmatter(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match) return result;

        for (const line of match[1].split('\n')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                const key = line.slice(0, colonIdx).trim();
                const value = line.slice(colonIdx + 1).trim();
                result[key] = value;
            }
        }
        return result;
    }

    private applyFilters(skills: Skill[], filters?: SkillFilters): Skill[] {
        if (!filters) return skills;
        let result = skills;

        if (filters.category) {
            result = result.filter(s => s.category === filters.category);
        }
        if (filters.tags && filters.tags.length > 0) {
            result = result.filter(s => filters.tags!.some(t => s.tags.includes(t)));
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            result = result.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q),
            );
        }
        if (filters.is_published !== undefined) {
            result = result.filter(s => s.is_published === filters.is_published);
        }
        if (filters.is_global !== undefined) {
            result = result.filter(s => s.is_global === filters.is_global);
        }
        return result;
    }

    private paginate(skills: Skill[], options: SkillListOptions): PaginatedSkills {
        const sorted = this.sortSkills(skills, options.sort_by, options.sort_order);
        const offset = (options.page - 1) * options.limit;
        const page = sorted.slice(offset, offset + options.limit);
        return {
            skills: page,
            total: sorted.length,
            page: options.page,
            limit: options.limit,
            total_pages: Math.ceil(sorted.length / options.limit),
        };
    }

    private sortSkills(skills: Skill[], sortBy: string, sortOrder: 'asc' | 'desc'): Skill[] {
        const copy = [...skills];
        const dir = sortOrder === 'asc' ? 1 : -1;
        copy.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'created_at':
                    return dir * a.created_at.localeCompare(b.created_at);
                case 'updated_at':
                    return dir * a.updated_at.localeCompare(b.updated_at);
                default:
                    return dir * a.name.localeCompare(b.name);
            }
        });
        return copy;
    }
}

export const skillRepository = new SkillRepository();
