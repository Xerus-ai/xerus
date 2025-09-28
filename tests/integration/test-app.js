#!/usr/bin/env node

/**
 * Test script to verify the application starts without IPC conflicts
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Glass application...');
console.log('📍 Working directory:', process.cwd());

// Start the application
const child = spawn('npm', ['start'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true
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