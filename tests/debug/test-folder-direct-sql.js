const { neonDB } = require('../../backend/database/connections/neon');

async function testFolderCreationDirectSQL() {
    console.log('🔧 Testing folder creation with direct SQL...\n');
    
    try {
        console.log('1. Testing root folder creation (parent_id = NULL)...');
        
        const testResult1 = await neonDB.query(`
            INSERT INTO folders (name, parent_id, user_id, color, icon_emoji, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, ['Direct SQL Test Root', null, 'dev_user', 'blue', '📁', 'Test folder via direct SQL']);
        
        console.log('✅ Root folder created successfully:');
        console.table([testResult1.rows[0]]);
        
        const parentId = testResult1.rows[0].id;
        
        console.log('\n2. Testing child folder creation (with valid parent_id)...');
        
        const testResult2 = await neonDB.query(`
            INSERT INTO folders (name, parent_id, user_id, color, icon_emoji, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, ['Direct SQL Test Child', parentId, 'dev_user', 'green', '📂', 'Child test folder']);
        
        console.log('✅ Child folder created successfully:');
        console.table([testResult2.rows[0]]);
        
        // Clean up the test data
        console.log('\n3. Cleaning up test data...');
        await neonDB.query('DELETE FROM folders WHERE id IN ($1, $2)', [parentId, testResult2.rows[0].id]);
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Direct SQL test error:', error.message);
        console.error('Full error:', error);
    }
    
    process.exit(0);
}

testFolderCreationDirectSQL();