// Agent Behavior Test Workspace Builder
// Creates a temporary workspace with essential files for agent behavior tests.

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export const WORKSPACE_TEMPLATE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'xerus-workspace');

export function hasBash(): boolean {
    try { execSync('bash --version', { stdio: 'pipe' }); return true; } catch { return false; }
}

interface HookResult { stdout: string; stderr: string; exitCode: number }

export interface AgentWorkspace {
    root: string;
    agentDir(slug: string): string;
    memoryDir(slug: string): string;
    channelDir(domain: string, channel: string): string;
    readFile(relativePath: string): Promise<string>;
    fileExists(relativePath: string): Promise<boolean>;
    writeFile(relativePath: string, content: string): Promise<void>;
    runScaffoldHook(toolName: string, filePath: string): HookResult;
    cleanup(): Promise<void>;
}

export async function createTestWorkspace(): Promise<AgentWorkspace> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xerus-agent-test-'));

    const dirs = [
        '.claude/agents/xerus-master',
        '.claude/agents/xerus-cto',
        '.claude/hooks/scripts',
        '.claude/skills',
        '.xerus/templates/agent',
        'agents',
        '.memory/agents/xerus-master',
        '.memory/agents/xerus-cto',
        'drive',
        'data',
        'projects',
    ];
    for (const dir of dirs) {
        await fs.mkdir(path.join(root, dir), { recursive: true });
    }

    await fs.copyFile(
        path.join(WORKSPACE_TEMPLATE, 'CLAUDE.md'),
        path.join(root, 'CLAUDE.md'),
    );

    const masterFiles = ['config.json', 'CLAUDE.md', 'SOUL.md', 'BOOTSTRAP.md', 'OPERATING.md', 'STATUS.md', 'USER.md', 'RELATIONSHIPS.md', 'HEARTBEAT.md'];
    for (const file of masterFiles) {
        const src = path.join(WORKSPACE_TEMPLATE, '.claude', 'agents', 'xerus-master', file);
        const dst = path.join(root, '.claude', 'agents', 'xerus-master', file);
        try { await fs.copyFile(src, dst); } catch { /* File might not exist in template */ }
    }

    try {
        await fs.copyFile(
            path.join(WORKSPACE_TEMPLATE, 'drive', 'company.md'),
            path.join(root, 'drive', 'company.md'),
        );
    } catch {
        await fs.writeFile(path.join(root, 'drive', 'company.md'), '# Company\n\n## Vision\n{TODO}\n');
    }

    await fs.writeFile(
        path.join(root, '.memory', 'agents', 'xerus-master', 'working.md'),
        '# Working Context\n\n(session not started)\n',
    );

    await fs.writeFile(path.join(root, 'data', 'activity.jsonl'), '');

    const hookScripts = ['scaffold-sync-hook.sh', '_lib.sh'];
    for (const script of hookScripts) {
        const src = path.join(WORKSPACE_TEMPLATE, '.claude', 'hooks', 'scripts', script);
        const dst = path.join(root, '.claude', 'hooks', 'scripts', script);
        try { await fs.copyFile(src, dst); } catch { /* Script might not exist */ }
    }

    const templateDir = path.join(WORKSPACE_TEMPLATE, '.xerus', 'templates', 'agent');
    try {
        const templates = await fs.readdir(templateDir);
        for (const tmpl of templates) {
            await fs.copyFile(
                path.join(templateDir, tmpl),
                path.join(root, '.xerus', 'templates', 'agent', tmpl),
            );
        }
    } catch { /* Templates dir might not exist */ }

    const toMsysPath = (p: string): string => {
        if (process.platform !== 'win32') return p;
        return p.replace(/\\/g, '/').replace(/^([A-Z]):/i, (_, drive: string) => `/${drive.toLowerCase()}`);
    };

    const msysRoot = toMsysPath(root);

    const runScaffoldHook = (toolName: string, filePath: string): HookResult => {
        const hookPath = toMsysPath(path.join(root, '.claude', 'hooks', 'scripts', 'scaffold-sync-hook.sh'));
        const msysFilePath = toMsysPath(filePath);
        const hookInput = JSON.stringify({ tool_input: { file_path: msysFilePath } });
        const env = {
            ...process.env,
            XERUS_WORKSPACE_ROOT: msysRoot,
            XERUS_AGENT_SLUG: 'xerus-master',
            CLAUDE_TOOL_NAME: toolName,
            PATH: process.env.PATH || '',
            HOME: process.env.HOME || os.homedir(),
        };
        try {
            const stdout = execSync(
                `echo '${hookInput.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
                { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 },
            ).toString();
            return { stdout, stderr: '', exitCode: 0 };
        } catch (err: unknown) {
            const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
            return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', exitCode: e.status || 1 };
        }
    };

    return {
        root,
        agentDir: (slug) => path.join(root, 'agents', slug),
        memoryDir: (slug) => path.join(root, '.memory', 'agents', slug),
        channelDir: (domain, channel) => path.join(root, 'projects', domain, 'channels', channel),
        readFile: (rel) => fs.readFile(path.join(root, rel), 'utf-8'),
        fileExists: (rel) => fs.access(path.join(root, rel)).then(() => true).catch(() => false),
        writeFile: async (rel, content) => {
            await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
            await fs.writeFile(path.join(root, rel), content);
        },
        runScaffoldHook,
        cleanup: () => fs.rm(root, { recursive: true, force: true }),
    };
}
