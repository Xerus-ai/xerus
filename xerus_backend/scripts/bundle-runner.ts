// Bundle the MCP server into JS for sandbox deployment
// Usage: npx ts-node scripts/bundle-runner.ts
// Output: dist/runner-bundle/mcp-server.js

import { build, type BuildOptions } from 'esbuild';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const RUNNER_DIR = path.join(ROOT, 'src/domains/execution/runner');
const OUT_DIR = path.join(ROOT, 'dist/runner-bundle');

const SHARED_OPTIONS: BuildOptions = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/*',
    ],
    treeShaking: true,
    logLevel: 'info',
};

async function bundleRunner(): Promise<void> {
    const result = await build({
        ...SHARED_OPTIONS,
        entryPoints: [path.join(RUNNER_DIR, 'mcp-server.ts')],
        outfile: path.join(OUT_DIR, 'mcp-server.js'),
    });

    if (result.errors.length > 0) {
        console.error('Bundle failed:', result.errors);
        process.exit(1);
    }

    console.log('Runner bundles created:');
    console.log('  dist/runner-bundle/mcp-server.js');
}

bundleRunner().catch((err) => {
    console.error('Bundle error:', err);
    process.exit(1);
});
