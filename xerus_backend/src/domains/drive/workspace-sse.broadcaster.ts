// Workspace SSE Broadcaster
// Stores connected SSE clients per user and broadcasts file change events in real-time

import type { Response } from 'express';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type FileChangeAction = 'created' | 'modified' | 'deleted';

export interface FileChangedPayload {
    type: 'file_changed';
    path: string;
    action: FileChangeAction;
    timestamp: string;
}

export interface WorkspaceSSEBroadcaster {
    addClient(userId: string, res: Response): void;
    removeClient(userId: string, res: Response): void;
    broadcastFileChanged(userId: string, payload: FileChangedPayload): void;
    getClientCount(userId: string): number;
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

export class InMemoryWorkspaceSSEBroadcaster implements WorkspaceSSEBroadcaster {
    private clients: Map<string, Set<Response>> = new Map();

    addClient(userId: string, res: Response): void {
        let userClients = this.clients.get(userId);
        if (!userClients) {
            userClients = new Set();
            this.clients.set(userId, userClients);
        }
        userClients.add(res);
    }

    removeClient(userId: string, res: Response): void {
        const userClients = this.clients.get(userId);
        if (!userClients) {
            return;
        }
        userClients.delete(res);
        if (userClients.size === 0) {
            this.clients.delete(userId);
        }
    }

    broadcastFileChanged(userId: string, payload: FileChangedPayload): void {
        this.broadcast(userId, payload);
    }

    getClientCount(userId: string): number {
        return this.clients.get(userId)?.size ?? 0;
    }

    private broadcast(userId: string, data: unknown): void {
        const userClients = this.clients.get(userId);
        if (!userClients || userClients.size === 0) {
            return;
        }

        const message = `data: ${JSON.stringify(data)}\n\n`;
        for (const client of userClients) {
            client.write(message);
        }
    }
}
