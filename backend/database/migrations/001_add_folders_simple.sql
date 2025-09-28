-- Migration: Add Folders Support to Knowledge Base (Simplified)
-- Version: 001
-- Description: Add folders table and update knowledge_base to support folder organization and user filtering

-- Create folders table for document organization
CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    color VARCHAR(50) DEFAULT 'blue',
    icon_emoji VARCHAR(10) DEFAULT '📁',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, user_id, parent_id)
);

-- Add user_id column to knowledge_base for user filtering
ALTER TABLE knowledge_base 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous';

-- Add folder_id column to knowledge_base for folder organization  
ALTER TABLE knowledge_base 
ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_folder_id ON knowledge_base(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);