// Workspace Overview Builder
// Extracts semantic workspace structure from the raw file tree for sidebar mental model

import type { FileNode, WorkspaceOverview, ProjectOverview, ChannelOverview, DocumentOverview } from './types';

type FileReader = (path: string) => Promise<string>;

export async function buildWorkspaceOverview(root: FileNode, readFile?: FileReader): Promise<WorkspaceOverview> {
    const projects = await extractProjects(root, readFile);
    const documents = extractDriveChildren(root, 'file');
    const folders = extractDriveChildren(root, 'directory');
    const agentCount = countChildren(root, 'agents');
    const activity = extractRecentActivity(projects);

    return {
        projects,
        documents,
        folders,
        activity,
        stats: {
            agentCount,
            projectCount: projects.length,
            documentCount: documents.length,
            folderCount: folders.length,
        },
    };
}

async function extractProjects(root: FileNode, readFile?: FileReader): Promise<ProjectOverview[]> {
    const projectsDir = root.children?.find(c => c.name === 'projects' && c.type === 'directory');
    if (!projectsDir?.children) return [];

    const projects: ProjectOverview[] = [];

    for (const project of projectsDir.children) {
        if (project.type !== 'directory' || project.name === '.gitkeep') continue;

        const channelsDir = project.children?.find(c => c.name === 'channels' && c.type === 'directory');
        const channels: ChannelOverview[] = [];

        for (const channel of channelsDir?.children || []) {
            if (channel.type !== 'directory') continue;

            const outputDir = channel.children?.find(c => c.name === 'output' && c.type === 'directory');
            const deliverablesDir = outputDir?.children?.find(c => c.name === 'deliverables' && c.type === 'directory');
            const deliverables = (deliverablesDir?.children || [])
                .filter(c => c.type === 'file' && c.name.endsWith('.md'))
                .map(f => {
                    const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})/);
                    return { file: f.name, date: dateMatch?.[1] || '' };
                })
                .sort((a, b) => b.date.localeCompare(a.date));

            // Targeted read of shift.yaml for agent assignments (not generic previews)
            const agents = await extractAgentsFromChannel(channel, readFile);
            channels.push({ name: channel.name, path: channel.path, agents, deliverables });
        }

        const slug = project.name;
        const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        projects.push({ name, slug, path: project.path, channels });
    }

    return projects;
}

async function extractAgentsFromChannel(channel: FileNode, readFile?: FileReader): Promise<string[]> {
    const shiftFile = channel.children?.find(c => c.name === 'shift.yaml' && c.type === 'file');
    if (!shiftFile || !readFile) return [];

    const content = await readFile(shiftFile.path);
    if (!content) return [];

    // Use matchAll with capture group — avoids string replace and truncation bugs
    const matches = [...content.matchAll(/assignee:\s*(\S+)/g)];
    return [...new Set(matches.map(m => m[1]))];
}

function extractDriveChildren(root: FileNode, type: 'file' | 'directory'): DocumentOverview[] {
    const driveDir = root.children?.find(c => c.name === 'drive' && c.type === 'directory');
    if (!driveDir?.children) return [];

    return driveDir.children
        .filter(c => c.type === type && c.name !== '.gitkeep')
        .map(c => ({ name: c.name, path: c.path }));
}

function countChildren(root: FileNode, dirName: string): number {
    const dir = root.children?.find(c => c.name === dirName && c.type === 'directory');
    if (!dir?.children) return 0;
    return dir.children.filter(c => c.type === 'directory').length;
}

function extractRecentActivity(projects: ProjectOverview[]): { agent: string; file: string; channel: string; date: string }[] {
    const activity: { agent: string; file: string; channel: string; date: string }[] = [];

    for (const project of projects) {
        for (const channel of project.channels) {
            for (const deliverable of channel.deliverables.slice(0, 3)) {
                const agent = channel.agents[0] || 'agent';
                activity.push({ agent, file: deliverable.file, channel: channel.name, date: deliverable.date });
            }
        }
    }

    return activity.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
}
