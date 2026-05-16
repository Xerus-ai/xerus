// Workspace Schema Validation Tests
//
// Validates that the workspace SQL schemas define the expected tables
// and that skill SKILL.md files reference the correct database for
// workspace operations.
//
// These tests read the actual .sql and .md files from the xerus-workspace
// repository to ensure schema and documentation stay in sync.

import fs from 'fs/promises';
import path from 'path';

const WORKSPACE_ROOT = path.resolve(
    __dirname, '..', '..', '..', '..', '..', '..', 'xerus-workspace',
);
const WORKSPACE_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'data', 'workspace-schema.sql');
const COMPANY_SCHEMA_PATH = path.join(WORKSPACE_ROOT, 'data', 'schema.sql');
const SKILLS_DIR = path.join(WORKSPACE_ROOT, '.claude', 'skills');

// ---------------------------------------------------------------
// Helper: extract CREATE TABLE names from a SQL file
// ---------------------------------------------------------------

function extractCreateTableNames(sql: string): string[] {
    const regex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
    const tables: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sql)) !== null) {
        tables.push(match[1]);
    }
    return tables;
}

// ---------------------------------------------------------------
// A: workspace-schema.sql (workspace.db)
// ---------------------------------------------------------------

describe('Workspace Schema (workspace-schema.sql)', () => {
    let sql: string;
    let tables: string[];

    beforeAll(async () => {
        sql = await fs.readFile(WORKSPACE_SCHEMA_PATH, 'utf-8');
        tables = extractCreateTableNames(sql);
    });

    const requiredTables = [
        'agents',
        'channels',
        'domains',
        'channel_members',
        'tasks',
        'inbox_items',
        'skills',
        'agent_skills',
        'agent_knowledge_bases',
        'agent_outputs',
    ];

    it.each(requiredTables)(
        'should have CREATE TABLE for %s',
        (tableName) => {
            expect(tables).toContain(tableName);
        },
    );

    it('should define all required tables', () => {
        for (const table of requiredTables) {
            expect(tables).toContain(table);
        }
    });
});

// ---------------------------------------------------------------
// B: schema.sql (company.db)
// ---------------------------------------------------------------

describe('Company Schema (schema.sql)', () => {
    let sql: string;
    let tables: string[];

    beforeAll(async () => {
        sql = await fs.readFile(COMPANY_SCHEMA_PATH, 'utf-8');
        tables = extractCreateTableNames(sql);
    });

    const requiredCompanyTables = [
        'research_reports',
        'prospects',
        'competitors',
        'topics',
        'metrics',
    ];

    it.each(requiredCompanyTables)(
        'should have CREATE TABLE for %s',
        (tableName) => {
            expect(tables).toContain(tableName);
        },
    );

    const forbiddenTables = [
        'agents',
        'channels',
        'domains',
    ];

    it.each(forbiddenTables)(
        'should NOT have CREATE TABLE for %s (workspace-only table)',
        (tableName) => {
            expect(tables).not.toContain(tableName);
        },
    );
});

// ---------------------------------------------------------------
// C: Skill SKILL.md files reference correct DB
// ---------------------------------------------------------------

describe('Skill DB References', () => {
    // These 7 skills reference workspace.db for workspace tables
    const workspaceSkills = [
        'create-agent',
        'create-channel',
        'create-project',
        'assign-agent',
        'install-skill',
        'add-knowledge',
        'data-steward',
    ];

    // Workspace tables that should only appear with workspace.db references
    const workspaceTables = [
        'agents',
        'channels',
        'channel_members',
        'domains',
        'agent_skills',
        'agent_knowledge_bases',
        'skills',
    ];

    for (const skillSlug of workspaceSkills) {
        describe(`skill: ${skillSlug}`, () => {
            let content: string;

            beforeAll(async () => {
                const skillPath = path.join(SKILLS_DIR, skillSlug, 'SKILL.md');
                content = await fs.readFile(skillPath, 'utf-8');
            });

            if (skillSlug === 'data-steward') {
                // data-steward primarily references company.db for business data
                it('should reference company.db for business data tables', () => {
                    expect(content).toContain('company.db');
                });
            } else {
                // All other workspace-management skills should reference workspace.db
                it('should reference workspace.db for workspace tables', () => {
                    expect(content).toContain('workspace.db');
                });

                it('should NOT use company.db for workspace operations', () => {
                    // Extract lines that contain both company.db and a workspace table name
                    const lines = content.split('\n');
                    for (const line of lines) {
                        if (line.includes('company.db')) {
                            for (const table of workspaceTables) {
                                // A line referencing company.db should not also manipulate workspace tables
                                const tablePattern = new RegExp(
                                    `company\\.db.*(?:INSERT|UPDATE|DELETE|SELECT).*${table}|` +
                                    `(?:INSERT|UPDATE|DELETE|SELECT).*${table}.*company\\.db`,
                                    'i',
                                );
                                expect(line).not.toMatch(tablePattern);
                            }
                        }
                    }
                });
            }
        });
    }
});
