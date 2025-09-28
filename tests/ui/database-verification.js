/**
 * Database Verification Script for Knowledge Base Test
 * Uses Neon MCP to verify embeddings and database state after file upload
 */

// This script would be called after the Playwright test to verify database state
// For now, it provides the structure and SQL queries needed

class DatabaseVerification {
    constructor() {
        this.testConfig = {
            testFolder: null, // Will be passed from main test
            testFile: null,   // Will be passed from main test
            expectedContent: 'This is a test document for the Knowledge Base'
        };
    }

    async verifyKnowledgeBaseEntry(testConfig) {
        console.log('🗄️ Verifying knowledge base database entries...');
        
        // SQL queries to verify the uploaded document
        const queries = {
            // Find the uploaded document
            findDocument: `
                SELECT 
                    id,
                    title,
                    content,
                    content_type,
                    word_count,
                    character_count,
                    is_indexed,
                    folder_id,
                    user_id,
                    created_at,
                    updated_at
                FROM knowledge_base 
                WHERE title LIKE '%${testConfig.testFile || 'test-document'}%'
                ORDER BY created_at DESC
                LIMIT 5;
            `,
            
            // Check folder assignment
            checkFolderAssignment: `
                SELECT 
                    kb.id,
                    kb.title,
                    f.name as folder_name,
                    f.id as folder_id
                FROM knowledge_base kb 
                LEFT JOIN folders f ON kb.folder_id = f.id
                WHERE kb.title LIKE '%${testConfig.testFile || 'test-document'}%';
            `,
            
            // Verify indexing status
            checkIndexingStatus: `
                SELECT 
                    title,
                    is_indexed,
                    word_count,
                    character_count,
                    LENGTH(content) as actual_content_length
                FROM knowledge_base 
                WHERE title LIKE '%${testConfig.testFile || 'test-document'}%';
            `,
            
            // Check for the test folder
            checkTestFolder: `
                SELECT 
                    id,
                    name,
                    parent_id,
                    user_id,
                    created_at,
                    (SELECT COUNT(*) FROM knowledge_base WHERE folder_id = folders.id) as document_count
                FROM folders 
                WHERE name LIKE '%${testConfig.testFolder || 'Test Folder'}%'
                ORDER BY created_at DESC;
            `,
            
            // Overall knowledge base stats
            getStats: `
                SELECT 
                    COUNT(*) as total_documents,
                    COUNT(*) FILTER (WHERE is_indexed = true) as indexed_documents,
                    COUNT(*) FILTER (WHERE folder_id IS NOT NULL) as documents_in_folders,
                    COUNT(DISTINCT folder_id) FILTER (WHERE folder_id IS NOT NULL) as folders_with_documents
                FROM knowledge_base;
            `
        };

        console.log('📊 SQL Queries to run for verification:');
        console.log('=====================================');
        
        for (const [queryName, query] of Object.entries(queries)) {
            console.log(`\n-- ${queryName.toUpperCase()}`);
            console.log(query.trim());
        }
        
        console.log('\n💡 To run these queries using Neon MCP:');
        console.log('1. Use the mcp__neon__run_sql tool in Claude Code');
        console.log('2. Or access the Neon dashboard directly');
        console.log('3. Or run via backend debug script');
        
        return queries;
    }

    async verifyEmbeddings(documentId) {
        console.log('🔍 Verifying embeddings generation...');
        
        // Note: This depends on your embedding storage implementation
        // Common patterns include:
        
        const embeddingQueries = {
            // If using a separate embeddings table
            checkEmbeddingTable: `
                SELECT 
                    document_id,
                    chunk_id,
                    embedding_model,
                    chunk_text,
                    created_at
                FROM document_embeddings 
                WHERE document_id = ${documentId}
                ORDER BY chunk_id;
            `,
            
            // If using pgvector extension
            checkVectorEmbeddings: `
                SELECT 
                    id,
                    content_chunk,
                    embedding_vector,
                    similarity_score
                FROM knowledge_embeddings 
                WHERE document_id = ${documentId};
            `,
            
            // Check if document is marked as indexed
            checkIndexedStatus: `
                SELECT 
                    id,
                    title,
                    is_indexed,
                    updated_at
                FROM knowledge_base 
                WHERE id = ${documentId} AND is_indexed = true;
            `
        };

        console.log('🧮 Embedding verification queries:');
        console.log('==================================');
        
        for (const [queryName, query] of Object.entries(embeddingQueries)) {
            console.log(`\n-- ${queryName.toUpperCase()}`);
            console.log(query.trim());
        }
        
        return embeddingQueries;
    }

    async generateVerificationReport(results) {
        const timestamp = new Date().toISOString();
        
        const report = {
            timestamp,
            verification: {
                documentExists: results.findDocument?.length > 0,
                folderAssigned: results.checkFolderAssignment?.some(r => r.folder_name),
                isIndexed: results.checkIndexingStatus?.some(r => r.is_indexed),
                embeddingsGenerated: results.embeddings?.length > 0
            },
            details: results,
            summary: {
                status: 'completed',
                issues: [],
                recommendations: []
            }
        };

        // Add issues and recommendations based on results
        if (!report.verification.documentExists) {
            report.summary.issues.push('Document not found in knowledge_base table');
            report.summary.recommendations.push('Check file upload process and error handling');
        }

        if (!report.verification.folderAssigned) {
            report.summary.issues.push('Document not assigned to correct folder');
            report.summary.recommendations.push('Verify folder selection and assignment logic');
        }

        if (!report.verification.isIndexed) {
            report.summary.issues.push('Document not indexed for search');
            report.summary.recommendations.push('Check embedding generation process and background jobs');
        }

        console.log('📋 Verification Report Generated:');
        console.log('=================================');
        console.log(JSON.stringify(report, null, 2));
        
        return report;
    }
}

// Export for use in other test files
module.exports = { DatabaseVerification };

// If run directly, provide example usage
if (require.main === module) {
    console.log('🧪 Database Verification Script');
    console.log('==============================');
    
    const verifier = new DatabaseVerification();
    
    // Example test config
    const testConfig = {
        testFolder: 'Test Folder ' + Date.now(),
        testFile: 'test-document.txt',
        expectedContent: 'This is a test document for the Knowledge Base'
    };
    
    verifier.verifyKnowledgeBaseEntry(testConfig)
        .then(queries => {
            console.log('\n✅ Database verification queries generated');
            console.log('💡 Run these queries using Neon MCP to verify the test results');
        })
        .catch(error => {
            console.error('❌ Database verification failed:', error);
        });
}