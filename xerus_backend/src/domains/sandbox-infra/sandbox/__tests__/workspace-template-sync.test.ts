// Workspace Template Sync Tests
// Guards the platform overlay path list against re-introducing paths that
// clobber backend-owned sandbox artifacts.

import { listPlatformOverlayPaths } from '../workspace-template-sync';

describe('PLATFORM_OVERLAY_PATHS', () => {
    // Backend-owned artifacts inside the sandbox that do NOT exist in the
    // xerus-workspace template. Directory overlays are rm -rf + copy, so any
    // overlay path covering these destroys them on every resume:
    // - .xerus/runner/mcp-server.js  — uploaded by runner-installer.ts from
    //   dist/runner-bundle (the 39 platform MCP tools)
    // - .xerus/runner/node_modules   — pre-installed by the sandbox snapshot
    //   (@modelcontextprotocol/sdk, rrule)
    const BACKEND_OWNED_PATHS = [
        '.xerus/runner/mcp-server.js',
        '.xerus/runner/node_modules',
        '.xerus/runner/package.json',
    ];

    it('never overlays .xerus or .xerus/runner as whole directories', () => {
        const paths = listPlatformOverlayPaths();
        expect(paths).not.toContain('.xerus');
        expect(paths).not.toContain('.xerus/runner');
    });

    it('never overlays a path that covers backend-owned runner artifacts', () => {
        const paths = listPlatformOverlayPaths();
        for (const backendPath of BACKEND_OWNED_PATHS) {
            const covering = paths.filter(
                p => p === backendPath || backendPath.startsWith(`${p}/`),
            );
            expect(covering).toEqual([]);
        }
    });

    it('still syncs template-owned .xerus content', () => {
        const paths = listPlatformOverlayPaths();
        expect(paths).toContain('.xerus/ipc');
        expect(paths).toContain('.xerus/templates');
        expect(paths).toContain('.xerus/runner/scheduler.ts');
    });
});
