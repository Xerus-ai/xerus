const { neonDB } = require('../../backend/database/connections/neon');

async function debugNeonParams() {
    console.log('🔧 Debug Neon parameter handling...\n');
    
    try {
        console.log('1. Testing parameter order with simple query...');
        
        // Test with a simple SELECT to see parameter handling
        const testParams = ['test_name', 'test_user'];
        console.log('📤 Input params:', testParams);
        
        const selectResult = await neonDB.query(
            'SELECT $1 as name_param, $2 as user_param',
            testParams
        );
        
        console.log('📨 Query result:', selectResult.rows[0]);
        
        console.log('\n2. Testing with NULL parameter...');
        const testParamsWithNull = ['test_name', null, 'test_user'];
        console.log('📤 Input params with NULL:', testParamsWithNull);
        
        const selectResultWithNull = await neonDB.query(
            'SELECT $1 as name_param, $2 as parent_param, $3 as user_param',
            testParamsWithNull
        );
        
        console.log('📨 Query result with NULL:', selectResultWithNull.rows[0]);
        
        console.log('\n3. Testing INSERT with proper parameter logging...');
        
        // Log the exact query and parameters being used
        const insertQuery = 'INSERT INTO folders (name, parent_id, user_id) VALUES ($1, $2, $3) RETURNING *';
        const insertParams = ['Debug Test ' + Date.now(), null, 'debug_user'];
        
        console.log('📤 SQL Query:', insertQuery);
        console.log('📤 Parameters:', insertParams);
        console.log('📤 Parameter types:', insertParams.map(p => typeof p));
        
        const insertResult = await neonDB.query(insertQuery, insertParams);
        
        console.log('✅ INSERT successful:');
        console.table([insertResult.rows[0]]);
        
        // Clean up
        await neonDB.query('DELETE FROM folders WHERE id = $1', [insertResult.rows[0].id]);
        
    } catch (error) {
        console.error('❌ Debug error:', error.message);
        console.error('Error code:', error.code);
        console.error('Error detail:', error.detail);
    }
    
    process.exit(0);
}

debugNeonParams();