// Inbox Domain Error Classes

import { DomainError } from '../../utils/errors';

// -----------------------------------------------------------------------------
// Inbox Item Errors
// -----------------------------------------------------------------------------

export class InboxItemNotFoundError extends DomainError {
    public readonly itemId: string;

    constructor(itemId: string) {
        super(`Inbox item '${itemId}' not found`, 404, 'INBOX_ITEM_NOT_FOUND');
        this.itemId = itemId;
    }
}

export class InboxItemInvalidStatusError extends DomainError {
    public readonly itemId: string;
    public readonly currentStatus: string;
    public readonly expectedStatus: string;

    constructor(itemId: string, currentStatus: string, expectedStatus: string) {
        super(
            `Inbox item '${itemId}' has status '${currentStatus}', expected '${expectedStatus}'`,
            409,
            'INBOX_ITEM_INVALID_STATUS'
        );
        this.itemId = itemId;
        this.currentStatus = currentStatus;
        this.expectedStatus = expectedStatus;
    }
}

// -----------------------------------------------------------------------------
// Channel Resolution Errors
// -----------------------------------------------------------------------------

export class ChannelResolutionError extends DomainError {
    public readonly triggerType: string;

    constructor(triggerType: string, reason: string) {
        super(
            `Failed to resolve channel for trigger '${triggerType}': ${reason}`,
            500,
            'CHANNEL_RESOLUTION_FAILED'
        );
        this.triggerType = triggerType;
    }
}
