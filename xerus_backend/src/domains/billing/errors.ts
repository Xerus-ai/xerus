import { DomainError } from '../../utils/errors';

export class BillingError extends DomainError {
    constructor(message: string, statusCode = 500, code = 'BILLING_ERROR') {
        super(message, statusCode, code);
    }
}

export class SubscriptionNotFoundError extends BillingError {
    constructor(identifier: string) {
        super(`Subscription not found: ${identifier}`, 404, 'SUBSCRIPTION_NOT_FOUND');
    }
}

export class NoActiveSubscriptionError extends BillingError {
    constructor() {
        super('No active subscription found', 400, 'NO_ACTIVE_SUBSCRIPTION');
    }
}

export class NoBillingAccountError extends BillingError {
    constructor() {
        super('No billing account found — subscribe to a plan first', 400, 'NO_BILLING_ACCOUNT');
    }
}

export class InvalidPlanError extends BillingError {
    constructor(planKey: string) {
        super(`Invalid plan/interval: ${planKey}`, 400, 'INVALID_PLAN');
    }
}

export class WebhookProcessingError extends BillingError {
    constructor(message: string) {
        super(message, 500, 'WEBHOOK_PROCESSING_ERROR');
    }
}
