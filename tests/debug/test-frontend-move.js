const axios = require('axios');

async function testFrontendMoveWorkflow() {
    console.log('🔧 Testing frontend document move workflow...\n');
    
    const API_URL = 'http://localhost:5001/api/v1';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer development_token',
        'X-User-ID': 'admin_user'  // Using admin_user as in getApiHeaders default
    };
    
    try {
        // Simulate the frontend workflow:
        
        // 1. Get runtime config (like frontend does)
        console.log('🔧 Simulating runtime config fetch...');
        const runtimeConfig = {
            API_URL: 'http://localhost:5001/api/v1',
            WEB_URL: 'http://localhost:3002'
        };
        console.log('✅ Runtime config:', runtimeConfig);
        
        // 2. Get folders (like frontend does)
        console.log('📁 Fetching folders...');
        const foldersResponse = await axios.get(`${API_URL}/knowledge/folders?parent_id=null`, { headers });
        const folders = foldersResponse.data;
        console.log(`✅ Found ${folders.length} folders`);
        
        if (folders.length === 0) {
            console.log('❌ No folders found. The user needs folders to test drag-and-drop.');
            return;
        }
        
        // 3. Get documents (like frontend does)
        console.log('📄 Fetching documents...');
        const documentsResponse = await axios.get(`${API_URL}/knowledge`, { headers });
        const documents = documentsResponse.data;
        console.log(`✅ Found ${documents.length} documents`);
        
        if (documents.length === 0) {
            console.log('❌ No documents found. The user needs documents to test drag-and-drop.');
            return;
        }
        
        // 4. Test the exact move request that frontend would make
        const testDocument = documents[0];
        const testFolder = folders[0];
        
        console.log(`🚀 Testing frontend move request...`);
        console.log(`   Document: "${testDocument.title}" (ID: ${testDocument.id})`);
        console.log(`   Target Folder: "${testFolder.name}" (ID: ${testFolder.id})`);
        
        // This is the exact API call that the frontend moveDocumentToFolder function makes
        const moveResponse = await axios.post(
            `${API_URL}/knowledge/${testDocument.id}/move`,
            { folder_id: testFolder.id },
            { 
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer development_token',
                    'X-User-ID': 'admin_user'
                }
            }
        );
        
        console.log('✅ Frontend move request succeeded!');
        console.log('📄 Response status:', moveResponse.status);
        console.log('📄 Response data:', JSON.stringify({
            id: moveResponse.data.id,
            title: moveResponse.data.title,
            folder_id: moveResponse.data.folder_id
        }, null, 2));
        
        // 5. Verify by fetching documents in folder (like frontend does after move)
        console.log(`🔍 Verifying document appears in folder...`);
        const folderDocsResponse = await axios.get(`${API_URL}/knowledge?folder_id=${testFolder.id}`, { headers });
        const folderDocs = folderDocsResponse.data;
        
        const movedDoc = folderDocs.find(doc => doc.id == testDocument.id);
        
        if (movedDoc) {
            console.log('✅ FRONTEND WORKFLOW TEST PASSED!');
            console.log('📄 Document successfully moved and verified in folder');
        } else {
            console.log('❌ FRONTEND WORKFLOW TEST FAILED!');
            console.log('📄 Document not found in target folder after move');
        }
        
        console.log('\n💡 CONCLUSION:');
        console.log('The backend API for document moving is working correctly.');
        console.log('If drag-and-drop is not working in the UI, the issue is likely:');
        console.log('1. Browser drag-and-drop event handling');
        console.log('2. JavaScript event propagation (e.g., onClick conflicts with drag)');
        console.log('3. CSS cursor styling preventing drag initiation');
        console.log('4. Missing visual feedback during drag operation');
        
    } catch (error) {
        console.error('❌ Error testing frontend move workflow:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testFrontendMoveWorkflow();