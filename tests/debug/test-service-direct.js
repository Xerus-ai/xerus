const KnowledgeService = require('../../backend/services/knowledgeService');

async function testKnowledgeService() {
    console.log('🔧 Testing KnowledgeService createFolder method directly...\n');
    
    const service = new KnowledgeService();
    
    try {
        const folderData = {
            name: 'Service Test Folder ' + Date.now(),
            // No parent_id provided - should default to null
            color: 'purple',
            icon_emoji: '🎯',
            description: 'Testing service method directly'
        };
        
        console.log('📤 Input data:', JSON.stringify(folderData, null, 2));
        
        const result = await service.createFolder(folderData, 'dev_user');
        
        console.log('✅ Folder created successfully:');
        console.log(JSON.stringify(result, null, 2));
        
    } catch (error) {
        console.error('❌ Service test error:', error.message);
        console.error('Full error:', error);
    }
    
    process.exit(0);
}

testKnowledgeService();