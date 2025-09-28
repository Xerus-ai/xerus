const axios = require('axios');

async function testFolderCreationAPI() {
    console.log('🔧 Testing folder creation API directly...\n');
    
    const API_URL = 'http://localhost:5001/api/v1';
    const testFolderName = 'API Test Folder ' + Date.now();
    
    try {
        // Prepare the request
        const requestBody = {
            name: testFolderName
            // Note: parent_id is intentionally omitted to create a root folder
        };
        
        console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
        
        // Make the API call
        const response = await axios.post(
            `${API_URL}/knowledge/folders`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer development-token',
                    'X-User-ID': 'dev_user'
                }
            }
        );
        
        console.log('✅ Success! Folder created:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('❌ Error creating folder:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Run the test
testFolderCreationAPI();