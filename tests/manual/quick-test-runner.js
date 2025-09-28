#!/usr/bin/env node

/**
 * Xerus AI Agent Platform - Quick Test Runner
 * Tests the implementations from the 4 specialized agents without requiring full services
 */

const fs = require('fs');
const path = require('path');

// Test Results
let results = {
    agent1_data_management: { status: 'pending', details: [] },
    agent2_editing_capabilities: { status: 'pending', details: [] },
    agent3_knowledge_base: { status: 'pending', details: [] },
    agent4_tool_config: { status: 'pending', details: [] }
};

const log = (message, level = 'INFO') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
};

// Test implementations by checking file structure and content
class QuickTestRunner {
    
    // Test 1: AI Agent Data Management (AI/ML Integration Expert)
    testAgentDataManagement() {
        log('🧪 Testing AI Agent Data Management implementation...');
        
        const checks = [
            {
                name: 'Backend API Endpoints',
                test: () => {
                    const apiDir = path.join(__dirname, 'backend', 'api', 'v1');
                    return fs.existsSync(path.join(apiDir, 'agents.js')) || 
                           fs.existsSync(path.join(apiDir, 'agent.js'));
                }
            },
            {
                name: 'Database Integration Files',
                test: () => {
                    const dbDir = path.join(__dirname, 'backend', 'database');
                    return fs.existsSync(path.join(dbDir, 'neondb.js')) && 
                           fs.existsSync(path.join(dbDir, 'sqlite.js'));
                }
            },
            {
                name: 'Agent Service Implementation',
                test: () => {
                    const servicesDir = path.join(__dirname, 'backend', 'services');
                    return fs.existsSync(path.join(servicesDir, 'agentService.js'));
                }
            },
            {
                name: 'SQLite + Neon PostgreSQL Integration',
                test: () => {
                    const configFile = path.join(__dirname, 'backend', '.env');
                    if (!fs.existsSync(configFile)) return false;
                    
                    const config = fs.readFileSync(configFile, 'utf8');
                    return config.includes('DATABASE_URL') && config.includes('NEON_');
                }
            }
        ];

        results.agent1_data_management = this.runChecks('Agent Data Management', checks);
    }

    // Test 2: Agent Editing Capabilities (Senior Implementer)
    testAgentEditingCapabilities() {
        log('🧪 Testing Agent Editing Capabilities implementation...');
        
        const checks = [
            {
                name: 'Frontend Agent Components',
                test: () => {
                    const componentsDir = path.join(__dirname, 'xerus_web', 'components');
                    return fs.existsSync(componentsDir) && (
                        fs.readdirSync(componentsDir).some(file => 
                            file.toLowerCase().includes('agent') || file.toLowerCase().includes('edit')
                        )
                    );
                }
            },
            {
                name: 'Agent Edit API Routes',
                test: () => {
                    const apiDir = path.join(__dirname, 'backend', 'api', 'v1');
                    if (!fs.existsSync(apiDir)) return false;
                    
                    // Check for agent update/edit endpoints
                    const files = fs.readdirSync(apiDir);
                    return files.some(file => {
                        if (file.includes('agent')) {
                            const content = fs.readFileSync(path.join(apiDir, file), 'utf8');
                            return content.includes('PUT') || content.includes('PATCH');
                        }
                        return false;
                    });
                }
            },
            {
                name: 'Edit Form Components',
                test: () => {
                    const appDir = path.join(__dirname, 'xerus_web', 'app');
                    if (!fs.existsSync(appDir)) return false;
                    
                    // Check for agent pages with edit functionality
                    return this.findInDirectory(appDir, ['edit', 'agent', 'form'], ['.tsx', '.jsx']);
                }
            },
            {
                name: 'Save Functionality Implementation',
                test: () => {
                    const backendDir = path.join(__dirname, 'backend');
                    return this.findInDirectory(backendDir, ['save', 'update', 'agent'], ['.js']);
                }
            }
        ];

        results.agent2_editing_capabilities = this.runChecks('Agent Editing Capabilities', checks);
    }

    // Test 3: Knowledge Base Management (Performance Engineer)
    testKnowledgeBaseManagement() {
        log('🧪 Testing Knowledge Base Management implementation...');
        
        const checks = [
            {
                name: 'Knowledge Base API Endpoints',
                test: () => {
                    const apiDir = path.join(__dirname, 'backend', 'api', 'v1');
                    return this.findInDirectory(apiDir, ['knowledge', 'kb', 'document'], ['.js']);
                }
            },
            {
                name: 'Document Processing Service',
                test: () => {
                    const servicesDir = path.join(__dirname, 'backend', 'services');
                    return this.findInDirectory(servicesDir, ['document', 'knowledge', 'embedding'], ['.js']);
                }
            },
            {
                name: 'Frontend Knowledge Base UI',
                test: () => {
                    const frontendDir = path.join(__dirname, 'xerus_web');
                    return this.findInDirectory(frontendDir, ['knowledge', 'document', 'upload'], ['.tsx', '.jsx']);
                }
            },
            {
                name: 'Search Functionality',
                test: () => {
                    const backendDir = path.join(__dirname, 'backend');
                    return this.findInDirectory(backendDir, ['search', 'query', 'vector'], ['.js']);
                }
            }
        ];

        results.agent3_knowledge_base = this.runChecks('Knowledge Base Management', checks);
    }

    // Test 4: Tool Configuration Management (Backend Systems Expert)
    testToolConfigurationManagement() {
        log('🧪 Testing Tool Configuration Management implementation...');
        
        const checks = [
            {
                name: 'Tool Configuration API',
                test: () => {
                    const apiDir = path.join(__dirname, 'backend', 'api', 'v1');
                    return this.findInDirectory(apiDir, ['tool', 'config'], ['.js']);
                }
            },
            {
                name: 'Tool Execution Service',
                test: () => {
                    const servicesDir = path.join(__dirname, 'backend', 'services');
                    return this.findInDirectory(servicesDir, ['tool', 'execution', 'integration'], ['.js']);
                }
            },
            {
                name: 'API Key Management',
                test: () => {
                    const backendDir = path.join(__dirname, 'backend');
                    return this.findInDirectory(backendDir, ['apikey', 'key', 'config'], ['.js']) ||
                           fs.existsSync(path.join(__dirname, 'backend', '.env'));
                }
            },
            {
                name: 'Tool Settings Interface',
                test: () => {
                    const frontendDir = path.join(__dirname, 'xerus_web');
                    return this.findInDirectory(frontendDir, ['tool', 'setting', 'config'], ['.tsx', '.jsx']);
                }
            }
        ];

        results.agent4_tool_config = this.runChecks('Tool Configuration Management', checks);
    }

    // Helper Functions
    runChecks(categoryName, checks) {
        const result = { status: 'testing', details: [], passed: 0, total: checks.length };
        
        for (const check of checks) {
            try {
                const success = check.test();
                result.details.push({
                    name: check.name,
                    status: success ? 'PASSED' : 'FAILED'
                });
                
                if (success) {
                    result.passed++;
                    log(`  ✅ ${check.name}`);
                } else {
                    log(`  ❌ ${check.name}`, 'WARN');
                }
            } catch (error) {
                result.details.push({
                    name: check.name,
                    status: 'ERROR',
                    error: error.message
                });
                log(`  ❌ ${check.name} - Error: ${error.message}`, 'ERROR');
            }
        }
        
        result.status = result.passed === result.total ? 'PASSED' : 
                       result.passed > 0 ? 'PARTIAL' : 'FAILED';
        
        log(`📊 ${categoryName}: ${result.passed}/${result.total} checks passed (${result.status})`);
        return result;
    }

    findInDirectory(dir, keywords, extensions) {
        if (!fs.existsSync(dir)) return false;
        
        try {
            const files = this.getAllFiles(dir);
            return files.some(file => {
                const filename = path.basename(file).toLowerCase();
                const hasKeyword = keywords.some(keyword => filename.includes(keyword.toLowerCase()));
                const hasExtension = extensions.some(ext => filename.endsWith(ext));
                return hasKeyword && hasExtension;
            });
        } catch (error) {
            return false;
        }
    }

    getAllFiles(dirPath, arrayOfFiles = []) {
        if (!fs.existsSync(dirPath)) return arrayOfFiles;
        
        const files = fs.readdirSync(dirPath);
        
        files.forEach(file => {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                // Limit recursion depth to avoid excessive searching
                if (fullPath.split(path.sep).length < dirPath.split(path.sep).length + 3) {
                    this.getAllFiles(fullPath, arrayOfFiles);
                }
            } else {
                arrayOfFiles.push(fullPath);
            }
        });
        
        return arrayOfFiles;
    }

    // Run all tests
    async runAllTests() {
        log('🚀 Starting Xerus AI Agent Platform Component Verification');
        log('=' .repeat(70));
        
        const startTime = Date.now();
        
        // Run all component tests
        this.testAgentDataManagement();
        this.testAgentEditingCapabilities();
        this.testKnowledgeBaseManagement();
        this.testToolConfigurationManagement();
        
        // Generate summary report
        this.generateReport(startTime);
    }

    generateReport(startTime) {
        const duration = Date.now() - startTime;
        
        log('=' .repeat(70));
        log('📊 COMPONENT VERIFICATION RESULTS');
        log('=' .repeat(70));
        
        let totalPassed = 0;
        let totalTests = 0;
        
        Object.entries(results).forEach(([key, result]) => {
            const componentName = key.replace(/_/g, ' ').replace(/agent\d+/, 'Agent');
            const status = result.status === 'PASSED' ? '✅' : 
                          result.status === 'PARTIAL' ? '⚠️' : '❌';
            
            log(`${status} ${componentName}: ${result.passed}/${result.total} (${result.status})`);
            
            totalPassed += result.passed;
            totalTests += result.total;
        });
        
        log('');
        log(`📈 Overall Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
        log(`⏱️  Verification Time: ${(duration / 1000).toFixed(2)}s`);
        
        // Save detailed report
        const reportPath = path.join(__dirname, 'component-verification-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            duration,
            results,
            summary: {
                totalPassed,
                totalTests,
                successRate: ((totalPassed / totalTests) * 100).toFixed(1)
            }
        }, null, 2));
        
        log(`📄 Detailed report saved to: ${reportPath}`);
        
        // Next steps recommendation
        log('');
        log('🎯 NEXT STEPS RECOMMENDATIONS:');
        
        Object.entries(results).forEach(([key, result]) => {
            if (result.status !== 'PASSED') {
                const failedTests = result.details.filter(test => test.status !== 'PASSED');
                const componentName = key.replace(/_/g, ' ').replace(/agent\d+/, 'Agent');
                
                log(`\n🔧 ${componentName}:`);
                failedTests.forEach(test => {
                    log(`  • Fix: ${test.name}`);
                });
            }
        });
        
        if (totalPassed === totalTests) {
            log('\n🎉 ALL COMPONENTS VERIFIED! Ready for live integration testing.');
        } else {
            log('\n⚠️  Component verification complete. Address failed checks before integration testing.');
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const testRunner = new QuickTestRunner();
    testRunner.runAllTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = QuickTestRunner;