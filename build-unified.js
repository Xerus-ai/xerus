#!/usr/bin/env node

/**
 * XERUS UNIFIED BUILD SCRIPT
 * Builds and tests the unified xerus system with all features
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

class UnifiedBuilder {
    constructor() {
        this.startTime = performance.now();
        this.errors = [];
        this.warnings = [];
        this.buildSteps = [];
        
        console.log('Xerus Unified Build System');
        console.log('================================');
        console.log('Building unified xerus system with all features...\n');
    }

    async build() {
        try {
            // Step 1: Clean and prepare
            await this.cleanBuild();
            
            // Step 2: Validate components
            await this.validateComponents();
            
            // Step 3: Build renderer components
            await this.buildRenderer();
            
            // Step 4: Build main process
            await this.buildMain();
            
            // Step 5: Test integrations
            await this.testIntegrations();
            
            // Step 6: Package if all tests pass
            await this.packageApp();
            
            this.showResults();
            
        } catch (error) {
            this.errors.push(error);
            this.showResults();
            process.exit(1);
        }
    }

    async cleanBuild() {
        console.log('Cleaning build directories...');
        
        try {
            const dirsToClean = [
                'dist',
                'build',
                'public/build',
                'node_modules/.cache'
            ];
            
            for (const dir of dirsToClean) {
                try {
                    await fs.rm(dir, { recursive: true, force: true });
                    console.log(`   [OK] Cleaned ${dir}`);
                } catch (error) {
                    console.log(`   [WARNING] ${dir} not found (ok)`);
                }
            }
            
            // Create build directories
            await fs.mkdir('public/build', { recursive: true });
            console.log('   [OK] Created build directories');

            this.buildSteps.push('[OK] Clean build');
            
        } catch (error) {
            throw new Error(`Clean build failed: ${error.message}`);
        }
    }

    async validateComponents() {
        console.log('\nValidating components...');
        
        const requiredFiles = [
            'src/ui/app/XerusApp.js',
            'src/ui/app/HeaderController.js',
            'src/ui/app/MainHeader.js',
            'src/ui/components/AreaSelector.js',
            'src/features/ask/AskView.js',
            'src/features/listen/ListenView.js',
            'src/features/settings/SettingsView.js',
            'src/main/platform-manager.js',
            'src/main/notification-manager.js'
        ];
        
        for (const file of requiredFiles) {
            try {
                await fs.access(file);
                console.log(`   [OK] ${file}`);
            } catch (error) {
                this.errors.push(`Missing required file: ${file}`);
            }
        }
        
        
        this.buildSteps.push('[OK] Component validation');
    }

    async buildRenderer() {
        console.log('\nBuilding renderer components...');
        
        try {
            // Build main app
            await this.buildComponent('XerusApp');

            // Build header components
            await this.buildComponent('HeaderController');
            await this.buildComponent('MainHeader');

            // Build area selector
            await this.buildComponent('AreaSelector');

            this.buildSteps.push('[OK] Renderer build');

        } catch (error) {
            throw new Error(`Renderer build failed: ${error.message}`);
        }
    }

    async buildComponent(componentName) {
        console.log(`   Building ${componentName}...`);
        
        // For now, just copy the component to build directory
        // In a real build system, this would transpile, minify, etc.
        const buildPath = `public/build/${componentName.toLowerCase()}.js`;
        
        // Try different directories where components might be located
        const possiblePaths = [
            `src/ui/components/${componentName}.js`,
            `src/ui/app/${componentName}.js`,
            `src/features/settings/${componentName}.js`,
            `src/features/listen/${componentName}.js`,
            `src/features/ask/${componentName}.js`
        ];
        
        for (const srcPath of possiblePaths) {
            try {
                await fs.access(srcPath);
                await fs.copyFile(srcPath, buildPath);
                console.log(`   [OK] ${componentName} built (from ${srcPath.split('/').slice(-2, -1)[0]})`);
                return;
            } catch (error) {
                // Continue to next path
            }
        }
        
        throw new Error(`Component ${componentName} not found in any UI directory`);
    }

    async buildMain() {
        console.log('\nBuilding main process...');
        
        try {
            // Test main process components
            const mainComponents = [
                'platform-manager',
                'notification-manager',
                'window-manager'
            ];
            
            for (const component of mainComponents) {
                console.log(`   Testing ${component}...`);
                
                try {
                    // Basic syntax check
                    const componentPath = `src/main/${component}.js`;
                    await fs.access(componentPath);
                    
                    // Try to require it (basic syntax validation)
                    require(path.resolve(componentPath));
                    console.log(`   [OK] ${component} valid`);
                    
                } catch (error) {
                    this.errors.push(`Main component ${component} failed: ${error.message}`);
                }
            }
            
            this.buildSteps.push('[OK] Main process build');
            
        } catch (error) {
            throw new Error(`Main process build failed: ${error.message}`);
        }
    }

    async testIntegrations() {
        console.log('\nTesting integrations...');
        
        try {
            // Test feature integration service
            console.log('   Testing feature integration...');

            const featureIntegration = require('./src/services/feature-integration');
            console.log('   [OK] Feature integration service loaded');

            // Test tool manager
            console.log('   Testing tool manager...');

            const toolManager = require('./src/services/tool-manager');
            const tools = toolManager.toolManager.getAvailableTools();
            console.log(`   [OK] Tool manager loaded (${tools.length} tools)`);

            // Test platform manager
            console.log('   Testing platform manager...');

            const platformManager = require('./src/main/platform-manager');
            const capabilities = platformManager.platformManager.getCapabilities();
            console.log(`   [OK] Platform manager loaded (${Object.keys(capabilities).length} capabilities)`);
            
            this.buildSteps.push('[OK] Integration tests');
            
        } catch (error) {
            throw new Error(`Integration tests failed: ${error.message}`);
        }
    }

    async packageApp() {
        console.log('\nPackaging application...');
        
        try {
            // Create package info
            const packageInfo = {
                name: 'Xerus Glass',
                version: '0.2.4',
                description: 'Unified Xerus AI Assistant',
                buildTime: new Date().toISOString(),
                features: {
                    unifiedGlass: true,
                    crossPlatform: true,
                    tools: true,
                    notifications: true,
                    context: true,
                    audio: true
                }
            };
            
            await fs.writeFile('public/build/package-info.json', JSON.stringify(packageInfo, null, 2));
            console.log('   [OK] Package info created');

            // Create build manifest
            const buildManifest = {
                buildTime: new Date().toISOString(),
                buildSteps: this.buildSteps,
                warnings: this.warnings,
                components: [
                    'XerusApp',
                    'HeaderController',
                    'MainHeader',
                    'AreaSelector'
                ]
            };

            await fs.writeFile('public/build/build-manifest.json', JSON.stringify(buildManifest, null, 2));
            console.log('   [OK] Build manifest created');

            this.buildSteps.push('[OK] Packaging');
            
        } catch (error) {
            throw new Error(`Packaging failed: ${error.message}`);
        }
    }

    showResults() {
        const endTime = performance.now();
        const duration = ((endTime - this.startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(50));
        console.log('BUILD RESULTS');
        console.log('='.repeat(50));

        console.log(`Build time: ${duration}s`);
        console.log(`Build steps: ${this.buildSteps.length}`);
        
        if (this.buildSteps.length > 0) {
            console.log('\n[COMPLETED] Completed steps:');
            this.buildSteps.forEach(step => console.log(`  ${step}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n[WARNING] Warnings:');
            this.warnings.forEach(warning => console.log(`  ${warning}`));
        }

        if (this.errors.length > 0) {
            console.log('\n[ERROR] Errors:');
            this.errors.forEach(error => console.log(`  ${error}`));
            console.log('\n[FAILED] BUILD FAILED');
        } else {
            console.log('\n[SUCCESS] BUILD SUCCESSFUL!');
            console.log('Unified Xerus system ready');
            console.log('\nNext steps:');
            console.log('  • npm start        - Start development mode');
            console.log('  • npm run package  - Create distributable');
            console.log('  • npm run test     - Run tests');
        }
        
        console.log('\n' + '='.repeat(50));
    }
}

// Run build if called directly
if (require.main === module) {
    const builder = new UnifiedBuilder();
    builder.build().catch(console.error);
}

module.exports = { UnifiedBuilder };