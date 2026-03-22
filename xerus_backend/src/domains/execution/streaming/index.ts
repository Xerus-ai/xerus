// Streaming Module - Public API
// SSE streaming handler and event factory functions

export { StreamingResponse } from './stream.handler';
export { sseRegistry } from './sse-registry';

export {
    createMetaEvent,
    createProgressEvent,
    createGuidanceEvent,
    createTokenEvent,
    createToolCallEvent,
    createToolResultEvent,
    createReasoningEvent,
    createMemoryUpdateEvent,
    createKbQueryEvent,
    createSelfModerationEvent,
    createContextWarningEvent,
    createDoneEvent,
    createErrorDoneEvent,
} from './stream.events';

export { classifyErrorType, classifyErrorFromObject, extractErrorCode } from './error-classifier';

export {
    serializeSSEEvent,
    serializeDoneEvent,
    serializeExecutionStatus,
    serializeHITLAcknowledgment,
    serializeCancellationResult,
    serializeTranscriptPage,
    SequenceTracker,
} from './response.contract';

export type {
    SSEEventEnvelope,
    SSEEventMeta,
    DoneEventEnvelope,
    DoneEventPayload,
    ToolCallSummaryEntry,
    ExecutionStatusResponse,
    HITLAcknowledgmentResponse,
    CancellationResultResponse,
    TranscriptEvent,
    TranscriptPageResponse,
} from './response.contract';

export {
    serializeErrorResponse,
    serializeSSEErrorEvent,
    classifyRecoverable,
    mapErrorToHttpStatus,
} from './response.errors';

export type {
    ErrorResponse,
    SSEErrorContent,
    SSEErrorDonePayload,
    SSEErrorDoneEvent,
} from './response.errors';
