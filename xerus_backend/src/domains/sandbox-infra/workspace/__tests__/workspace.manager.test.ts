// Workspace Manager Tests
// Tests for hierarchical workspace: workspace > projects > channels

import {
    WorkspaceManager,
    SandboxFileSystem,
    WORKSPACE_DIRECTORIES,
    AGENT_SUBDIRECTORIES,
    CHANNEL_SUBDIRECTORIES,
    PROJECT_SUBDIRECTORIES,
    DEFAULT_CLEANUP_OPTIONS,
} from '../index';

// -----------------------------------------------------------------------------
// In-Memory Sandbox File System (for testing - NOT a mock)
// Real implementation that stores files in memory
// -----------------------------------------------------------------------------

class InMemorySandboxFs implements SandboxFileSystem {
    private files = new Map<string, string>();
    private directories = new Set<string>();

    async mkdir(path: string): Promise<void> {
        const parts = path.split('/').filter((p) => p);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            this.directories.add('/' + current);
        }
        this.directories.add(path);
    }

    async writeFile(path: string, content: string): Promise<void> {
        const parentDir = path.substring(0, path.lastIndexOf('/'));
        if (parentDir && !this.directories.has(parentDir)) {
            await this.mkdir(parentDir);
        }
        this.files.set(path, content);
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(path);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }

    async exists(path: string): Promise<boolean> {
        return this.files.has(path) || this.directories.has(path);
    }

    async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
        if (options?.recursive) {
            for (const file of this.files.keys()) {
                if (file.startsWith(path)) {
                    this.files.delete(file);
                }
            }
            for (const dir of this.directories) {
                if (dir.startsWith(path)) {
                    this.directories.delete(dir);
                }
            }
        } else {
            this.files.delete(path);
            this.directories.delete(path);
        }
    }

    async list(path: string): Promise<string[]> {
        const results: string[] = [];
        const prefix = path.endsWith('/') ? path : `${path}/`;

        for (const file of this.files.keys()) {
            if (file.startsWith(prefix)) {
                const relativePath = file.slice(prefix.length);
                const firstSegment = relativePath.split('/')[0];
                if (firstSegment && !results.includes(firstSegment)) {
                    results.push(firstSegment);
                }
            }
        }

        for (const dir of this.directories) {
            if (dir.startsWith(prefix) && dir !== path) {
                const relativePath = dir.slice(prefix.length);
                const firstSegment = relativePath.split('/')[0];
                if (firstSegment && !results.includes(firstSegment)) {
                    results.push(firstSegment);
                }
            }
        }

        return results;
    }

    hasDir(path: string): boolean {
        return this.directories.has(path);
    }
}

// -----------------------------------------------------------------------------
// Failing Sandbox File System (simulates mkdir failures for specific paths)
// -----------------------------------------------------------------------------

class FailingSandboxFs implements SandboxFileSystem {
    private delegate: InMemorySandboxFs;
    private failPaths: Set<string>;

    constructor(failPaths: string[]) {
        this.delegate = new InMemorySandboxFs();
        this.failPaths = new Set(failPaths);
    }

    async mkdir(path: string): Promise<void> {
        if (this.failPaths.has(path)) {
            throw new Error(`Permission denied: ${path}`);
        }
        return this.delegate.mkdir(path);
    }

    async writeFile(path: string, content: string): Promise<void> {
        return this.delegate.writeFile(path, content);
    }

    async readFile(path: string): Promise<string> {
        return this.delegate.readFile(path);
    }

    async exists(path: string): Promise<boolean> {
        return this.delegate.exists(path);
    }

    async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
        return this.delegate.rm(path, options);
    }

    async list(path: string): Promise<string[]> {
        return this.delegate.list(path);
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('WorkspaceManager', () => {
    let sandboxFs: InMemorySandboxFs;
    let manager: WorkspaceManager;
    const basePath = process.env.XERUS_WORKSPACE_ROOT || '/tmp/xerus-test-workspace';

    beforeEach(() => {
        sandboxFs = new InMemorySandboxFs();
        manager = new WorkspaceManager(sandboxFs, basePath);
    });

    describe('constructor', () => {
        it('should create instance with custom base path', () => {
            const customManager = new WorkspaceManager(sandboxFs, '/custom/path');
            expect(customManager.getBasePath()).toBe('/custom/path');
        });

        it('should use default base path when not provided', () => {
            const defaultManager = new WorkspaceManager(sandboxFs);
            expect(defaultManager.getBasePath()).toBe(process.env.XERUS_WORKSPACE_ROOT);
        });
    });

    describe('scaffoldAgent', () => {
        it('should create agent directory structure', async () => {
            const result = await manager.scaffoldAgent('seo-writer');

            expect(result.success).toBe(true);
            expect(result.path).toBe(`${basePath}/agents/seo-writer`);

            expect(result.createdDirectories).toContain(`${basePath}/agents/seo-writer`);
            expect(result.createdDirectories).toContain(`${basePath}/agents/seo-writer/inbox`);
            expect(result.createdDirectories).toContain(`${basePath}/agents/seo-writer/inbox/processed`);
            expect(result.createdDirectories).toContain(`${basePath}/agents/seo-writer/knowledge`);
        });

        it('should create agent memory directory', async () => {
            const result = await manager.scaffoldAgent('seo-writer');

            expect(result.createdDirectories).toContain(`${basePath}/.memory/agents/seo-writer`);
        });

        it('should handle slugs with hyphens', async () => {
            const result = await manager.scaffoldAgent('vision-pro-v2');

            expect(result.success).toBe(true);
            expect(result.path).toBe(`${basePath}/agents/vision-pro-v2`);
        });

        it('should throw aggregate error when one dir fails', async () => {
            const failPath = `${basePath}/agents/seo-writer/knowledge`;
            const failingFs = new FailingSandboxFs([failPath]);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            await expect(failingManager.scaffoldAgent('seo-writer')).rejects.toThrow(
                'Agent scaffold partially failed (1/5 dirs failed)'
            );
        });

        it('should attempt all directories even when some fail', async () => {
            const failPaths = [
                `${basePath}/agents/seo-writer/inbox`,
                `${basePath}/.memory/agents/seo-writer`,
            ];
            const failingFs = new FailingSandboxFs(failPaths);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            try {
                await failingManager.scaffoldAgent('seo-writer');
            } catch (error) {
                const msg = (error as Error).message;
                expect(msg).toContain('2/5 dirs failed');
                expect(msg).toContain(`${failPaths[0]}: Permission denied`);
                expect(msg).toContain(`${failPaths[1]}: Permission denied`);
            }
        });
    });

    describe('scaffoldProject', () => {
        it('should create project directory structure', async () => {
            const result = await manager.scaffoldProject('marketing');

            expect(result.success).toBe(true);
            expect(result.path).toBe(`${basePath}/projects/marketing`);

            expect(result.createdDirectories).toContain(`${basePath}/projects/marketing`);
            expect(result.createdDirectories).toContain(`${basePath}/projects/marketing/data`);
            expect(result.createdDirectories).toContain(`${basePath}/projects/marketing/knowledge`);
            expect(result.createdDirectories).toContain(`${basePath}/projects/marketing/channels`);
        });

        it('should create project memory directory', async () => {
            const result = await manager.scaffoldProject('marketing');

            expect(result.createdDirectories).toContain(`${basePath}/.memory/projects/marketing`);
        });

        it('should throw aggregate error when one dir fails', async () => {
            const failPath = `${basePath}/projects/marketing/knowledge`;
            const failingFs = new FailingSandboxFs([failPath]);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            await expect(failingManager.scaffoldProject('marketing')).rejects.toThrow(
                'Project scaffold partially failed (1/5 dirs failed)'
            );
        });

        it('should attempt all directories even when some fail', async () => {
            const failPaths = [
                `${basePath}/projects/marketing/data`,
                `${basePath}/.memory/projects/marketing`,
            ];
            const failingFs = new FailingSandboxFs(failPaths);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            try {
                await failingManager.scaffoldProject('marketing');
            } catch (error) {
                const msg = (error as Error).message;
                expect(msg).toContain('2/5 dirs failed');
                expect(msg).toContain(`${failPaths[0]}: Permission denied`);
                expect(msg).toContain(`${failPaths[1]}: Permission denied`);
            }
        });
    });

    describe('scaffoldChannel', () => {
        it('should create channel directory structure', async () => {
            const result = await manager.scaffoldChannel('marketing', 'seo');

            expect(result.success).toBe(true);
            expect(result.path).toBe(`${basePath}/projects/marketing/channels/seo`);

            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo`
            );
            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo/.beads`
            );
            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo/data`
            );
            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo/output`
            );
            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo/output/deliverables`
            );
            expect(result.createdDirectories).toContain(
                `${basePath}/projects/marketing/channels/seo/scratch`
            );
        });

        it('should create exactly 6 directories', async () => {
            const result = await manager.scaffoldChannel('marketing', 'seo');
            expect(result.createdDirectories!.length).toBe(6);
        });

        it('should throw aggregate error when one dir fails', async () => {
            const failPath = `${basePath}/projects/marketing/channels/seo/scratch`;
            const failingFs = new FailingSandboxFs([failPath]);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            await expect(failingManager.scaffoldChannel('marketing', 'seo')).rejects.toThrow(
                'Channel scaffold partially failed (1/6 dirs failed)'
            );
        });

        it('should attempt all directories even when some fail', async () => {
            const failPaths = [
                `${basePath}/projects/marketing/channels/seo/data`,
                `${basePath}/projects/marketing/channels/seo/output`,
            ];
            const failingFs = new FailingSandboxFs(failPaths);
            const failingManager = new WorkspaceManager(failingFs, basePath);

            try {
                await failingManager.scaffoldChannel('marketing', 'seo');
            } catch (error) {
                const msg = (error as Error).message;
                expect(msg).toContain('2/6 dirs failed');
                expect(msg).toContain(`${failPaths[0]}: Permission denied`);
                expect(msg).toContain(`${failPaths[1]}: Permission denied`);
            }
        });
    });

    describe('cleanupChannel', () => {
        beforeEach(async () => {
            await manager.scaffoldChannel('marketing', 'seo');
            const ch = `${basePath}/projects/marketing/channels/seo`;
            await sandboxFs.writeFile(`${ch}/scratch/temp.txt`, 'temp');
            await sandboxFs.writeFile(`${ch}/output/report.md`, 'report');
            await sandboxFs.writeFile(`${ch}/data/seo.db`, 'data');
        });

        it('should always clean scratch', async () => {
            const result = await manager.cleanupChannel('marketing', 'seo');

            expect(result.success).toBe(true);

            const scratchFileExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/scratch/temp.txt`
            );
            expect(scratchFileExists).toBe(false);

            // scratch dir should still exist (recreated)
            const scratchDirExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/scratch`
            );
            expect(scratchDirExists).toBe(true);
        });

        it('should keep outputs by default', async () => {
            await manager.cleanupChannel('marketing', 'seo');

            const outputExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/output/report.md`
            );
            expect(outputExists).toBe(true);
        });

        it('should remove outputs when keepOutputs is false', async () => {
            await manager.cleanupChannel('marketing', 'seo', {
                ...DEFAULT_CLEANUP_OPTIONS,
                keepOutputs: false,
            });

            const outputExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/output/report.md`
            );
            expect(outputExists).toBe(false);

            // output dir and deliverables subdir should be recreated
            const outputDirExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/output`
            );
            expect(outputDirExists).toBe(true);
            const deliverablesExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/output/deliverables`
            );
            expect(deliverablesExists).toBe(true);
        });

        it('should keep data by default', async () => {
            await manager.cleanupChannel('marketing', 'seo');

            const dataExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/data/seo.db`
            );
            expect(dataExists).toBe(true);
        });

        it('should remove data when keepData is false', async () => {
            await manager.cleanupChannel('marketing', 'seo', {
                keepOutputs: true,
                keepData: false,
            });

            const dataExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/data/seo.db`
            );
            expect(dataExists).toBe(false);

            // data dir should be recreated
            const dataDirExists = await sandboxFs.exists(
                `${basePath}/projects/marketing/channels/seo/data`
            );
            expect(dataDirExists).toBe(true);
        });
    });

    describe('root-level path helpers', () => {
        it('getBasePath returns base path', () => {
            expect(manager.getBasePath()).toBe(basePath);
        });

        it('getAgentsPath returns agents directory', () => {
            expect(manager.getAgentsPath()).toBe(`${basePath}/agents`);
        });

        it('getProjectsPath returns projects directory', () => {
            expect(manager.getProjectsPath()).toBe(`${basePath}/projects`);
        });

        it('getMemoryPath returns .memory directory', () => {
            expect(manager.getMemoryPath()).toBe(`${basePath}/.memory`);
        });

        it('getSharedPath returns shared directory', () => {
            expect(manager.getSharedPath()).toBe(`${basePath}/shared`);
        });

        it('getSharedKnowledgePath returns shared/knowledge', () => {
            expect(manager.getSharedKnowledgePath()).toBe(`${basePath}/shared/knowledge`);
        });

        it('getSharedInboxPath returns shared/inbox', () => {
            expect(manager.getSharedInboxPath()).toBe(`${basePath}/shared/inbox`);
        });

        it('getMarketplacePath returns marketplace directory', () => {
            expect(manager.getMarketplacePath()).toBe(`${basePath}/marketplace`);
        });

        it('getDataPath returns data directory', () => {
            expect(manager.getDataPath()).toBe(`${basePath}/data`);
        });

        it('getClaudePath returns .claude directory', () => {
            expect(manager.getClaudePath()).toBe(`${basePath}/.claude`);
        });
    });

    describe('agent path helpers', () => {
        const slug = 'seo-writer';

        it('getAgentPath returns agent root', () => {
            expect(manager.getAgentPath(slug)).toBe(`${basePath}/agents/seo-writer`);
        });

        it('agentFile resolves agent sub-paths', () => {
            expect(manager.agentFile(slug, 'config')).toBe(`${basePath}/agents/seo-writer/config.json`);
            expect(manager.agentFile(slug, 'heartbeat')).toBe(`${basePath}/agents/seo-writer/HEARTBEAT.md`);
            expect(manager.agentFile(slug, 'inbox')).toBe(`${basePath}/agents/seo-writer/inbox`);
            expect(manager.agentFile(slug, 'knowledge')).toBe(`${basePath}/agents/seo-writer/knowledge`);
            expect(manager.agentFile(slug, 'soul')).toBe(`${basePath}/agents/seo-writer/SOUL.md`);
            expect(manager.agentFile(slug, 'status')).toBe(`${basePath}/agents/seo-writer/STATUS.md`);
            expect(manager.agentFile(slug, 'user')).toBe(`${basePath}/agents/seo-writer/USER.md`);
            expect(manager.agentFile(slug, 'relationships')).toBe(`${basePath}/agents/seo-writer/RELATIONSHIPS.md`);
            expect(manager.agentFile(slug, 'bootstrap')).toBe(`${basePath}/agents/seo-writer/BOOTSTRAP.md`);
        });

        it('getAgentMemoryPath returns .memory/agents/{slug}', () => {
            expect(manager.getAgentMemoryPath(slug)).toBe(
                `${basePath}/.memory/agents/seo-writer`
            );
        });
    });

    describe('project path helpers', () => {
        const domain = 'marketing';

        it('getProjectPath returns project root', () => {
            expect(manager.getProjectPath(domain)).toBe(`${basePath}/projects/marketing`);
        });

        it('projectFile resolves project sub-paths', () => {
            expect(manager.projectFile(domain, 'claudeMd')).toBe(`${basePath}/projects/marketing/CLAUDE.md`);
            expect(manager.projectFile(domain, 'data')).toBe(`${basePath}/projects/marketing/data`);
            expect(manager.projectFile(domain, 'knowledge')).toBe(`${basePath}/projects/marketing/knowledge`);
            expect(manager.projectFile(domain, 'channels')).toBe(`${basePath}/projects/marketing/channels`);
        });

        it('getProjectChannelsPath returns channels directory', () => {
            expect(manager.getProjectChannelsPath(domain)).toBe(
                `${basePath}/projects/marketing/channels`
            );
        });
    });

    describe('channel path helpers', () => {
        const domain = 'marketing';
        const channel = 'seo';

        it('getChannelPath returns channel root', () => {
            expect(manager.getChannelPath(domain, channel)).toBe(
                `${basePath}/projects/marketing/channels/seo`
            );
        });

        it('channelFile resolves channel sub-paths', () => {
            expect(manager.channelFile(domain, channel, 'claudeMd')).toBe(`${basePath}/projects/marketing/channels/seo/CLAUDE.md`);
            expect(manager.channelFile(domain, channel, 'beads')).toBe(`${basePath}/projects/marketing/channels/seo/.beads/issues.jsonl`);
            expect(manager.channelFile(domain, channel, 'data')).toBe(`${basePath}/projects/marketing/channels/seo/data`);
            expect(manager.channelFile(domain, channel, 'output')).toBe(`${basePath}/projects/marketing/channels/seo/output`);
            expect(manager.channelFile(domain, channel, 'outputPosts')).toBe(`${basePath}/projects/marketing/channels/seo/output/posts.jsonl`);
            expect(manager.channelFile(domain, channel, 'outputDeliverables')).toBe(`${basePath}/projects/marketing/channels/seo/output/deliverables`);
            expect(manager.channelFile(domain, channel, 'scratch')).toBe(`${basePath}/projects/marketing/channels/seo/scratch`);
        });
    });

    describe('getWorkspaceInfo', () => {
        it('should return info with initialized=true when agents dir exists', async () => {
            await sandboxFs.mkdir(`${basePath}/agents`);

            const info = await manager.getWorkspaceInfo();

            expect(info.basePath).toBe(basePath);
            expect(info.paths.root).toBe(basePath);
            expect(info.paths.agents).toBe(`${basePath}/agents`);
            expect(info.paths.projects).toBe(`${basePath}/projects`);
            expect(info.paths.memory).toBe(`${basePath}/.memory`);
            expect(info.paths.shared).toBe(`${basePath}/shared`);
            expect(info.paths.marketplace).toBe(`${basePath}/marketplace`);
            expect(info.paths.data).toBe(`${basePath}/data`);
            expect(info.paths.claude).toBe(`${basePath}/.claude`);
            expect(info.initialized).toBe(true);
        });

        it('should return initialized=false for empty workspace', async () => {
            const info = await manager.getWorkspaceInfo();
            expect(info.initialized).toBe(false);
        });
    });

    describe('getAgentInfo', () => {
        it('should return agent info after scaffold', async () => {
            await manager.scaffoldAgent('seo-writer');

            const info = await manager.getAgentInfo('seo-writer');

            expect(info.agentSlug).toBe('seo-writer');
            expect(info.paths.root).toBe(`${basePath}/agents/seo-writer`);
            expect(info.paths.config).toBe(`${basePath}/agents/seo-writer/config.json`);
            expect(info.paths.heartbeat).toBe(`${basePath}/agents/seo-writer/HEARTBEAT.md`);
            expect(info.paths.inbox).toBe(`${basePath}/agents/seo-writer/inbox`);
            expect(info.paths.inboxProcessed).toBe(`${basePath}/agents/seo-writer/inbox/processed`);
            expect(info.paths.knowledge).toBe(`${basePath}/agents/seo-writer/knowledge`);
            expect(info.initialized).toBe(true);
        });

        it('should return initialized=false for non-existent agent', async () => {
            const info = await manager.getAgentInfo('non-existent');
            expect(info.initialized).toBe(false);
        });
    });

    describe('getChannelInfo', () => {
        it('should return channel info after scaffold', async () => {
            await manager.scaffoldChannel('marketing', 'seo');

            const info = await manager.getChannelInfo('marketing', 'seo');

            expect(info.domain).toBe('marketing');
            expect(info.channel).toBe('seo');
            expect(info.paths.root).toBe(`${basePath}/projects/marketing/channels/seo`);
            expect(info.paths.claudeMd).toBe(`${basePath}/projects/marketing/channels/seo/CLAUDE.md`);
            expect(info.paths.beads).toBe(`${basePath}/projects/marketing/channels/seo/.beads/issues.jsonl`);
            expect(info.paths.data).toBe(`${basePath}/projects/marketing/channels/seo/data`);
            expect(info.paths.output).toBe(`${basePath}/projects/marketing/channels/seo/output`);
            expect(info.paths.scratch).toBe(`${basePath}/projects/marketing/channels/seo/scratch`);
            expect(info.initialized).toBe(true);
        });

        it('should return initialized=false for non-existent channel', async () => {
            const info = await manager.getChannelInfo('marketing', 'non-existent');
            expect(info.initialized).toBe(false);
        });
    });
});

describe('Workspace Types', () => {
    describe('WORKSPACE_DIRECTORIES', () => {
        it('should have root-level directory constants', () => {
            expect(WORKSPACE_DIRECTORIES.claude).toBe('.claude');
            expect(WORKSPACE_DIRECTORIES.agents).toBe('agents');
            expect(WORKSPACE_DIRECTORIES.projects).toBe('projects');
            expect(WORKSPACE_DIRECTORIES.memory).toBe('.memory');
            expect(WORKSPACE_DIRECTORIES.marketplace).toBe('marketplace');
            expect(WORKSPACE_DIRECTORIES.data).toBe('data');
            expect(WORKSPACE_DIRECTORIES.shared).toBe('shared');
            expect(WORKSPACE_DIRECTORIES.sharedKnowledge).toBe('shared/knowledge');
            expect(WORKSPACE_DIRECTORIES.sharedInbox).toBe('shared/inbox');
        });

        it('should have claude subdirectory constants', () => {
            expect(WORKSPACE_DIRECTORIES.claudeSkills).toBe('.claude/skills');
            expect(WORKSPACE_DIRECTORIES.claudeHooks).toBe('.claude/hooks');
            expect(WORKSPACE_DIRECTORIES.claudeTeams).toBe('.claude/teams');
            expect(WORKSPACE_DIRECTORIES.claudeTasks).toBe('.claude/tasks');
        });

        it('should have memory subdirectory constants', () => {
            expect(WORKSPACE_DIRECTORIES.memoryIndex).toBe('.memory/index.md');
            expect(WORKSPACE_DIRECTORIES.memoryUser).toBe('.memory/user');
            expect(WORKSPACE_DIRECTORIES.memoryCompany).toBe('.memory/company');
            expect(WORKSPACE_DIRECTORIES.memoryEntities).toBe('.memory/entities');
            expect(WORKSPACE_DIRECTORIES.memoryTopics).toBe('.memory/topics');
            expect(WORKSPACE_DIRECTORIES.memoryProjects).toBe('.memory/projects');
            expect(WORKSPACE_DIRECTORIES.memoryAgents).toBe('.memory/agents');
            expect(WORKSPACE_DIRECTORIES.memoryArchive).toBe('.memory/archive');
        });
    });

    describe('AGENT_SUBDIRECTORIES', () => {
        it('should have all agent subdirectory constants', () => {
            expect(AGENT_SUBDIRECTORIES.config).toBe('config.json');
            expect(AGENT_SUBDIRECTORIES.heartbeat).toBe('HEARTBEAT.md');
            expect(AGENT_SUBDIRECTORIES.inbox).toBe('inbox');
            expect(AGENT_SUBDIRECTORIES.inboxProcessed).toBe('inbox/processed');
            expect(AGENT_SUBDIRECTORIES.knowledge).toBe('knowledge');
        });
    });

    describe('CHANNEL_SUBDIRECTORIES', () => {
        it('should have all channel subdirectory constants', () => {
            expect(CHANNEL_SUBDIRECTORIES.claudeMd).toBe('CLAUDE.md');
            expect(CHANNEL_SUBDIRECTORIES.beads).toBe('.beads/issues.jsonl');
            expect(CHANNEL_SUBDIRECTORIES.beadsDir).toBe('.beads');
            expect(CHANNEL_SUBDIRECTORIES.data).toBe('data');
            expect(CHANNEL_SUBDIRECTORIES.output).toBe('output');
            expect(CHANNEL_SUBDIRECTORIES.outputPosts).toBe('output/posts.jsonl');
            expect(CHANNEL_SUBDIRECTORIES.outputDeliverables).toBe('output/deliverables');
            expect(CHANNEL_SUBDIRECTORIES.scratch).toBe('scratch');
        });
    });

    describe('PROJECT_SUBDIRECTORIES', () => {
        it('should have all project subdirectory constants', () => {
            expect(PROJECT_SUBDIRECTORIES.claudeMd).toBe('CLAUDE.md');
            expect(PROJECT_SUBDIRECTORIES.data).toBe('data');
            expect(PROJECT_SUBDIRECTORIES.knowledge).toBe('knowledge');
            expect(PROJECT_SUBDIRECTORIES.channels).toBe('channels');
        });
    });

    describe('DEFAULT_CLEANUP_OPTIONS', () => {
        it('should keep outputs and data by default', () => {
            expect(DEFAULT_CLEANUP_OPTIONS.keepOutputs).toBe(true);
            expect(DEFAULT_CLEANUP_OPTIONS.keepData).toBe(true);
        });
    });
});

