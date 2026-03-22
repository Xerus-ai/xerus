// Agent Filesystem Repository Tests
// Uses a real local filesystem (temp directory) instead of in-memory Map.

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentFilesystemRepository } from '../agent-filesystem.repository';
import { DriveService } from '../../drive/drive.service';

// LocalFsDriveService: a real filesystem implementation that reads/writes
// to a temporary directory. Implements only the methods used by the tests.
class LocalFsDriveService {
    constructor(private readonly rootDir: string) {}

    async readFile(_userId: string, filePath: string): Promise<{ content: string; source: 'daytona' }> {
        const fullPath = path.join(this.rootDir, filePath);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return { content, source: 'daytona' };
        } catch (err: unknown) {
            // Re-throw with a clear message that isFileNotFoundError can match
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw err;
        }
    }

    async writeFile(_userId: string, filePath: string, content: string): Promise<void> {
        const fullPath = path.join(this.rootDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    // Test helper: seed a file on disk
    seedFile(filePath: string, content: string): void {
        const fullPath = path.join(this.rootDir, filePath);
        const dir = path.dirname(fullPath);
        // Synchronous for use in test setup
        const fsSync = require('fs');
        fsSync.mkdirSync(dir, { recursive: true });
        fsSync.writeFileSync(fullPath, content, 'utf-8');
    }

    // Test helper: read a file from disk
    getFile(filePath: string): string | undefined {
        const fullPath = path.join(this.rootDir, filePath);
        try {
            const fsSync = require('fs');
            return fsSync.readFileSync(fullPath, 'utf-8');
        } catch {
            return undefined;
        }
    }
}

describe('AgentFilesystemRepository', () => {
    let tmpDir: string;
    let drive: LocalFsDriveService;
    let repo: AgentFilesystemRepository;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-test-'));
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    beforeEach(async () => {
        // Clean the temp dir between tests for isolation
        const entries = await fs.readdir(tmpDir);
        for (const entry of entries) {
            await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
        }
        drive = new LocalFsDriveService(tmpDir);
        repo = new AgentFilesystemRepository(drive as unknown as DriveService);
    });

    it('writes the canonical object index shape when updating an entry', async () => {
        drive.seedFile('agents/index.json', JSON.stringify({
            agents: {
                researcher: {
                    name: 'Researcher',
                    role: 'specialist',
                    channels: ['ops'],
                },
            },
            updated_at: '2026-03-09T00:00:00.000Z',
        }));

        await repo.addToIndex('user-1', {
            slug: 'researcher',
            name: 'Lead Researcher',
            agent_type: 'public',
        });

        const raw = drive.getFile('agents/index.json');
        expect(raw).toBeDefined();
        const written = JSON.parse(raw!);
        expect(Array.isArray(written)).toBe(false);
        expect(written.agents.researcher).toMatchObject({
            name: 'Lead Researcher',
            role: 'specialist',
            channels: ['ops'],
            agent_type: 'public',
        });
    });

    it('bootstraps an empty canonical index when the file is missing', async () => {
        await repo.addToIndex('user-2', {
            slug: 'builder',
            name: 'Builder',
            agent_type: 'private',
        });

        const raw = drive.getFile('agents/index.json');
        expect(raw).toBeDefined();
        const written = JSON.parse(raw!);
        expect(written).toMatchObject({
            agents: {
                builder: { name: 'Builder', agent_type: 'private' },
            },
        });
    });

    it('treats legacy array-shaped index as empty and overwrites', async () => {
        drive.seedFile('agents/index.json', JSON.stringify([
            { slug: 'builder', name: 'Builder', agent_type: 'private' },
        ]));

        await repo.addToIndex('user-3', {
            slug: 'planner',
            name: 'Planner',
            agent_type: 'public',
        });

        const raw = drive.getFile('agents/index.json');
        expect(raw).toBeDefined();
        const written = JSON.parse(raw!);
        expect(Array.isArray(written)).toBe(false);
        expect(written.agents.planner).toMatchObject({
            name: 'Planner',
            agent_type: 'public',
        });
    });
});
