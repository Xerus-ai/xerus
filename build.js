const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const baseConfig = {
    bundle: true,
    platform: 'browser',
    format: 'esm',
    loader: { 
        '.js': 'jsx',
        '.ts': 'tsx',
        '.tsx': 'tsx'
    },
    sourcemap: true,
    external: ['electron'],
    define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
    },
    target: 'es2022',
    tsconfig: './tsconfig.json'
};

const entryPoints = [
    { in: 'src/ui/app/HeaderController.js', out: 'public/build/header' },
    { in: 'src/ui/app/XerusApp.js', out: 'public/build/content' },
];

// Copy shader files to maintain the working shader loading
function copyShaders() {
    // Keep the shaders in the original marble directory where they were working
    console.log('ℹ️ Shaders maintained in original location');
}

async function build() {
    try {
        console.log('Building renderer process code...');
        await Promise.all(entryPoints.map(point => esbuild.build({
            ...baseConfig,
            entryPoints: [point.in],
            outfile: `${point.out}.js`,
        })));
        
        // Copy shader files after build
        copyShaders();
        
        console.log('✅ Renderer builds successful!');
    } catch (e) {
        console.error('Renderer build failed:', e);
        process.exit(1);
    }
}

async function watch() {
    try {
        const contexts = await Promise.all(entryPoints.map(point => esbuild.context({
            ...baseConfig,
            entryPoints: [point.in],
            outfile: `${point.out}.js`,
        })));
        
        console.log('Watching for changes...');
        await Promise.all(contexts.map(context => context.watch()));

    } catch (e) {
        console.error('Watch mode failed:', e);
        process.exit(1);
    }
}

if (process.argv.includes('--watch')) {
    watch();
} else {
    build();
} 