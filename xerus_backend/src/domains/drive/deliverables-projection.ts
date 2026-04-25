// Deliverables Projection
// Surface agent deliverables inside the user's drive view without moving them on disk.
//
// Real layout (unchanged — agents still write here, organized per channel):
//   projects/<domain-slug>/channels/<channel-slug>/output/deliverables/<file>
//
// Virtual projection exposed in the tree:
//   drive/<Project Display Name>/<file>                           (project has 1 channel — collapsed)
//   drive/<Project Display Name>/<Channel Display Name>/<file>    (project has 2+ channels)
//
// Display names come from workspace.db (domains.name, channels.name). Slugs stay on disk;
// users see the names they picked. Projection is read-only — writes to virtual paths
// aren't routed back to the real filesystem; reads translate the virtual path on the way in.

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type { FileNode } from './types';
import { logger } from '../../utils/logger';

const log = logger('DeliverablesProjection');

const DELIVERABLES_ROOT = 'projects';
const DELIVERABLES_LIST_DEPTH = 5; // projects/<domain>/channels/<channel>/output/deliverables/<file>

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DomainRow { slug: string; name: string }
interface ChannelRow { slug: string; name: string; domain_slug: string }

export interface ProjectMapEntry {
    /** Display name (e.g., "Marketing") */
    name: string;
    /** Domain slug on disk (e.g., "marketing-dept") */
    slug: string;
    /** channel slug -> display name */
    channels: Map<string, string>;
}

/** Map of domain slug -> project entry. Built once per tree request. */
export type ProjectMap = Map<string, ProjectMapEntry>;

// -----------------------------------------------------------------------------
// Loading display names from workspace.db
// -----------------------------------------------------------------------------

export async function loadProjectMap(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<ProjectMap> {
    const map: ProjectMap = new Map();

    try {
        const domains = await executeWorkspaceJsonQuery<DomainRow>(
            provider, sandboxId,
            `SELECT slug, name FROM domains ORDER BY slug;`,
        );
        for (const d of domains) {
            map.set(d.slug, { slug: d.slug, name: d.name, channels: new Map() });
        }

        const channels = await executeWorkspaceJsonQuery<ChannelRow>(
            provider, sandboxId,
            `SELECT slug, name, domain_slug FROM channels ORDER BY slug;`,
        );
        for (const c of channels) {
            const project = map.get(c.domain_slug);
            if (project) project.channels.set(c.slug, c.name);
        }
    } catch (err) {
        // workspace.db may not exist yet on a brand-new sandbox — return empty map, projection is skipped.
        log.warn('Failed to load project map', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return map;
}

// -----------------------------------------------------------------------------
// Listing real deliverable files
// -----------------------------------------------------------------------------

export interface DeliverableFile {
    /** Real workspace-relative path: projects/<domain>/channels/<channel>/output/deliverables/<name> */
    realPath: string;
    domainSlug: string;
    channelSlug: string;
    fileName: string;
    size?: number;
    modified?: string;
}

/**
 * Walks the tree to collect every file living under
 * projects/<x>/channels/<y>/output/deliverables/. We scan the already-built tree
 * instead of a second listFilesRecursive call when possible.
 */
export function collectDeliverablesFromTree(root: FileNode): DeliverableFile[] {
    const files: DeliverableFile[] = [];

    const visit = (node: FileNode) => {
        if (node.type === 'file') {
            const match = node.path.match(
                /^projects\/([^/]+)\/channels\/([^/]+)\/output\/deliverables\/(.+)$/,
            );
            if (match) {
                files.push({
                    realPath: node.path,
                    domainSlug: match[1],
                    channelSlug: match[2],
                    fileName: match[3],
                    size: node.size,
                    modified: node.modified,
                });
            }
        }
        node.children?.forEach(visit);
    };

    visit(root);
    return files;
}

/**
 * Fallback: load deliverable files directly via a deeper listing on the projects/ subtree.
 * Used when the tree's maxDepth cut off deliverables (they live 6 levels deep under workspace root).
 */
export async function loadDeliverablesDeep(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<DeliverableFile[]> {
    const projectsRoot = `${SANDBOX_CONFIG.workspacePath}/${DELIVERABLES_ROOT}`;
    let files: string[];
    try {
        files = await provider.listFilesRecursive(sandboxId, projectsRoot, DELIVERABLES_LIST_DEPTH);
    } catch (err) {
        log.warn('Failed to list deliverables', {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }

    const prefixLen = projectsRoot.endsWith('/') ? projectsRoot.length : projectsRoot.length + 1;
    const results: DeliverableFile[] = [];
    for (const absolute of files) {
        const relativeToProjects = absolute.startsWith(projectsRoot) ? absolute.slice(prefixLen) : absolute;
        const match = relativeToProjects.match(
            /^([^/]+)\/channels\/([^/]+)\/output\/deliverables\/(.+)$/,
        );
        if (!match) continue;
        results.push({
            realPath: `${DELIVERABLES_ROOT}/${relativeToProjects}`,
            domainSlug: match[1],
            channelSlug: match[2],
            fileName: match[3],
        });
    }
    return results;
}

// -----------------------------------------------------------------------------
// Injecting virtual nodes into the tree
// -----------------------------------------------------------------------------

/**
 * Mutates root by adding virtual project folders under drive/.
 * Safe to call with an empty ProjectMap (no-op).
 */
export function injectDeliverablesProjection(
    root: FileNode,
    deliverables: DeliverableFile[],
    projectMap: ProjectMap,
): void {
    if (projectMap.size === 0 || deliverables.length === 0) return;

    // Ensure drive/ exists in the tree
    const drive = getOrCreateChild(root, 'drive', 'drive');

    // Group deliverables by project (domain slug)
    const byProject = new Map<string, DeliverableFile[]>();
    for (const file of deliverables) {
        if (!projectMap.has(file.domainSlug)) continue; // orphan project — skip silently
        const list = byProject.get(file.domainSlug) ?? [];
        list.push(file);
        byProject.set(file.domainSlug, list);
    }

    for (const [domainSlug, files] of byProject) {
        const project = projectMap.get(domainSlug)!;
        const projectFolderName = sanitizeDisplayName(project.name, domainSlug);

        // Skip if the user has a real drive folder with the same name — real wins.
        if (drive.children?.some(c => c.name === projectFolderName)) {
            log.debug('Skipping projection — real drive entry exists', {
                name: projectFolderName, slug: domainSlug,
            });
            continue;
        }

        // Count distinct channels with deliverables so we know whether to collapse
        const channelsWithFiles = new Set(files.map(f => f.channelSlug));
        const collapse = channelsWithFiles.size === 1;

        const projectNode: FileNode = {
            name: projectFolderName,
            type: 'directory',
            path: `drive/${projectFolderName}`,
            children: [],
        };

        for (const file of files) {
            const channelName = project.channels.get(file.channelSlug);
            if (!channelName) continue; // unknown channel — skip

            let parent = projectNode;
            if (!collapse) {
                const channelFolderName = sanitizeDisplayName(channelName, file.channelSlug);
                parent = getOrCreateChild(
                    projectNode,
                    channelFolderName,
                    `${projectNode.path}/${channelFolderName}`,
                );
            }

            parent.children!.push({
                name: file.fileName,
                type: 'file',
                path: `${parent.path}/${file.fileName}`,
                size: file.size,
                modified: file.modified,
            });
        }

        if (projectNode.children!.length > 0) {
            drive.children!.push(projectNode);
        }
    }

    // Keep drive children sorted: user files first (alphabetical), then projected project folders (alphabetical).
    // Simpler rule: sort all alphabetically, directories first — matches how the rest of the tree sorts.
    drive.children!.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

// -----------------------------------------------------------------------------
// Reverse resolution: virtual path -> real path
// -----------------------------------------------------------------------------

/**
 * Given a user-supplied path, determine if it's a virtual deliverable projection
 * and return the real workspace path it maps to. Returns null if the path is not virtual.
 */
export function resolveVirtualDeliverablePath(
    virtualPath: string,
    projectMap: ProjectMap,
): string | null {
    const normalized = virtualPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const match = normalized.match(/^drive\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const projectFolderName = match[1];
    const tail = match[2];

    // Match project by sanitized display name
    const project = findProjectByFolderName(projectMap, projectFolderName);
    if (!project) return null;

    // Case 1: collapsed layout — tail is just a filename
    // Case 2: expanded layout — tail is "<ChannelName>/<file>"
    const tailMatch = tail.match(/^([^/]+)\/(.+)$/);
    if (tailMatch) {
        const channelFolderName = tailMatch[1];
        const fileName = tailMatch[2];
        const channelSlug = findChannelSlugByFolderName(project, channelFolderName);
        if (!channelSlug) return null;
        return `projects/${project.slug}/channels/${channelSlug}/output/deliverables/${fileName}`;
    }

    // Collapsed: tail is the filename; project must have exactly one channel
    if (project.channels.size !== 1) return null;
    const onlyChannelSlug = project.channels.keys().next().value as string;
    return `projects/${project.slug}/channels/${onlyChannelSlug}/output/deliverables/${tail}`;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Produce a safe display name for a folder. Strips path-unsafe characters and
 * falls back to the slug if the result is empty. Users only see this string —
 * agents never do — so it can be human-readable.
 */
function sanitizeDisplayName(name: string, fallbackSlug: string): string {
    const trimmed = name.trim().replace(/[/\\\0]/g, ' ').replace(/\s+/g, ' ');
    if (!trimmed || trimmed.startsWith('.')) return fallbackSlug;
    return trimmed;
}

function getOrCreateChild(parent: FileNode, name: string, path: string): FileNode {
    parent.children ??= [];
    const existing = parent.children.find(c => c.name === name && c.type === 'directory');
    if (existing) return existing;
    const node: FileNode = { name, type: 'directory', path, children: [] };
    parent.children.push(node);
    return node;
}

function findProjectByFolderName(projectMap: ProjectMap, folderName: string): ProjectMapEntry | null {
    for (const project of projectMap.values()) {
        if (sanitizeDisplayName(project.name, project.slug) === folderName) return project;
    }
    return null;
}

function findChannelSlugByFolderName(project: ProjectMapEntry, folderName: string): string | null {
    for (const [slug, name] of project.channels) {
        if (sanitizeDisplayName(name, slug) === folderName) return slug;
    }
    return null;
}
