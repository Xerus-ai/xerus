// Production-safe runner bundler (no ts-node required)
// Usage: node scripts/bundle-runner.js
// Output: dist/runner-bundle/mcp-server.js

const { build } = require('esbuild');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNNER_DIR = path.join(ROOT, 'src/domains/execution/runner');
const OUT_DIR = path.join(ROOT, 'dist/runner-bundle');

const SHARED_OPTIONS = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/*',
        'zod',
        'zod/*',
    ],
    treeShaking: true,
    logLevel: 'info',
};

async function bundleRunner() {
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
