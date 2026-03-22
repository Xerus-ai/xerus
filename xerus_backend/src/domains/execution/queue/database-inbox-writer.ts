// Workspace Inbox Writer
// Implements InboxWriter for AnnounceQueueService.
// Writes JSON notification files to agents/xerus-master/inbox/ (workspace source of truth),
// then syncs to inbox_items DB table (frontend cache).
//
// Flow: subagent completes → AnnounceQueue batches → drain() →
//   1. Write file to agents/xerus-master/inbox/{timestamp}.json (via Daytona provider)
//   2. INSERT INTO inbox_items (for frontend /inbox page)
//   InboxWatcher picks up file → agent reads it → file moved to processed/

import type { InboxWriter } from './announce-queue.service';
import type { ExecutionDatabase } from '../execution-pipeline.types';
import { SANDBOX_CONFIG } from '../sandbox/sandbox.config';
import { XERUS_MASTER_SLUG } from '../agents/xerus-master.types';

export interface WorkspaceWriterDeps {
    writeFile: (sandboxId: string, filePath: string, content: string) => Promise<void>;
}

export class WorkspaceInboxWriter implements InboxWriter {
    constructor(
        private readonly workspace: WorkspaceWriterDeps,
        private readonly sandboxId: string,
        private readonly db: ExecutionDatabase,
        private readonly userId: string,
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

        // Step 1: Write to workspace (source of truth)
        // InboxWatcher will detect this file and deliver to the agent session
        const inboxPath = `${SANDBOX_CONFIG.workspacePath}/agents/${XERUS_MASTER_SLUG}/inbox/${filename}`;
        await this.workspace.writeFile(this.sandboxId, inboxPath, JSON.stringify(payload, null, 2));

        // Step 2: Sync to DB (frontend cache)
        const title = item.message.length > 80
            ? item.message.slice(0, 77) + '...'
            : item.message;
        const summary = item.message.slice(0, 200);

        const result = await this.db.query<{ id: string }>(
            `INSERT INTO inbox_items (user_id, channel_id, agent_slug, title, summary, content, status, priority, metadata)
             VALUES ($1, $2, NULL, $3, $4, $5, 'delivered', 'normal', $6)
             RETURNING id`,
            [
                this.userId,
                item.channel_id,
                title,
                summary,
                item.message,
                JSON.stringify(payload),
            ],
        );

        if (result.rows.length === 0) {
            throw new Error(`Failed to sync inbox item to DB for user=${this.userId}`);
        }

        return { id: result.rows[0].id };
    }
}

export function createWorkspaceInboxWriter(
    workspace: WorkspaceWriterDeps,
    sandboxId: string,
    db: ExecutionDatabase,
    userId: string,
): WorkspaceInboxWriter {
    return new WorkspaceInboxWriter(workspace, sandboxId, db, userId);
}
