// Inbox SSE Broadcaster
// Stores connected SSE clients per user and broadcasts inbox events in real-time

import type { Response } from 'express';
import type {
    InboxSSEBroadcaster,
    InboxSSENewItemPayload,
    InboxSSEItemUpdatedPayload,
} from './inbox.types';

export class InMemoryInboxSSEBroadcaster implements InboxSSEBroadcaster {
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

    broadcastNewItem(userId: string, payload: InboxSSENewItemPayload): void {
        this.broadcast(userId, payload);
    }

    broadcastItemUpdated(userId: string, payload: InboxSSEItemUpdatedPayload): void {
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
