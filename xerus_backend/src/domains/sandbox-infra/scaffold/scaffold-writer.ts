// Scaffold Writer
// Writes scaffold files to the workspace filesystem
// Used by both handleCreateAgent() (inside runner) and scaffold_agent command handler
// Paths in the files array are workspace-relative (e.g., "agents/{slug}/config.json")

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export async function scaffoldAgent(
    workspacePath: string,
    files: Array<{ path: string; content: string }>,
): Promise<number> {
    for (const file of files) {
        const fullPath = path.join(workspacePath, file.path);
        try {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content);
        } catch (error) {
            throw new Error(
                `Failed to write scaffold file '${file.path}': ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    // Ensure required agent subdirectories exist (inbox, knowledge)
    const firstPath = files[0]?.path;
    if (firstPath?.startsWith('agents/')) {
        const slug = firstPath.split('/')[1];
        const agentDir = path.join(workspacePath, 'agents', slug);

        const requiredDirs = [
            path.join(agentDir, 'inbox', 'processed'),
            path.join(agentDir, 'knowledge'),
        ];

        for (const dir of requiredDirs) {
            await fs.mkdir(dir, { recursive: true });
            // Verify the directory was actually created
            if (!fsSync.existsSync(dir)) {
                throw new Error(`Failed to create agent directory: ${dir}`);
            }
        }

        // Update agents/index.json so other agents can discover this one
        await updateAgentsIndex(workspacePath, slug, files);
    }

    return files.length;
}

async function updateAgentsIndex(
    workspacePath: string,
    slug: string,
    files: Array<{ path: string; content: string }>,
): Promise<void> {
    const configFile = files.find(f => f.path === `agents/${slug}/config.json`);
    if (!configFile) return;

    const config = JSON.parse(configFile.content);
    const indexPath = path.join(workspacePath, 'agents', 'index.json');

    let index: Record<string, unknown> = {};
    try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
            index = parsed;
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        // No existing index file — start fresh
    }

    const agents = (index.agents || {}) as Record<string, unknown>;
    agents[slug] = {
        name: config.name,
        domain: config.domain,
        primary_channel: config.primary_channel,
        channels: config.channels,
        model: config.model,
        role: config.role,
    };
    index.agents = agents;
    index.updated_at = new Date().toISOString();

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');

    // Verify the write succeeded by reading back
    const verification = await fs.readFile(indexPath, 'utf-8');
    const verified = JSON.parse(verification);
    if (!verified.agents?.[slug]) {
        throw new Error(`agents/index.json verification failed: ${slug} not found after write`);
    }
}
