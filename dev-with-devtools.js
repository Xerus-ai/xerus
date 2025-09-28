#!/usr/bin/env node

/**
 * Development script to start the application with DevTools enabled
 * This script temporarily sets OPEN_DEV_TOOLS=true and starts the app
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔧 Starting Glass application with DevTools enabled...');
console.log('📍 Working directory:', process.cwd());

// Set environment variable for DevTools
const env = { ...process.env, OPEN_DEV_TOOLS: 'true' };

// Start the application with DevTools enabled
const child = spawn('npm', ['start'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: env
});

// Handle process termination
child.on('close', (code) => {
    console.log(`\n📊 Application exited with code: ${code}`);
    process.exit(code);
});

// Handle errors
child.on('error', (error) => {
    console.error('❌ Error starting application:', error);
    process.exit(1);
});

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    child.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    child.kill('SIGTERM');
});

console.log('💡 To run without DevTools, use: npm start');
console.log('💡 To run with DevTools, use: node dev-with-devtools.js');