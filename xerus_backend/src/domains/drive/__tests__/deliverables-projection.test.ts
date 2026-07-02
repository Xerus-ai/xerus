// Deliverables Projection Tests
// Validates the path contract between where agents write deliverables and where
// the drive UI surfaces them. Two write locations are supported:
//   - Per-channel (preferred): projects/<domain>/channels/<channel>/output/deliverables/<file>
//   - Top-level (workspace CLAUDE.md default): output/deliverables/<file>
// Both must project into drive/ and reverse-resolve back to their real path.
// Pure functions — no sandbox, no mocks.

import {
    collectDeliverablesFromTree,
    injectDeliverablesProjection,
    resolveVirtualDeliverablePath,
    type DeliverableFile,
    type ProjectMap,
} from '../deliverables-projection';
import type { FileNode } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoot(): FileNode {
    return { name: 'workspace', type: 'directory', path: '', children: [] };
}

function makeProjectMap(
    entries: Array<{ slug: string; name: string; channels: Array<[string, string]> }>,
): ProjectMap {
    const map: ProjectMap = new Map();
    for (const e of entries) {
        map.set(e.slug, { slug: e.slug, name: e.name, channels: new Map(e.channels) });
    }
    return map;
}

function findNode(node: FileNode, path: string): FileNode | null {
    if (node.path === path) return node;
    for (const child of node.children ?? []) {
        const found = findNode(child, path);
        if (found) return found;
    }
    return null;
}

// ---------------------------------------------------------------------------
// collectDeliverablesFromTree
// ---------------------------------------------------------------------------

describe('collectDeliverablesFromTree', () => {
    it('collects per-channel deliverables with domain and channel slugs', () => {
        const root: FileNode = {
            name: 'workspace',
            type: 'directory',
            path: '',
            children: [{
                name: 'post.md',
                type: 'file',
                path: 'projects/marketing/channels/marketing--blog/output/deliverables/post.md',
                size: 42,
            }],
        };

        const files = collectDeliverablesFromTree(root);

        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
            realPath: 'projects/marketing/channels/marketing--blog/output/deliverables/post.md',
            domainSlug: 'marketing',
            channelSlug: 'marketing--blog',
            fileName: 'post.md',
            size: 42,
        });
    });

    it('collects top-level output/deliverables/ files without slugs', () => {
        const root: FileNode = {
            name: 'workspace',
            type: 'directory',
            path: '',
            children: [{
                name: 'report.md',
                type: 'file',
                path: 'output/deliverables/report.md',
            }],
        };

        const files = collectDeliverablesFromTree(root);

        expect(files).toHaveLength(1);
        expect(files[0].realPath).toBe('output/deliverables/report.md');
        expect(files[0].fileName).toBe('report.md');
        expect(files[0].domainSlug).toBeUndefined();
        expect(files[0].channelSlug).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// injectDeliverablesProjection
// ---------------------------------------------------------------------------

describe('injectDeliverablesProjection', () => {
    it('projects top-level deliverables into drive/Deliverables/', () => {
        const root = makeRoot();
        const deliverables: DeliverableFile[] = [
            { realPath: 'output/deliverables/report.md', fileName: 'report.md' },
        ];

        injectDeliverablesProjection(root, deliverables, new Map());

        const node = findNode(root, 'drive/Deliverables/report.md');
        expect(node).not.toBeNull();
        expect(node!.type).toBe('file');
    });

    it('collapses a single-channel project under drive/<Project>/', () => {
        const root = makeRoot();
        const map = makeProjectMap([
            { slug: 'marketing', name: 'Marketing', channels: [['marketing--blog', 'Blog']] },
        ]);
        const deliverables: DeliverableFile[] = [{
            realPath: 'projects/marketing/channels/marketing--blog/output/deliverables/post.md',
            domainSlug: 'marketing',
            channelSlug: 'marketing--blog',
            fileName: 'post.md',
        }];

        injectDeliverablesProjection(root, deliverables, map);

        expect(findNode(root, 'drive/Marketing/post.md')).not.toBeNull();
    });

    it('expands a multi-channel project into channel subfolders', () => {
        const root = makeRoot();
        const map = makeProjectMap([
            { slug: 'eng', name: 'Engineering', channels: [['eng--api', 'API'], ['eng--web', 'Web']] },
        ]);
        const deliverables: DeliverableFile[] = [
            { realPath: 'projects/eng/channels/eng--api/output/deliverables/api.md', domainSlug: 'eng', channelSlug: 'eng--api', fileName: 'api.md' },
            { realPath: 'projects/eng/channels/eng--web/output/deliverables/web.md', domainSlug: 'eng', channelSlug: 'eng--web', fileName: 'web.md' },
        ];

        injectDeliverablesProjection(root, deliverables, map);

        expect(findNode(root, 'drive/Engineering/API/api.md')).not.toBeNull();
        expect(findNode(root, 'drive/Engineering/Web/web.md')).not.toBeNull();
    });

    it('projects deliverables for unregistered projects using slug-derived names', () => {
        const root = makeRoot();
        const deliverables: DeliverableFile[] = [{
            realPath: 'projects/growth/channels/growth--ads/output/deliverables/plan.md',
            domainSlug: 'growth',
            channelSlug: 'growth--ads',
            fileName: 'plan.md',
        }];

        // Empty project map — simulates a file-created project absent from workspace.db.
        injectDeliverablesProjection(root, deliverables, new Map());

        expect(findNode(root, 'drive/growth/plan.md')).not.toBeNull();
    });

    it('does not overwrite a real drive folder that collides with the Deliverables alias', () => {
        const root = makeRoot();
        const drive: FileNode = {
            name: 'drive', type: 'directory', path: 'drive', children: [
                { name: 'Deliverables', type: 'directory', path: 'drive/Deliverables', children: [
                    { name: 'real.md', type: 'file', path: 'drive/Deliverables/real.md' },
                ] },
            ],
        };
        root.children = [drive];

        injectDeliverablesProjection(root, [
            { realPath: 'output/deliverables/report.md', fileName: 'report.md' },
        ], new Map());

        // Real folder is preserved; the projected alias is skipped.
        expect(findNode(root, 'drive/Deliverables/real.md')).not.toBeNull();
        expect(findNode(root, 'drive/Deliverables/report.md')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// resolveVirtualDeliverablePath
// ---------------------------------------------------------------------------

describe('resolveVirtualDeliverablePath', () => {
    it('reverse-resolves drive/Deliverables/<file> to output/deliverables/<file>', () => {
        expect(resolveVirtualDeliverablePath('drive/Deliverables/report.md', new Map()))
            .toBe('output/deliverables/report.md');
    });

    it('reverse-resolves a top-level deliverable inside a subfolder', () => {
        expect(resolveVirtualDeliverablePath('drive/Deliverables/reports/q1.md', new Map()))
            .toBe('output/deliverables/reports/q1.md');
    });

    it('reverse-resolves a collapsed project path to the real per-channel path', () => {
        const map = makeProjectMap([
            { slug: 'marketing', name: 'Marketing', channels: [['marketing--blog', 'Blog']] },
        ]);
        expect(resolveVirtualDeliverablePath('drive/Marketing/post.md', map))
            .toBe('projects/marketing/channels/marketing--blog/output/deliverables/post.md');
    });

    it('reverse-resolves a discovered slug-named project path', () => {
        // loadProjectMap discovers on-disk projects with name === slug.
        const map = makeProjectMap([
            { slug: 'growth', name: 'growth', channels: [['growth--ads', 'growth--ads']] },
        ]);
        expect(resolveVirtualDeliverablePath('drive/growth/plan.md', map))
            .toBe('projects/growth/channels/growth--ads/output/deliverables/plan.md');
    });

    it('prefers a real project named Deliverables over the top-level alias', () => {
        const map = makeProjectMap([
            { slug: 'deliverables-team', name: 'Deliverables', channels: [['deliverables-team--main', 'Main']] },
        ]);
        expect(resolveVirtualDeliverablePath('drive/Deliverables/x.md', map))
            .toBe('projects/deliverables-team/channels/deliverables-team--main/output/deliverables/x.md');
    });

    it('returns null for a non-virtual path', () => {
        expect(resolveVirtualDeliverablePath('agents/foo/SOUL.md', new Map())).toBeNull();
    });
});
