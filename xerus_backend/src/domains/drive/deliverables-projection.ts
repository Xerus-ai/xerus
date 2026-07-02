// Deliverables Projection
// Surface agent deliverables inside the user's drive view without moving them on disk.
//
// Real layout (unchanged — agents still write here):
//   projects/<domain-slug>/channels/<channel-slug>/output/deliverables/<file>   (per-channel, preferred)
//   output/deliverables/<file>                                                  (top-level)
//
// Virtual projection exposed in the tree:
//   drive/<Project Display Name>/<file>                           (project has 1 channel — collapsed)
//   drive/<Project Display Name>/<Channel Display Name>/<file>    (project has 2+ channels)
//   drive/Deliverables/<file>                                     (top-level output/deliverables/)
//
// Display names come from workspace.db (domains.name, channels.name), falling back to the
// slug for on-disk projects not yet registered. Slugs stay on disk; users see friendly names.
// Projection is read-only — reads/writes translate the virtual path back to the real path.
//
// Filesystem/DB scanning lives in deliverables-scan.ts and is re-exported here so callers
// have a single entry point.

import type { FileNode } from './types';
import { logger } from '../../utils/logger';
import {
    TOP_LEVEL_DELIVERABLES_PATH,
    type DeliverableFile,
    type ProjectMap,
    type ProjectMapEntry,
} from './deliverables-scan';

export {
    loadProjectMap,
    loadDeliverablesDeep,
    collectDeliverablesFromTree,
} from './deliverables-scan';
export type { DeliverableFile, ProjectMap, ProjectMapEntry } from './deliverables-scan';

const log = logger('DeliverablesProjection');

/** Virtual drive folder that top-level output/deliverables/ files project into. */
const TOP_LEVEL_DELIVERABLES_FOLDER = 'Deliverables';

// -----------------------------------------------------------------------------
// Injecting virtual nodes into the tree
// -----------------------------------------------------------------------------

/**
 * Mutates root by adding virtual deliverable folders under drive/. Handles both
 * per-channel deliverables (grouped by project) and top-level output/deliverables/
 * (grouped under a single "Deliverables" folder). Safe to call with an empty map.
 */
export function injectDeliverablesProjection(
    root: FileNode,
    deliverables: DeliverableFile[],
    projectMap: ProjectMap,
): void {
    if (deliverables.length === 0) return;

    // Ensure drive/ exists in the tree
    const drive = getOrCreateChild(root, 'drive', 'drive');

    injectPerChannelDeliverables(drive, deliverables.filter(f => f.domainSlug), projectMap);
    injectTopLevelDeliverables(drive, deliverables.filter(f => !f.domainSlug));

    // Keep drive children sorted: directories first, then alphabetical — matches how the
    // rest of the tree sorts.
    drive.children!.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

/**
 * Project per-channel deliverables into drive/<Project>/[<Channel>/]<file>. Missing
 * project/channel display names fall back to the slug so unregistered (file-created)
 * projects still surface rather than being silently dropped.
 */
function injectPerChannelDeliverables(
    drive: FileNode,
    files: DeliverableFile[],
    projectMap: ProjectMap,
): void {
    const byProject = new Map<string, DeliverableFile[]>();
    for (const file of files) {
        const list = byProject.get(file.domainSlug!) ?? [];
        list.push(file);
        byProject.set(file.domainSlug!, list);
    }

    for (const [domainSlug, projectFiles] of byProject) {
        const project = projectMap.get(domainSlug);
        const projectFolderName = sanitizeDisplayName(project?.name ?? domainSlug, domainSlug);

        // Skip if the user has a real drive folder with the same name — real wins.
        if (drive.children?.some(c => c.name === projectFolderName)) {
            log.debug('Skipping projection — real drive entry exists', {
                name: projectFolderName, slug: domainSlug,
            });
            continue;
        }

        // Count distinct channels with deliverables so we know whether to collapse
        const channelsWithFiles = new Set(projectFiles.map(f => f.channelSlug));
        const collapse = channelsWithFiles.size === 1;

        const projectNode: FileNode = {
            name: projectFolderName,
            type: 'directory',
            path: `drive/${projectFolderName}`,
            children: [],
        };

        for (const file of projectFiles) {
            const channelName = project?.channels.get(file.channelSlug!) ?? file.channelSlug!;

            let parent = projectNode;
            if (!collapse) {
                const channelFolderName = sanitizeDisplayName(channelName, file.channelSlug!);
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
}

/**
 * Project top-level output/deliverables/ files into a single drive/Deliverables/ folder.
 * Skips if a real drive folder of the same name already exists — real wins.
 */
function injectTopLevelDeliverables(drive: FileNode, files: DeliverableFile[]): void {
    if (files.length === 0) return;
    if (drive.children?.some(c => c.name === TOP_LEVEL_DELIVERABLES_FOLDER)) {
        log.debug('Skipping top-level deliverables projection — real drive entry exists', {
            name: TOP_LEVEL_DELIVERABLES_FOLDER,
        });
        return;
    }

    const folder: FileNode = {
        name: TOP_LEVEL_DELIVERABLES_FOLDER,
        type: 'directory',
        path: `drive/${TOP_LEVEL_DELIVERABLES_FOLDER}`,
        children: [],
    };

    for (const file of files) {
        folder.children!.push({
            name: file.fileName,
            type: 'file',
            path: `${folder.path}/${file.fileName}`,
            size: file.size,
            modified: file.modified,
        });
    }

    if (folder.children!.length > 0) {
        drive.children!.push(folder);
    }
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

    // Match project by sanitized display name. A real project takes priority over the
    // top-level Deliverables alias, mirroring the "real wins" rule in the forward projection.
    const project = findProjectByFolderName(projectMap, projectFolderName);
    if (!project) {
        // Top-level deliverables alias: drive/Deliverables/<tail> -> output/deliverables/<tail>
        if (projectFolderName === TOP_LEVEL_DELIVERABLES_FOLDER) {
            return `${TOP_LEVEL_DELIVERABLES_PATH}/${tail}`;
        }
        return null;
    }

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
