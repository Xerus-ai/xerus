/**
 * Neon Database Check Script
 * Uses Neon MCP integration to verify Knowledge Base test results
 * This script demonstrates how to integrate with Neon MCP for database verification
 */

const path = require('path');
const fs = require('fs');

class NeonDatabaseChecker {
    constructor() {
        this.projectId = null; // Will be set from Neon project
        this.testResults = {
            connection: false,
            documents: [],
            folders: [],
            embeddings: null,
            verification: {
                documentExists: false,
                folderAssigned: false,
                isIndexed: false
            }
        };
    }

    async checkDatabase(testConfig) {
        console.log('🔍 Starting Neon database verification...');
        console.log('Test Config:', testConfig);
        
        try {
            // Note: In a real implementation with Claude Code, you would use:
            // await this.connectToNeon();
            // const results = await this.runVerificationQueries(testConfig);
            
            // For now, we'll generate the queries and instructions
            await this.generateVerificationInstructions(testConfig);
            
            return this.testResults;
            
        } catch (error) {
            console.error('❌ Database verification failed:', error);
            throw error;
        }
    }

    async generateVerificationInstructions(testConfig) {
        console.log('📋 Generating Neon MCP verification instructions...');
        
        const instructions = {
            title: 'Knowledge Base Database Verification using Neon MCP',
            timestamp: new Date().toISOString(),
            testConfig,
            steps: [
                {
                    step: 1,
                    title: 'Connect to Neon Project',
                    action: 'List available Neon projects',
                    mcpTool: 'mcp__neon__list_projects',
                    parameters: { params: {} },
                    description: 'Find the correct Neon project for the Knowledge Base'
                },
                {
                    step: 2,
                    title: 'Check Knowledge Base Documents',
                    action: 'Query uploaded test document',
                    mcpTool: 'mcp__neon__run_sql',
                    parameters: {
                        params: {
                            projectId: '[PROJECT_ID_FROM_STEP_1]',
                            sql: `SELECT 
                                id, title, content_type, word_count, character_count, 
                                is_indexed, folder_id, user_id, created_at, updated_at,
                                SUBSTRING(content, 1, 200) as content_preview
                            FROM knowledge_base 
                            WHERE title LIKE '%${testConfig.testFile || 'test-document'}%'
                            ORDER BY created_at DESC LIMIT 5;`
                        }
                    },
                    expectedResult: 'Should find 1 document with correct metadata',
                    verification: [
                        'Document exists with correct title',
                        'Content preview matches uploaded file',
                        'Word count and character count are reasonable',
                        'Created timestamp is recent'
                    ]
                },
                {
                    step: 3,
                    title: 'Verify Folder Assignment',
                    action: 'Check folder structure and assignment',
                    mcpTool: 'mcp__neon__run_sql',
                    parameters: {
                        params: {
                            projectId: '[PROJECT_ID_FROM_STEP_1]',
                            sql: `SELECT 
                                kb.id as document_id,
                                kb.title as document_title,
                                f.id as folder_id,
                                f.name as folder_name,
                                f.user_id as folder_owner
                            FROM knowledge_base kb 
                            LEFT JOIN folders f ON kb.folder_id = f.id
                            WHERE kb.title LIKE '%${testConfig.testFile || 'test-document'}%'
                            OR f.name LIKE '%${testConfig.testFolder || 'Test Folder'}%';`
                        }
                    },
                    expectedResult: 'Document should be assigned to the test folder',
                    verification: [
                        'Document is linked to correct folder',
                        'Folder name matches test folder name',
                        'Folder belongs to correct user'
                    ]
                },
                {
                    step: 4,
                    title: 'Check Indexing Status',
                    action: 'Verify document indexing for search',
                    mcpTool: 'mcp__neon__run_sql',
                    parameters: {
                        params: {
                            projectId: '[PROJECT_ID_FROM_STEP_1]',
                            sql: `SELECT 
                                title,
                                is_indexed,
                                word_count,
                                character_count,
                                LENGTH(content) as actual_content_length,
                                updated_at
                            FROM knowledge_base 
                            WHERE title LIKE '%${testConfig.testFile || 'test-document'}%';`
                        }
                    },
                    expectedResult: 'Document should be marked as indexed (is_indexed = true)',
                    verification: [
                        'is_indexed flag is true',
                        'Word count matches actual content',
                        'Updated timestamp reflects indexing time'
                    ]
                },
                {
                    step: 5,
                    title: 'Test Search Functionality',
                    action: 'Verify full-text search works',
                    mcpTool: 'mcp__neon__run_sql',
                    parameters: {
                        params: {
                            projectId: '[PROJECT_ID_FROM_STEP_1]',
                            sql: `SELECT 
                                title,
                                ts_rank_cd(to_tsvector('english', title || ' ' || content), 
                                          plainto_tsquery('english', 'machine learning')) as relevance_score,
                                substring(content, 1, 200) as snippet
                            FROM knowledge_base 
                            WHERE to_tsvector('english', title || ' ' || content) 
                                  @@ plainto_tsquery('english', 'machine learning')
                            ORDER BY relevance_score DESC;`
                        }
                    },
                    expectedResult: 'Should find the test document if it contains "machine learning"',
                    verification: [
                        'Search returns the uploaded document',
                        'Relevance score is reasonable (> 0)',
                        'Content snippet shows relevant text'
                    ]
                },
                {
                    step: 6,
                    title: 'Check Overall Statistics',
                    action: 'Get knowledge base statistics',
                    mcpTool: 'mcp__neon__run_sql',
                    parameters: {
                        params: {
                            projectId: '[PROJECT_ID_FROM_STEP_1]',
                            sql: `SELECT 
                                COUNT(*) as total_documents,
                                COUNT(*) FILTER (WHERE is_indexed = true) as indexed_documents,
                                COUNT(*) FILTER (WHERE folder_id IS NOT NULL) as documents_in_folders,
                                COUNT(DISTINCT folder_id) FILTER (WHERE folder_id IS NOT NULL) as folders_with_documents,
                                MAX(created_at) as latest_document_date
                            FROM knowledge_base;`
                        }
                    },
                    expectedResult: 'Statistics should reflect the newly uploaded document',
                    verification: [
                        'Total documents increased by 1',
                        'At least 1 indexed document',
                        'At least 1 document in a folder',
                        'Recent latest document date'
                    ]
                }
            ],
            manualExecution: {
                instructions: 'To execute these steps in Claude Code:',
                steps: [
                    'Use the MCP tools available in Claude Code',
                    'Copy each SQL query and run with mcp__neon__run_sql',
                    'Replace [PROJECT_ID_FROM_STEP_1] with actual project ID',
                    'Compare results with expected outcomes',
                    'Document any discrepancies or issues'
                ]
            }
        };

        // Save instructions to file
        const instructionsPath = path.join(__dirname, '..', '..', 'test-results', 'neon-verification-instructions.json');
        const instructionsDir = path.dirname(instructionsPath);
        
        if (!fs.existsSync(instructionsDir)) {
            fs.mkdirSync(instructionsDir, { recursive: true });
        }
        
        fs.writeFileSync(instructionsPath, JSON.stringify(instructions, null, 2));
        
        // Also create a simplified SQL file
        const sqlPath = path.join(instructionsDir, 'verification-queries.sql');
        const sqlContent = instructions.steps
            .filter(step => step.mcpTool === 'mcp__neon__run_sql')
            .map(step => `-- STEP ${step.step}: ${step.title}\n${step.parameters.params.sql}\n`)
            .join('\n');
        
        fs.writeFileSync(sqlPath, sqlContent);
        
        console.log('✅ Verification instructions generated:');
        console.log(`   📄 Detailed instructions: ${instructionsPath}`);
        console.log(`   📄 SQL queries: ${sqlPath}`);
        
        return instructions;
    }

    // Example of how this would work with actual Neon MCP integration
    async demonstrateNeonMCPUsage() {
        console.log('💡 Example of Neon MCP integration:');
        console.log('=====================================');
        
        const exampleCode = `
// In Claude Code, you would use these MCP tools:

// 1. List projects
const projects = await mcp__neon__list_projects({ params: {} });
const projectId = projects[0].id;

// 2. Run verification query
const documentCheck = await mcp__neon__run_sql({
    params: {
        projectId,
        sql: "SELECT * FROM knowledge_base WHERE title LIKE '%test-document%'"
    }
});

// 3. Verify results
if (documentCheck.length > 0) {
    console.log('✅ Document found in database');
} else {
    console.log('❌ Document not found');
}

// 4. Check indexing
const indexingCheck = await mcp__neon__run_sql({
    params: {
        projectId,
        sql: "SELECT is_indexed FROM knowledge_base WHERE title LIKE '%test-document%'"
    }
});

const isIndexed = indexingCheck[0]?.is_indexed;
console.log(\`📇 Document indexed: \${isIndexed ? 'Yes' : 'No'}\`);
        `;
        
        console.log(exampleCode);
        
        return exampleCode;
    }
}

// Export for use in other modules
module.exports = { NeonDatabaseChecker };

// If run directly, generate instructions
if (require.main === module) {
    const checker = new NeonDatabaseChecker();
    
    const testConfig = {
        testFolder: process.argv[2] || 'Test Folder ' + Date.now(),
        testFile: process.argv[3] || 'test-document.txt'
    };
    
    console.log('🧪 Neon Database Verification Generator');
    console.log('======================================');
    
    checker.checkDatabase(testConfig)
        .then(() => {
            console.log('\n✅ Verification instructions generated successfully');
            console.log('💡 Use the generated files to verify database state with Neon MCP');
            
            // Show example usage
            checker.demonstrateNeonMCPUsage();
        })
        .catch(error => {
            console.error('❌ Failed to generate verification instructions:', error);
            process.exit(1);
        });
}

// Also provide a quick verification function for immediate use
function quickNeonCheck(projectId, testFileName = 'test-document') {
    return {
        findDocument: `SELECT id, title, is_indexed, folder_id FROM knowledge_base WHERE title LIKE '%${testFileName}%' ORDER BY created_at DESC LIMIT 1;`,
        
        checkFolder: `SELECT f.name, COUNT(kb.id) as doc_count FROM folders f LEFT JOIN knowledge_base kb ON f.id = kb.folder_id WHERE f.name LIKE '%Test Folder%' GROUP BY f.id, f.name;`,
        
        verifySearch: `SELECT title FROM knowledge_base WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'machine learning') LIMIT 5;`
    };
}

module.exports.quickNeonCheck = quickNeonCheck;