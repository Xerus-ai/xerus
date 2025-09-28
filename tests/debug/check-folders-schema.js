const { neonDB } = require('../../backend/database/connections/neon');

(async () => {
  try {
    console.log('🔍 Checking folders table schema...\n');
    
    const result = await neonDB.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'folders' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Folders table schema:');
    console.table(result.rows);
    
    // Check constraints
    const constraints = await neonDB.query(`
      SELECT 
        conname AS constraint_name,
        contype AS constraint_type,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'folders'::regclass
    `);
    
    console.log('\n🔒 Constraints:');
    console.table(constraints.rows);
    
    // Check if there are any existing folders
    const existingFolders = await neonDB.query('SELECT id, name, parent_id, user_id FROM folders LIMIT 5');
    console.log('\n📁 Existing folders:');
    console.table(existingFolders.rows);
    
  } catch (error) {
    console.error('❌ Database query error:', error.message);
  }
  
  process.exit(0);
})();