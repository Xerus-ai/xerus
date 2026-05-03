// Workspace Template Sync
// Selectively overlays the latest xerus-workspace template onto an existing sandbox.
//
// Unlike workspace-clone.ts (which is a full overlay used at sandbox creation),
// this sync only replaces *platform-owned* paths. User-editable content
// (drive/, projects/, .memory/, .beads/, data/, agents/<user-slug>/, etc.) is
// never touched. Reference: xerus-workspace/.claude/skills/sanitize-workspace
// for the canonical platform-vs-user path classification.
//
// Use cases: pulling new platform skills, hooks, rules, or agent CLAUDE.md
// templates into an existing user sandbox without disturbing their work.

import { SANDBOX_CONFIG } from './sandbox.config';
import type { DaytonaProvider } from './providers/daytona.provider';

// Defense-in-depth: only allow well-formed HTTPS git URLs (mirrors workspace-clone.ts).
const VALID_GIT_URL_PATTERN = /^https:\/\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9_./-]+\.git$/;

// Platform-owned paths overlaid by sync. Each entry is a workspace-relative
// path. Directories overlay recursively (orphans inside platform dirs are
// removed). Files are replaced as-is. .claude/settings.json is intentionally
// excluded — it carries personalized env vars and is owned by
// workspace-personalizer.service.ts.
const PLATFORM_OVERLAY_PATHS: ReadonlyArray<string> = [
    'CLAUDE.md',
    '.xerus',
    '.claude/skills',
    '.claude/hooks',
    '.claude/rules',
    '.claude/commands',
    '.claude/agents',
    '.agent/templates',
    '.agent/scripts',
    '.agent/skills/.gitkeep',
    '.agent/scaffold.json',
    'marketplace',
    'agents/index.json',
    'agents/xerus-master',
    'agents/xerus-cto',
    'drive/welcome.md',
];

export interface WorkspaceTemplateSyncOptions {
    dryRun?: boolean;
}

export interface WorkspaceTemplateSyncResult {
    synced: boolean;
    dryRun: boolean;
    updatedPaths: string[];
    skippedPaths: string[];
    durationMs: number;
    branch?: string;
}

/**
 * Sync the platform-owned subset of the xerus-workspace template into an
 * existing sandbox. When dryRun is true, no filesystem changes are made — the
 * function returns the list of paths that would be updated.
 *
 * Throws on shell failure. Caller logs and surfaces the error.
 */
export async function syncWorkspaceTemplate(
    provider: DaytonaProvider,
    sandboxId: string,
    options: WorkspaceTemplateSyncOptions = {},
): Promise<WorkspaceTemplateSyncResult> {
    const startTime = Date.now();
    const dryRun = options.dryRun === true;
    const basePath = SANDBOX_CONFIG.workspacePath;
    const templateUrl = SANDBOX_CONFIG.workspaceTemplateUrl;
    const branch = SANDBOX_CONFIG.workspaceTemplateBranch;

    if (!VALID_GIT_URL_PATTERN.test(templateUrl)) {
        throw new Error(`Invalid workspace template URL: ${templateUrl}`);
    }

    const tempDir = '/tmp/xerus-workspace-sync';
    const branchFlag = branch ? `-b '${branch}'` : '';
    const pathsLiteral = PLATFORM_OVERLAY_PATHS.map((p) => `'${p}'`).join(' ');

    // Single shell pipeline for atomicity from the route handler's POV.
    // Output protocol: each platform path emits exactly one tagged line:
    //   UPDATED:<path>   — applied (or would-apply in dry-run)
    //   MISSING:<path>   — not present in the cloned template
    // Caller parses these tags. Anything else on stderr surfaces as failure.
    const script = [
        `set -e`,
        `rm -rf ${tempDir}`,
        `git clone --recurse-submodules --depth 1 ${branchFlag} '${templateUrl}' ${tempDir} 2>/dev/null`,
        `if [ ! -f "${tempDir}/CLAUDE.md" ]; then echo "CLONE_FAILED: template missing CLAUDE.md"; exit 1; fi`,
        `mkdir -p '${basePath}'`,
        `cd '${basePath}'`,
        `for path in ${pathsLiteral}; do`,
        `  src="${tempDir}/$path"`,
        `  dst="${basePath}/$path"`,
        `  if [ ! -e "$src" ]; then`,
        `    echo "MISSING:$path"`,
        `    continue`,
        `  fi`,
        `  changed=1`,
        `  if [ -d "$src" ]; then`,
        `    if [ -d "$dst" ]; then`,
        `      diff_out=$(diff -rq "$src" "$dst" 2>/dev/null) || true`,
        `      if [ -z "$diff_out" ]; then changed=0; fi`,
        `    fi`,
        `  else`,
        `    if [ -f "$dst" ] && cmp -s "$src" "$dst"; then`,
        `      changed=0`,
        `    fi`,
        `  fi`,
        `  if [ "$changed" = "0" ]; then`,
        `    echo "UNCHANGED:$path"`,
        `    continue`,
        `  fi`,
        ...(dryRun
            ? [`  echo "UPDATED:$path"`]
            : [
                  `  parent_dir=$(dirname "$dst")`,
                  `  mkdir -p "$parent_dir"`,
                  `  if [ -d "$src" ]; then`,
                  `    rm -rf "$dst"`,
                  `    cp -a "$src" "$dst"`,
                  `  else`,
                  `    cp -a "$src" "$dst"`,
                  `  fi`,
                  `  echo "UPDATED:$path"`,
              ]),
        `done`,
        `rm -rf ${tempDir}`,
    ].join('\n');

    const result = await provider.executeCommand(sandboxId, script);

    if (result.exitCode !== 0) {
        // Best-effort cleanup; ignore failures
        await provider
            .executeCommand(sandboxId, `rm -rf ${tempDir}`)
            .catch(() => undefined);
        throw new Error(
            `Workspace template sync failed (exit ${result.exitCode}): ${result.result}`,
        );
    }

    const updatedPaths: string[] = [];
    const skippedPaths: string[] = [];
    for (const line of (result.result || '').split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('UPDATED:')) {
            updatedPaths.push(trimmed.slice('UPDATED:'.length));
        } else if (trimmed.startsWith('MISSING:')) {
            skippedPaths.push(trimmed.slice('MISSING:'.length));
        }
    }

    return {
        synced: true,
        dryRun,
        updatedPaths,
        skippedPaths,
        durationMs: Date.now() - startTime,
        branch: branch || undefined,
    };
}

// Exposed for tests and the frontend so the UI can describe what will change
// before the user confirms.
export function listPlatformOverlayPaths(): ReadonlyArray<string> {
    return PLATFORM_OVERLAY_PATHS;
}
