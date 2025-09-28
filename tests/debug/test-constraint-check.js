const { neonDB } = require('../../backend/database/connections/neon');

async function testConstraintCheck() {
    console.log('🔧 Testing constraint behavior...\n');
    
    try {
        // First, let's check the exact constraint definition
        console.log('1. Checking constraint definition...');
        const constraints = await neonDB.query(`
            SELECT 
                conname,
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conrelid = 'folders'::regclass 
            AND contype = 'f'
        `);
        
        console.log('Foreign key constraints:');
        console.table(constraints.rows);
        
        // Check if there are any triggers
        console.log('\n2. Checking triggers...');
        const triggers = await neonDB.query(`
            SELECT 
                trigger_name,
                event_manipulation,
                action_statement,
                action_timing
            FROM information_schema.triggers 
            WHERE event_object_table = 'folders'
        `);
        
        if (triggers.rows.length > 0) {
            console.log('Triggers found:');
            console.table(triggers.rows);
        } else {
            console.log('No triggers found on folders table');
        }
        
        // Test if we can insert a simple row with minimal data
        console.log('\n3. Testing minimal insert...');
        const testResult = await neonDB.query(`
            INSERT INTO folders (name, user_id) 
            VALUES ($1, $2) 
            RETURNING *
        `, ['Minimal Test ' + Date.now(), 'dev_user']);
        
        console.log('✅ Minimal insert successful:');
        console.table([testResult.rows[0]]);
        
        // Clean up
        await neonDB.query('DELETE FROM folders WHERE id = $1', [testResult.rows[0].id]);
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Constraint test error:', error.message);
        console.error('Error details:', {
            code: error.code,
            detail: error.detail,
            hint: error.hint
        });
    }
    
    process.exit(0);
}

testConstraintCheck();