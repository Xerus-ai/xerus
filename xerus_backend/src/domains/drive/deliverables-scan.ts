// Deliverables Scan
// Reads the sandbox filesystem and workspace.db to discover projects/channels and the
// deliverable files agents produce. Pairs with deliverables-projection.ts, which turns
// this data into the virtual drive tree.
//
// Two write locations are supported (see xerus-workspace/CLAUDE.md):
//   - Per-channel (preferred): projects/<domain>/channels/<channel>/output/deliverables/<file>
//   - Top-level:               output/deliverables/<file>

import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type { FileNode } from './types';
import { logger } from '../../utils/logger';

const log = logger('DeliverablesScan');

const DELIVERABLES_ROOT = 'projects';
const DELIVERABLES_LIST_DEPTH = 6; // <domain>/channels/<channel>/output/deliverables/<file> = 6 levels under projects/
const TOP_LEVEL_LIST_DEPTH = 4; // output/deliverables/<...>/<file> — allow a few subfolders

/**
 * Top-level deliverables location. The workspace CLAUDE.md documents output/deliverables/
 * as a valid write location (per-channel is preferred, but non-channel work lands here).
 * Shared with the projection so both agree on the same contract.
 */
export const TOP_LEVEL_DELIVERABLES_PATH = 'output/deliverables';

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

export interface DeliverableFile {
    /**
     * Real workspace-relative path. Per-channel deliverables live at
     * projects/<domain>/channels/<channel>/output/deliverables/<name>; top-level
     * deliverables live at output/deliverables/<name>.
     */
    realPath: string;
    /** Present for per-channel deliverables; absent for top-level output/deliverables/. */
    domainSlug?: string;
    /** Present for per-channel deliverables; absent for top-level output/deliverables/. */
    channelSlug?: string;
    fileName: string;
    size?: number;
    modified?: string;
}

// -----------------------------------------------------------------------------
// Loading display names from workspace.db + on-disk discovery
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
        // workspace.db may not exist yet on a brand-new sandbox — carry on with an empty
        // map; filesystem discovery below still lets on-disk projects project.
        log.warn('Failed to load project map from workspace.db', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    // Discover on-disk projects/channels so file-created projects (absent from workspace.db)
    // still project their deliverables and reverse-resolve. DB display names win; discovered
    // entries fall back to the slug so nothing is silently hidden.
    await discoverProjectsFromFilesystem(provider, sandboxId, map);

    return map;
}

/**
 * Scan projects/<domain>/channels/<channel> directories and register any that are
 * missing from the map (using the slug as the display name). This is the automation
 * that closes the "unregistered project/channel" gap without writing to workspace.db —
 * it re-runs on every load, so it survives fresh deploys and new environments.
 */
async function discoverProjectsFromFilesystem(
    provider: DaytonaProvider,
    sandboxId: string,
    map: ProjectMap,
): Promise<void> {
    const projectsRoot = `${SANDBOX_CONFIG.workspacePath}/${DELIVERABLES_ROOT}`;
    let output: string;
    try {
        const res = await provider.executeCommand(
            sandboxId,
            `find ${projectsRoot} -mindepth 3 -maxdepth 3 -type d -path '*/channels/*' 2>/dev/null || true`,
        );
        output = res.result ?? '';
    } catch (err) {
        log.warn('Failed to discover projects from filesystem', {
            error: err instanceof Error ? err.message : String(err),
        });
        return;
    }

    const prefixLen = projectsRoot.endsWith('/') ? projectsRoot.length : projectsRoot.length + 1;
    for (const line of output.trim().split('\n')) {
        const absolute = line.trim();
        if (!absolute) continue;
        const relative = absolute.startsWith(projectsRoot) ? absolute.slice(prefixLen) : absolute;
        const match = relative.match(/^([^/]+)\/channels\/([^/]+)$/);
        if (!match) continue;
        const [, domainSlug, channelSlug] = match;

        let project = map.get(domainSlug);
        if (!project) {
            project = { slug: domainSlug, name: domainSlug, channels: new Map() };
            map.set(domainSlug, project);
        }
        if (!project.channels.has(channelSlug)) {
            project.channels.set(channelSlug, channelSlug);
        }
    }
}

// -----------------------------------------------------------------------------
// Listing real deliverable files
// -----------------------------------------------------------------------------

/**
 * Walks an already-built tree to collect deliverable files from both the per-channel
 * path and the top-level output/deliverables/ path.
 */
export function collectDeliverablesFromTree(root: FileNode): DeliverableFile[] {
    const files: DeliverableFile[] = [];

    const visit = (node: FileNode) => {
        if (node.type === 'file') {
            const perChannel = node.path.match(
                /^projects\/([^/]+)\/channels\/([^/]+)\/output\/deliverables\/(.+)$/,
            );
            if (perChannel) {
                files.push({
                    realPath: node.path,
                    domainSlug: perChannel[1],
                    channelSlug: perChannel[2],
                    fileName: perChannel[3],
                    size: node.size,
                    modified: node.modified,
                });
            } else {
                const topLevel = node.path.match(/^output\/deliverables\/(.+)$/);
                if (topLevel) {
                    files.push({
                        realPath: node.path,
                        fileName: topLevel[1],
                        size: node.size,
                        modified: node.modified,
                    });
                }
            }
        }
        node.children?.forEach(visit);
    };

    visit(root);
    return files;
}

/**
 * Load deliverable files directly via a deeper listing. Used because deliverables live
 * below the default tree depth. Scans both the per-channel path (6 levels under projects/)
 * and the top-level output/deliverables/ path.
 */
export async function loadDeliverablesDeep(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<DeliverableFile[]> {
    const wp = SANDBOX_CONFIG.workspacePath;
    const results: DeliverableFile[] = [];

    // Per-channel deliverables under projects/<domain>/channels/<channel>/output/deliverables/
    const projectsRoot = `${wp}/${DELIVERABLES_ROOT}`;
    try {
        const files = await provider.listFilesRecursive(sandboxId, projectsRoot, DELIVERABLES_LIST_DEPTH);
        const prefixLen = projectsRoot.endsWith('/') ? projectsRoot.length : projectsRoot.length + 1;
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
    } catch (err) {
        log.warn('Failed to list per-channel deliverables', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    // Top-level deliverables under output/deliverables/ (workspace CLAUDE.md default location)
    const topLevelRoot = `${wp}/${TOP_LEVEL_DELIVERABLES_PATH}`;
    try {
        const files = await provider.listFilesRecursive(sandboxId, topLevelRoot, TOP_LEVEL_LIST_DEPTH);
        const prefixLen = topLevelRoot.endsWith('/') ? topLevelRoot.length : topLevelRoot.length + 1;
        for (const absolute of files) {
            const relative = absolute.startsWith(topLevelRoot) ? absolute.slice(prefixLen) : absolute;
            if (!relative) continue;
            results.push({
                realPath: `${TOP_LEVEL_DELIVERABLES_PATH}/${relative}`,
                fileName: relative,
            });
        }
    } catch (err) {
        log.warn('Failed to list top-level deliverables', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return results;
}
