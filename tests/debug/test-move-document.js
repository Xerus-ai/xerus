const axios = require('axios');

async function testMoveDocument() {
    console.log('🔧 Testing document move functionality...\n');
    
    const API_URL = 'http://localhost:5001/api/v1';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer development-token',
        'X-User-ID': 'dev_user'
    };
    
    try {
        // First, get existing documents
        console.log('📋 Getting existing documents...');
        const documentsResponse = await axios.get(`${API_URL}/knowledge`, { headers });
        const documents = documentsResponse.data;
        
        if (documents.length === 0) {
            console.log('❌ No documents found. Upload a document first.');
            return;
        }
        
        console.log(`✅ Found ${documents.length} documents`);
        
        // Get existing folders
        console.log('📁 Getting existing folders...');
        const foldersResponse = await axios.get(`${API_URL}/knowledge/folders?parent_id=null`, { headers });
        const folders = foldersResponse.data;
        
        if (folders.length === 0) {
            console.log('❌ No folders found. Create a folder first.');
            return;
        }
        
        console.log(`✅ Found ${folders.length} folders`);
        
        // Test moving a document to a folder
        const testDocument = documents[0];
        const testFolder = folders[0];
        
        console.log(`🚀 Moving document "${testDocument.title}" to folder "${testFolder.name}"`);
        
        const moveResponse = await axios.post(
            `${API_URL}/knowledge/${testDocument.id}/move`,
            { folder_id: testFolder.id },
            { headers }
        );
        
        console.log('✅ Document moved successfully:');
        console.log('📄 Response:', JSON.stringify(moveResponse.data, null, 2));
        
        // Verify the move by fetching documents in the folder
        console.log(`🔍 Verifying document is now in folder "${testFolder.name}"`);
        const folderDocuments = await axios.get(`${API_URL}/knowledge?folder_id=${testFolder.id}`, { headers });
        
        const movedDoc = folderDocuments.data.find(doc => doc.id == testDocument.id);
        if (movedDoc) {
            console.log('✅ Document successfully moved to folder!');
        } else {
            console.log('❌ Document not found in target folder');
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