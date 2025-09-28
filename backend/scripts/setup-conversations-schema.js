/**
 * Setup Conversations Schema for Authenticated Users
 * Creates the necessary database schema and test data
 */

const { neonDB } = require('../database/connections/neon');

async function setupSchema() {
    try {
        console.log('[TOOL] Setting up conversations schema...');

        // Create users table
        await neonDB.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                display_name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[OK] Users table created');

        // Create conversations table
        await neonDB.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(500) NOT NULL,
                agent_type VARCHAR(100) DEFAULT 'general',
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[OK] Conversations table created');

        // Create messages table
        await neonDB.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                agent_config JSONB DEFAULT '{}',
                tool_calls JSONB DEFAULT '[]',
                processing_time INTEGER,
                token_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[OK] Messages table created');

        // Insert test user
        await neonDB.query(`
            INSERT INTO users (id, email, display_name, role) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                role = EXCLUDED.role,
                updated_at = CURRENT_TIMESTAMP
        `, ['assistant@xerus', 'assistant@xerus.ai', 'Test Assistant', 'admin']);
        console.log('[OK] Test user created/updated');

        // Insert another test user
        await neonDB.query(`
            INSERT INTO users (id, email, display_name, role) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                role = EXCLUDED.role,
                updated_at = CURRENT_TIMESTAMP
        `, ['admin_user', 'admin@xerus.ai', 'Admin User', 'admin']);
        console.log('[OK] Admin user created/updated');

        console.log('🎉 Database schema setup complete!');

        // Verify setup
        const users = await neonDB.query('SELECT * FROM users');
        console.log('[DATA] Users in database:', users.rows.length);

    } catch (error) {
        console.error('[ERROR] Schema setup failed:', error);
        throw error;
    }
}

setupSchema()
    .then(() => {
        console.log('[OK] Setup completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('[ERROR] Setup failed:', error);
        process.exit(1);
    });