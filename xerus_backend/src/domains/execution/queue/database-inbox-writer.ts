// Workspace Inbox Writer
// Implements InboxWriter for AnnounceQueueService.
// Inserts into inbox_items in workspace.db (SQLite) first (queryable record),
// then writes JSON notification file to agents/xerus-master/inbox/ for InboxWatcher.
// DB-first ordering ensures no orphaned files if DB insert fails,
// and cleanup logic removes the DB row if the file write fails.
//
// Flow: subagent completes -> AnnounceQueue batches -> drain() ->
//   1. INSERT INTO inbox_items in workspace.db (for frontend /inbox page)
//   2. Write file to agents/xerus-master/inbox/{timestamp}.json (via Daytona provider)
//   InboxWatcher picks up file -> agent reads it -> file moved to processed/

import { logger } from '../../../utils/logger';
import type { InboxWriter } from './announce-queue.service';
import type { DaytonaProvider } from '../../sandbox-infra/sandbox/providers/daytona.provider';

const log = logger('WorkspaceInboxWriter');
import { escapeSQL, executeWorkspaceJsonQuery } from '../../conversations/workspace-db.helpers';
import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';

const XERUS_MASTER_SLUG = 'xerus-master';

export interface WorkspaceWriterDeps {
    writeFile: (sandboxId: string, filePath: string, content: string) => Promise<void>;
}

export class WorkspaceInboxWriter implements InboxWriter {
    constructor(
        private readonly workspace: WorkspaceWriterDeps,
        private readonly sandboxId: string,
        private readonly provider: DaytonaProvider,
    ) {}

    async writeToInbox(item: {
        channel_id: string;
        message: string;
        agent_slug: string;
        timestamp: Date;
    }): Promise<{ id: string }> {
        const ts = item.timestamp.toISOString().replace(/[:.]/g, '-');
        const filename = `${ts}-${item.agent_slug || 'system'}.json`;

        const payload = {
            from: item.agent_slug,
            channel_id: item.channel_id,
            message: item.message,
            timestamp: item.timestamp.toISOString(),
            source: 'announce_queue',
        };

        const subject = item.message.length > 80
            ? item.message.slice(0, 77) + '...'
            : item.message;
        const now = new Date().toISOString();
        const senderSlug = item.agent_slug || 'system';
        const metadataStr = JSON.stringify(payload);

        // Step 1: Insert into workspace.db (queryable record)
        // If this fails, no file is written — no inconsistency
        const sql = `
            INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
            VALUES ('${escapeSQL(XERUS_MASTER_SLUG)}', '${escapeSQL(senderSlug)}', 'coordination', '${escapeSQL(subject)}', '${escapeSQL(item.message)}', '${escapeSQL(metadataStr)}', 'normal', 'unread', '${now}');
            SELECT id FROM inbox_items WHERE id = last_insert_rowid();
        `;

        const rows = await executeWorkspaceJsonQuery<{ id: number }>(this.provider, this.sandboxId, sql);

        if (rows.length === 0) {
            throw new Error(`Failed to insert inbox item into workspace DB for sandbox=${this.sandboxId}`);
        }

        const insertedId = String(rows[0].id);

        // Step 2: Write file to workspace (for agent InboxWatcher)
        // If this fails, clean up the DB row to avoid an orphaned record
        const inboxPath = `${SANDBOX_CONFIG.workspacePath}/agents/${XERUS_MASTER_SLUG}/inbox/${filename}`;
        try {
            await this.workspace.writeFile(this.sandboxId, inboxPath, JSON.stringify(payload, null, 2));
        } catch (fileErr) {
            try {
                const deleteSql = `DELETE FROM inbox_items WHERE id = ${rows[0].id};`;
                await executeWorkspaceJsonQuery(this.provider, this.sandboxId, deleteSql);
            } catch (cleanupErr) {
                log.error('Failed to clean up inbox DB row after file write failure', { error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr) });
            }
            throw fileErr;
        }

        return { id: insertedId };
    }
}

export function createWorkspaceInboxWriter(
    workspace: WorkspaceWriterDeps,
    sandboxId: string,
    provider: DaytonaProvider,
): WorkspaceInboxWriter {
    return new WorkspaceInboxWriter(workspace, sandboxId, provider);
}
