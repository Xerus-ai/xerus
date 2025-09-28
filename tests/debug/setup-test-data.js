const axios = require('axios');

async function setupTestData() {
    console.log('🔧 Setting up test data for document move testing...\n');
    
    const API_URL = 'http://localhost:5001/api/v1';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer development-token',
        'X-User-ID': 'dev_user'
    };
    
    try {
        // Create a test document
        console.log('📝 Creating test document...');
        const documentData = {
            title: 'Test Document for Moving',
            content: 'This is a test document that we will use to test the move functionality. It contains some sample content to verify the move operation works correctly.',
            content_type: 'text',
            tags: ['test', 'move-test'],
            metadata: {
                created_for: 'move_test',
                timestamp: new Date().toISOString()
            }
        };
        
        const documentResponse = await axios.post(`${API_URL}/knowledge`, documentData, { headers });
        const testDocument = documentResponse.data;
        console.log('✅ Test document created:', testDocument.title, '(ID:', testDocument.id + ')');
        
        // Create a test folder
        console.log('📁 Creating test folder...');
        const folderData = {
            name: 'Test Folder for Moving ' + Date.now(),
            color: 'green',
            icon_emoji: '🗂️',
            description: 'Folder created for testing document move functionality'
        };
        
        const folderResponse = await axios.post(`${API_URL}/knowledge/folders`, folderData, { headers });
        const testFolder = folderResponse.data;
        console.log('✅ Test folder created:', testFolder.name, '(ID:', testFolder.id + ')');
        
        console.log('\n✅ Test data setup complete!');
        console.log('📄 Document ID:', testDocument.id);
        console.log('📁 Folder ID:', testFolder.id);
        
        return { document: testDocument, folder: testFolder };
        
    } catch (error) {
        console.error('❌ Error setting up test data:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

async function testMoveDocument() {
    console.log('\n🔧 Testing document move functionality...\n');
    
    const API_URL = 'http://localhost:5001/api/v1';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer development-token',
        'X-User-ID': 'dev_user'
    };
    
    try {
        // Set up test data
        const { document: testDocument, folder: testFolder } = await setupTestData();
        
        // Test moving the document to the folder
        console.log(`🚀 Moving document "${testDocument.title}" to folder "${testFolder.name}"`);
        
        const moveResponse = await axios.post(
            `${API_URL}/knowledge/${testDocument.id}/move`,
            { folder_id: testFolder.id },
            { headers }
        );
        
        console.log('✅ Document moved successfully!');
        console.log('📄 Move response:', JSON.stringify({
            id: moveResponse.data.id,
            title: moveResponse.data.title,
            folder_id: moveResponse.data.folder_id
        }, null, 2));
        
        // Verify the move by fetching documents in the folder
        console.log(`🔍 Verifying document is now in folder "${testFolder.name}"`);
        const folderDocuments = await axios.get(`${API_URL}/knowledge?folder_id=${testFolder.id}`, { headers });
        
        console.log(`📋 Found ${folderDocuments.data.length} documents in the folder`);
        const movedDoc = folderDocuments.data.find(doc => doc.id == testDocument.id);
        
        if (movedDoc) {
            console.log('✅ MOVE TEST PASSED: Document successfully moved to folder!');
            console.log('📄 Document in folder:', {
                title: movedDoc.title,
                folder_name: movedDoc.folder_name
            });
        } else {
            console.log('❌ MOVE TEST FAILED: Document not found in target folder');
        }
        
        // Test moving back to root (no folder)
        console.log(`\n🚀 Moving document back to root (no folder)`);
        const moveToRootResponse = await axios.post(
            `${API_URL}/knowledge/${testDocument.id}/move`,
            { folder_id: null },
            { headers }
        );
        
        console.log('✅ Document moved back to root successfully!');
        
        // Verify it's back in root
        const rootDocuments = await axios.get(`${API_URL}/knowledge`, { headers });
        const rootDoc = rootDocuments.data.find(doc => doc.id == testDocument.id);
        
        if (rootDoc && !rootDoc.folder_id) {
            console.log('✅ ROOT MOVE TEST PASSED: Document successfully moved back to root!');
        } else {
            console.log('❌ ROOT MOVE TEST FAILED: Document still in folder or not found');
        }
        
    } catch (error) {
        console.error('❌ Error testing document move:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testMoveDocument();