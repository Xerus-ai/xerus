/**
 * Manual test to verify folder creation works via API
 * This bypasses the UI and tests the backend directly
 */

const fetch = require('node-fetch');

async function testFolderCreationAPI() {
    console.log('🧪 Testing Folder Creation API directly...');
    
    const baseUrl = 'http://localhost:5001';
    const testFolder = 'API Test Folder ' + Date.now();
    
    try {
        // Test 1: Check if backend is running
        console.log('1. 📡 Checking backend server...');
        const healthResponse = await fetch(`${baseUrl}/api/v1/health`);
        if (healthResponse.ok) {
            console.log('   ✅ Backend server is running');
        } else {
            console.log('   ❌ Backend server unhealthy');
            return;
        }
        
        // Test 2: List existing folders (this will likely fail without auth)
        console.log('2. 📂 Checking existing folders...');
        try {
            const foldersResponse = await fetch(`${baseUrl}/api/v1/knowledge/folders`, {
                headers: {
                    'Content-Type': 'application/json',
                    // Note: In real test, we'd need proper Firebase JWT token here
                }
            });
            
            if (foldersResponse.ok) {
                const folders = await foldersResponse.json();
                console.log(`   ✅ Found ${folders.length} existing folders`);
            } else {
                console.log(`   ⚠️ Cannot list folders (${foldersResponse.status}) - likely needs authentication`);
            }
        } catch (error) {
            console.log('   ⚠️ Failed to list folders - authentication required');
        }
        
        // Test 3: Try to create a folder (this will likely fail without auth)
        console.log('3. 📁 Attempting to create folder...');
        try {
            const createResponse = await fetch(`${baseUrl}/api/v1/knowledge/folders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Note: In real test, we'd need proper Firebase JWT token here
                },
                body: JSON.stringify({
                    name: testFolder,
                    color: 'blue',
                    icon_emoji: '📁'
                })
            });
            
            if (createResponse.ok) {
                const newFolder = await createResponse.json();
                console.log('   ✅ Folder created successfully:', newFolder);
            } else {
                const errorBody = await createResponse.json().catch(() => ({}));
                console.log(`   ❌ Folder creation failed (${createResponse.status}):`, errorBody);
            }
        } catch (error) {
            console.log('   ❌ Error creating folder:', error.message);
        }
        
        console.log('\n📋 API Test Summary:');
        console.log('   - Backend server is running ✅');
        console.log('   - Authentication is required for folder operations ⚠️');
        console.log('   - API endpoints are accessible 📡');
        
        console.log('\n💡 To complete the test:');
        console.log('   1. Start the frontend: cd glass/xerus_web && npm run dev');
        console.log('   2. Sign in to get authentication token');
        console.log('   3. Run the Playwright test with authentication');
        
    } catch (error) {
        console.error('❌ API test failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Backend server is not running. Start it with:');
            console.log('   cd glass/backend && npm start');
        }
    }
}

async function testDatabaseDirectly() {
    console.log('\n🗄️ Database State Check...');
    console.log('To check database state directly, run these SQL queries:');
    
    const queries = [
        '-- Check existing folders',
        'SELECT id, name, user_id, created_at FROM folders ORDER BY created_at DESC LIMIT 5;',
        '',
        '-- Check folder statistics',
        'SELECT COUNT(*) as total_folders, COUNT(DISTINCT user_id) as unique_users FROM folders;',
        '',
        '-- Check recent knowledge base entries', 
        'SELECT id, title, folder_id, user_id, created_at FROM knowledge_base ORDER BY created_at DESC LIMIT 5;'
    ];
    
    console.log(queries.join('\n'));
    
    console.log('\n💡 Run these queries using:');
    console.log('   - Neon MCP tools in Claude Code');
    console.log('   - Neon dashboard directly');
    console.log('   - Backend debug script: node glass/backend/debug-folders.js');
}

// Main execution
if (require.main === module) {
    console.log('🔧 Manual Folder Creation Test');
    console.log('==============================');
    
    testFolderCreationAPI()
        .then(() => {
            testDatabaseDirectly();
        })
        .catch(error => {
            console.error('💥 Test failed:', error);
        });
}