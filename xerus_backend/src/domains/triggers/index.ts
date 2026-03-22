// Triggers Domain - Public API
// Webhook receiver, trigger adapters, event routing, and registration.
// Normalized event types are owned by the heartbeat domain.

// Adapter Interface and Registry
export {
    type TriggerSourceAdapter,
    BaseTriggerAdapter,
    TriggerAdapterRegistry,
    triggerAdapterRegistry,
} from './trigger-source.adapter';

// Resolver Service
export { TriggerResolver, triggerResolver } from './trigger-resolver.service';

// Adapters
export {
    PipedreamTriggerAdapter,
    getPipedreamTriggerAdapter,
    resetPipedreamTriggerAdapter,
} from './adapters/pipedream-trigger.adapter';

// Event Router
export { EventRouterService, eventRouterService } from './event-router.service';

// Webhook Receiver
export { webhookReceiverRouter } from './webhook-receiver.controller';

// Registration Service
export {
    TriggerRegistrationService,
    type ReconcileResult,
    type TriggerChange,
} from './trigger-registration.service';

// Errors
export * from './trigger.errors';
