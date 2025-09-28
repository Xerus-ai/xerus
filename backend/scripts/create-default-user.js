const { neonDB } = require('../database/connections/neon');

async function checkSchema() {
  try {
    // Check users table schema
    const result = await neonDB.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    console.log('Users table schema:');
    console.table(result.rows);
    
    // Also check what users exist
    const users = await neonDB.query('SELECT * FROM users LIMIT 3');
    console.log('\nExisting users:');
    console.table(users.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();