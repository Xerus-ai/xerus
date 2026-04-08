import '../src/config/env';

// Default workspace root for tests (sandbox.config.ts requires XERUS_WORKSPACE_ROOT)
process.env.XERUS_WORKSPACE_ROOT = process.env.XERUS_WORKSPACE_ROOT || '/tmp/xerus-test-workspace';

const verifyIdTokenMock = jest.fn(async (token: string) => {
  if (!token) {
    throw new Error('No token provided');
  }

  return {
    uid: token,
    email: `${token}@test.local`,
    name: 'Test User',
  };
});

jest.mock('firebase-admin', () => ({
  __esModule: true,
  default: {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(() => ({})),
    },
    auth: jest.fn(() => ({
      verifyIdToken: verifyIdTokenMock,
    })),
  },
}));

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'test-service-account.json';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';

import admin from 'firebase-admin';
import { query, closePool } from '../src/database/connection';
import { setAgentRoutesDeps } from '../src/domains/agents/routes';
import { SANDBOX_CONFIG } from '../src/domains/sandbox-infra/sandbox/sandbox.config';
import type { SandboxFileSystem } from '../src/domains/sandbox-infra/workspace/workspace.manager';

class InMemorySandboxFs implements SandboxFileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  constructor() {
    this.directories.add(SANDBOX_CONFIG.workspacePath);
    this.directories.add('/');
  }

  private normalize(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  private parentDir(path: string): string {
    const normalized = this.normalize(path);
    const idx = normalized.lastIndexOf('/');
    return idx <= 0 ? '/' : normalized.slice(0, idx);
  }

  private async ensureDir(path: string): Promise<void> {
    const normalized = this.normalize(path);
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    this.directories.add('/');
    for (const part of parts) {
      current = `${current}/${part}`;
      this.directories.add(current);
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.ensureDir(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalized = this.normalize(path);
    await this.ensureDir(this.parentDir(normalized));
    this.files.set(normalized, content);
  }

  async readFile(path: string): Promise<string> {
    const normalized = this.normalize(path);
    const content = this.files.get(normalized);
    if (content === undefined) {
      throw new Error(`File not found: ${normalized}`);
    }
    return content;
  }

  async exists(path: string): Promise<boolean> {
    const normalized = this.normalize(path);
    return this.files.has(normalized) || this.directories.has(normalized);
  }

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    const normalized = this.normalize(path);
    if (options?.recursive) {
      for (const filePath of Array.from(this.files.keys())) {
        if (filePath === normalized || filePath.startsWith(`${normalized}/`)) {
          this.files.delete(filePath);
        }
      }
      for (const dirPath of Array.from(this.directories)) {
        if (dirPath === normalized || dirPath.startsWith(`${normalized}/`)) {
          this.directories.delete(dirPath);
        }
      }
      return;
    }

    this.files.delete(normalized);
    this.directories.delete(normalized);
  }

  async list(path: string): Promise<string[]> {
    const normalized = this.normalize(path);
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    const results = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length).split('/')[0];
      if (relative) results.add(relative);
    }

    for (const dirPath of this.directories) {
      if (!dirPath.startsWith(prefix) || dirPath === normalized) continue;
      const relative = dirPath.slice(prefix.length).split('/')[0];
      if (relative) results.add(relative);
    }

    return Array.from(results);
  }

  async listRecursive(path: string, maxDepth: number): Promise<string[]> {
    const normalized = this.normalize(path);
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    return Array.from(this.files.keys()).filter((filePath) => {
      if (!filePath.startsWith(prefix)) return false;
      const relative = filePath.slice(prefix.length);
      return relative.split('/').filter(Boolean).length <= maxDepth;
    });
  }

  async copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
    const source = this.normalize(sourcePath);
    const target = this.normalize(targetPath);

    await this.ensureDir(target);

    for (const dirPath of Array.from(this.directories)) {
      if (dirPath === source || dirPath.startsWith(`${source}/`)) {
        const suffix = dirPath.slice(source.length);
        await this.ensureDir(`${target}${suffix}`);
      }
    }

    for (const [filePath, content] of Array.from(this.files.entries())) {
      if (filePath === source || filePath.startsWith(`${source}/`)) {
        const suffix = filePath.slice(source.length);
        await this.writeFile(`${target}${suffix}`, content);
      }
    }
  }
}

class InMemoryDaytonaProvider {
  private readonly fileSystems = new Map<string, InMemorySandboxFs>();

  readonly name = 'in-memory-daytona';
  readonly capabilities = {
    supportsPause: true,
    supportsResume: true,
    supportsTimeout: false,
    maxLifetimeMs: Number.MAX_SAFE_INTEGER,
  };

  private getFs(sandboxId: string): InMemorySandboxFs {
    const fs = this.fileSystems.get(sandboxId);
    if (!fs) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }
    return fs;
  }

  async create(): Promise<{ sandboxId: string }> {
    const sandboxId = `test-sandbox-${this.fileSystems.size + 1}`;
    this.fileSystems.set(sandboxId, new InMemorySandboxFs());
    return { sandboxId };
  }

  async connect(sandboxId: string): Promise<{ sandboxId: string }> {
    this.getFs(sandboxId);
    return { sandboxId };
  }

  async pause(_sandboxId: string): Promise<void> {}

  async kill(sandboxId: string): Promise<void> {
    this.fileSystems.delete(sandboxId);
  }

  async getStatus(sandboxId: string): Promise<{ sandboxId: string; state: 'running' }> {
    this.getFs(sandboxId);
    return { sandboxId, state: 'running' };
  }

  async readFile(sandboxId: string, filePath: string): Promise<string> {
    return this.getFs(sandboxId).readFile(filePath);
  }

  async downloadFile(sandboxId: string, filePath: string): Promise<Buffer> {
    const content = await this.getFs(sandboxId).readFile(filePath);
    return Buffer.from(content);
  }

  async listFilesRecursive(sandboxId: string, dirPath: string, maxDepth: number): Promise<string[]> {
    return this.getFs(sandboxId).listRecursive(dirPath, maxDepth);
  }

  async writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
    await this.getFs(sandboxId).writeFile(filePath, content);
  }

  async uploadFile(sandboxId: string, content: string, remotePath: string): Promise<void> {
    await this.getFs(sandboxId).writeFile(remotePath, Buffer.from(content, 'base64').toString('utf8'));
  }

  async createFileSystem(sandboxId: string): Promise<SandboxFileSystem> {
    return this.getFs(sandboxId);
  }

  async executeCommand(sandboxId: string, command: string): Promise<{ result: string; exitCode: number }> {
    const fs = this.getFs(sandboxId);
    const args = (command.match(/'[^']*'|\"[^\"]*\"|\S+/g) || [])
      .map((token) => token.replace(/^['"]|['"]$/g, ''))
      .filter((token) => token !== '2>/dev/null' && token !== '||' && token !== 'true');

    if (args[0] === 'rm' && args[1] === '-rf') {
      for (const targetPath of args.slice(2)) {
        await fs.rm(targetPath, { recursive: true });
      }
      return { result: '', exitCode: 0 };
    }

    if (args[0] === 'cp' && args[1] === '-r' && args.length >= 4) {
      await fs.copyDirectory(args[2], args[3]);
      return { result: '', exitCode: 0 };
    }

    return { result: '', exitCode: 0 };
  }
}

class InMemorySandboxService {
  private readonly provider = new InMemoryDaytonaProvider();
  private readonly sessions = new Map<string, { sandboxId: string; userId: string; status: 'running' }>();

  async getOrCreateSandbox(options: { userId: string }): Promise<{ sandboxId: string; userId: string; status: 'running' }> {
    const existing = this.sessions.get(options.userId);
    if (existing) {
      return existing;
    }

    const sandbox = await this.provider.create();
    const session = { sandboxId: sandbox.sandboxId, userId: options.userId, status: 'running' as const };
    this.sessions.set(options.userId, session);
    return session;
  }

  async getSandboxStatus(userId: string): Promise<{ userId: string; sandboxId: string | null; status: 'running' | 'none' }> {
    const session = this.sessions.get(userId);
    if (!session) {
      return { userId, sandboxId: null, status: 'none' };
    }
    return { userId, sandboxId: session.sandboxId, status: 'running' };
  }

  getProvider(): InMemoryDaytonaProvider {
    return this.provider;
  }

  async getSandboxFs(sandboxId: string): Promise<SandboxFileSystem> {
    return this.provider.createFileSystem(sandboxId);
  }
}

const testSandboxService = new InMemorySandboxService();
setAgentRoutesDeps({ sandboxService: testSandboxService as never });

async function ensureUsersTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      plan_type VARCHAR(50) NOT NULL DEFAULT 'free',
      credits_available INTEGER NOT NULL DEFAULT 10,
      credits_used INTEGER NOT NULL DEFAULT 0,
      credits_reserved INTEGER NOT NULL DEFAULT 0,
      credits_reset_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '1 day',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_login TIMESTAMP WITH TIME ZONE
    )
  `);

  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reserved INTEGER NOT NULL DEFAULT 0
  `);
}

async function cleanupTestData(): Promise<void> {
  await query("DELETE FROM user_api_keys WHERE user_id LIKE 'test_%'");
  await query("DELETE FROM users WHERE user_id LIKE 'test_%'");
}

beforeAll(async () => {
  await ensureUsersTable();
  // Only cleanup at start, not before each test - let individual tests manage their own data
  await cleanupTestData();
});

beforeEach(() => {
  verifyIdTokenMock.mockImplementation(async (token: string) => {
    if (!token) {
      throw new Error('No token provided');
    }

    return {
      uid: token,
      email: `${token}@test.local`,
      name: 'Test User',
    };
  });

  (admin.initializeApp as jest.Mock).mockImplementation(() => ({}));
  (admin.credential.cert as jest.Mock).mockReturnValue({});
  (admin.auth as jest.Mock).mockReturnValue({
    verifyIdToken: verifyIdTokenMock,
  });
});

afterAll(async () => {
  await cleanupTestData();
  await closePool();
});

export function getTestAuthHeaders(userId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${userId}`,
  };
}

export { query, verifyIdTokenMock };
