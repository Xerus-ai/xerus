// Tools Domain Repository
// Database operations for connected_accounts and tool_executions

import { query } from '../../database/connection';
import type {
    ConnectedAccount,
    ConnectedAccountRow,
    ToolExecution,
    ToolExecutionRow,
    SaveConnectionInput,
    LogExecutionInput,
    PipedreamAppRow,
    PipedreamApp,
    ListAppsFromDBInput,
    ListAppsFromDBResponse,
    PaginationMetadata,
} from './types';

// ===== HELPERS =====

function mapConnectedAccountRow(row: ConnectedAccountRow): ConnectedAccount {
    return {
        id: row.id,
        user_id: row.user_id,
        app_slug: row.app_slug,
        app_name: row.app_name,
        pipedream_account_id: row.pipedream_account_id,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
    };
}

function mapToolExecutionRow(row: ToolExecutionRow): ToolExecution {
    return {
        id: row.id,
        agent_id: row.agent_id,
        app_slug: row.app_slug,
        action_key: row.action_key,
        input: typeof row.input === 'string' ? JSON.parse(row.input) : (row.input as Record<string, unknown>),
        output: row.output ? (typeof row.output === 'string' ? JSON.parse(row.output) : (row.output as Record<string, unknown>)) : null,
        success: row.success,
        error: row.error,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
    };
}

function mapPipedreamAppRow(row: PipedreamAppRow): PipedreamApp {
    return {
        name_slug: row.name_slug,
        name: row.name,
        description: row.description || undefined,
        auth_type: row.auth_type || undefined,
        img_src: row.img_src || undefined,
        categories: row.categories || undefined,
        featured_weight: row.featured_weight || undefined,
    };
}

// ===== REPOSITORY CLASS =====

export class ToolsRepository {
    // ===== CONNECTED ACCOUNTS =====

    async saveConnection(input: SaveConnectionInput): Promise<ConnectedAccount> {
        const result = await query<ConnectedAccountRow>(
            `INSERT INTO connected_accounts (user_id, pipedream_account_id, app_slug, app_name, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, NOW(), NULL)
       RETURNING *`,
            [input.user_id, input.pipedream_account_id, input.app_slug, input.app_name]
        );

        return mapConnectedAccountRow(result.rows[0]);
    }

    async getConnections(user_id: string): Promise<ConnectedAccount[]> {
        const result = await query<ConnectedAccountRow>(`SELECT * FROM connected_accounts WHERE user_id = $1 ORDER BY created_at DESC`, [user_id]);

        return result.rows.map(mapConnectedAccountRow);
    }

    async getConnectionByPipedreamId(pipedream_account_id: string): Promise<ConnectedAccount | null> {
        const result = await query<ConnectedAccountRow>(`SELECT * FROM connected_accounts WHERE pipedream_account_id = $1`, [pipedream_account_id]);

        return result.rows[0] ? mapConnectedAccountRow(result.rows[0]) : null;
    }

    async removeConnection(pipedream_account_id: string): Promise<void> {
        await query(`DELETE FROM connected_accounts WHERE pipedream_account_id = $1`, [pipedream_account_id]);
    }

    async updateLastUsed(pipedream_account_id: string): Promise<void> {
        await query(`UPDATE connected_accounts SET last_used_at = NOW() WHERE pipedream_account_id = $1`, [pipedream_account_id]);
    }

    // ===== TOOL EXECUTIONS =====

    async logExecution(input: LogExecutionInput): Promise<ToolExecution> {
        const result = await query<ToolExecutionRow>(
            `INSERT INTO tool_executions (
        agent_id, app_slug, action_key,
        input, output, success, error, duration_ms, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
            [
                input.agent_id,
                input.app_slug,
                input.action_key,
                JSON.stringify(input.input),
                input.output ? JSON.stringify(input.output) : null,
                input.success,
                input.error || null,
                input.duration_ms,
            ]
        );

        return mapToolExecutionRow(result.rows[0]);
    }

    async getToolStats(user_id: string, app_slug: string): Promise<{
        last_used_at: Date | null;
        total_runs: number;
    }> {
        const lastUsedResult = await query<{ last_used_at: Date | null }>(
            `SELECT MAX(last_used_at) as last_used_at
       FROM connected_accounts
       WHERE user_id = $1 AND app_slug = $2`,
            [user_id, app_slug]
        );

        const runsResult = await query<{ total_runs: string }>(
            `SELECT COUNT(*) as total_runs
       FROM tool_executions te
       LEFT JOIN agent_registry a ON te.agent_id = a.id
       WHERE (a.user_id = $1 OR te.agent_id IS NULL OR te.agent_id = 0)
         AND te.app_slug = $2`,
            [user_id, app_slug]
        );

        const totalRuns = parseInt(runsResult.rows[0]?.total_runs || '0', 10);

        return {
            last_used_at: lastUsedResult.rows[0]?.last_used_at || null,
            total_runs: totalRuns,
        };
    }

    // ===== PIPEDREAM APPS CACHE =====

    async upsertApp(app: PipedreamApp & { featured?: boolean }): Promise<void> {
        await query(
            `INSERT INTO pipedream_apps (name_slug, name, description, auth_type, img_src, categories, featured, featured_weight, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (name_slug)
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         auth_type = EXCLUDED.auth_type,
         img_src = EXCLUDED.img_src,
         categories = EXCLUDED.categories,
         featured = EXCLUDED.featured,
         featured_weight = EXCLUDED.featured_weight,
         updated_at = NOW()`,
            [
                app.name_slug,
                app.name,
                app.description || null,
                app.auth_type || null,
                app.img_src || null,
                app.categories || [],
                app.featured || false,
                app.featured_weight || null,
            ]
        );
    }

    async updateSyncMetadata(status: 'syncing' | 'success' | 'failed', totalApps?: number, error?: string): Promise<void> {
        if (status === 'success') {
            await query(
                `UPDATE pipedream_apps_sync
         SET sync_status = $1,
             last_sync_at = NOW(),
             total_apps = $2,
             error = $3
         WHERE id = 1`,
                [status, totalApps || 0, error || null]
            );
        } else {
            await query(
                `UPDATE pipedream_apps_sync
         SET sync_status = $1,
             error = $2
         WHERE id = 1`,
                [status, error || null]
            );
        }
    }

    async getSyncMetadata(): Promise<{ last_sync_at: Date | null; total_apps: number; sync_status: string; error: string | null }> {
        const result = await query<{ last_sync_at: Date | null; total_apps: number; sync_status: string; error: string | null }>(
            `SELECT last_sync_at, total_apps, sync_status, error FROM pipedream_apps_sync WHERE id = 1`
        );
        return result.rows[0];
    }

    async listAppsFromDB(input: ListAppsFromDBInput): Promise<ListAppsFromDBResponse> {
        const page = input.page || 1;
        const limit = input.limit || 20;
        const offset = (page - 1) * limit;

        const params: unknown[] = [];
        let whereClause = 'WHERE is_hidden = false';
        let paramIndex = 1;

        if (input.search) {
            whereClause += ` AND to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $${paramIndex})`;
            params.push(input.search);
            paramIndex++;
        }

        if (input.categories && input.categories.length > 0) {
            whereClause += ` AND categories && $${paramIndex}::text[]`;
            params.push(input.categories);
            paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total FROM pipedream_apps ${whereClause}`;
        const countResult = await query<{ total: string }>(countQuery, params);
        const total = parseInt(countResult.rows[0].total, 10);

        params.push(limit, offset);
        const dataQuery = `
            SELECT id, name_slug, name, description, auth_type, img_src, categories, featured, featured_weight, created_at, updated_at
            FROM pipedream_apps
            ${whereClause}
            ORDER BY featured DESC, featured_weight DESC NULLS LAST, name ASC, id ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const dataResult = await query<PipedreamAppRow>(dataQuery, params);

        const totalPages = Math.ceil(total / limit);
        const hasMore = page < totalPages;

        const pagination: PaginationMetadata = {
            total,
            page,
            limit,
            total_pages: totalPages,
            has_more: hasMore,
        };

        return {
            apps: dataResult.rows.map(mapPipedreamAppRow),
            pagination,
            available_categories: await this.listCategories(),
        };
    }

    async listCategories(): Promise<string[]> {
        const result = await query<{ category: string }>(
            `SELECT DISTINCT unnest(categories) as category
             FROM pipedream_apps
             WHERE is_hidden = false
             ORDER BY category ASC`
        );
        return result.rows.map((row: { category: string }) => row.category).filter(Boolean);
    }

    async getAppBySlug(nameSlug: string): Promise<PipedreamApp | null> {
        const result = await query<PipedreamAppRow>(
            `SELECT id, name_slug, name, description, auth_type, img_src, categories, featured, featured_weight, created_at, updated_at
             FROM pipedream_apps
             WHERE is_hidden = false AND name_slug = $1
             LIMIT 1`,
            [nameSlug]
        );
        return result.rows[0] ? mapPipedreamAppRow(result.rows[0]) : null;
    }

    async setAppVisibility(name_slug: string, is_hidden: boolean): Promise<void> {
        await query(
            `UPDATE pipedream_apps SET is_hidden = $1, updated_at = NOW() WHERE name_slug = $2`,
            [is_hidden, name_slug]
        );
    }

    async getHiddenApps(): Promise<Array<{ name_slug: string; name: string }>> {
        const result = await query<{ name_slug: string; name: string }>(
            `SELECT name_slug, name FROM pipedream_apps WHERE is_hidden = true ORDER BY name ASC`
        );
        return result.rows;
    }

    async enrichBySlugs(slugs: string[]): Promise<Array<{
        name_slug: string;
        name: string;
        description: string | null;
        img_src: string | null;
        auth_type: string | null;
        categories: string[] | null;
    }>> {
        if (slugs.length === 0) return [];
        const result = await query<{
            name_slug: string;
            name: string;
            description: string | null;
            img_src: string | null;
            auth_type: string | null;
            categories: string[] | null;
        }>(
            `SELECT name_slug, name, description, img_src, auth_type, categories
             FROM pipedream_apps WHERE name_slug = ANY($1)
             ORDER BY name_slug`,
            [slugs],
        );
        return result.rows;
    }

    async appExists(nameSlug: string): Promise<boolean> {
        const result = await query<{ exists: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM pipedream_apps WHERE name_slug = $1) as exists`,
            [nameSlug]
        );
        return result.rows[0]?.exists ?? false;
    }
}

export const toolsRepository = new ToolsRepository();
