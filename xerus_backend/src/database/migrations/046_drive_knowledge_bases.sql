-- Migration: 046_drive_knowledge_bases.sql
-- Description: Channel and domain KB assignment tables for Workspace Drive hierarchical resolution
-- Depends: 033_v2_company_hierarchy.sql (channels, domains)
-- Reference: docs/planning/execution/workspace-drive.md (Assignment Model)

-- ===== CHANNEL_KNOWLEDGE_BASES =====
-- Assign KB docs to a channel. All agents in that channel see the doc.

CREATE TABLE IF NOT EXISTS channel_knowledge_bases (
    id SERIAL PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    knowledge_base_id VARCHAR(255) NOT NULL,
    kb_name VARCHAR(255),
    access_mode VARCHAR(20) DEFAULT 'read',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT channel_kb_unique UNIQUE (channel_id, knowledge_base_id),
    CONSTRAINT channel_kb_access_mode CHECK (access_mode IN ('read', 'write', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_channel_kb_channel ON channel_knowledge_bases(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_kb_kb ON channel_knowledge_bases(knowledge_base_id);

COMMENT ON TABLE channel_knowledge_bases IS 'KB docs assigned to channels. All agents in the channel see these docs.';

-- ===== DOMAIN_KNOWLEDGE_BASES =====
-- Assign KB docs to a domain. All agents in that domain see the doc.
-- Note: filesystem uses projects/{domain}/ but DB entity is domains.

CREATE TABLE IF NOT EXISTS domain_knowledge_bases (
    id SERIAL PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    knowledge_base_id VARCHAR(255) NOT NULL,
    kb_name VARCHAR(255),
    access_mode VARCHAR(20) DEFAULT 'read',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT domain_kb_unique UNIQUE (domain_id, knowledge_base_id),
    CONSTRAINT domain_kb_access_mode CHECK (access_mode IN ('read', 'write', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_domain_kb_domain ON domain_knowledge_bases(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_kb_kb ON domain_knowledge_bases(knowledge_base_id);

COMMENT ON TABLE domain_knowledge_bases IS 'KB docs assigned to domains. All agents in the domain see these docs.';
