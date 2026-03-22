// Heartbeat Domain - Public API

// Types (selective: only public-facing types, not internal row types)
export {
    HEARTBEAT_EXECUTION_STATUSES,
    HEARTBEAT_OUTCOMES,
    HEARTBEAT_TRIGGER_TYPES,
} from './types';
export type {
    HeartbeatExecutionStatus,
    HeartbeatOutcome,
    HeartbeatTriggerType,
    HeartbeatConfig,
    HeartbeatExecution,
    HeartbeatRunResult,
    CreateHeartbeatConfigDTO,
    UpdateHeartbeatConfigDTO,
    HeartbeatExecutionListOptions,
    PaginatedHeartbeatExecutions,
    HeartbeatState,
    CreateHeartbeatExecutionDTO,
} from './types';

// Errors
export {
    HeartbeatConfigNotFoundError,
    HeartbeatConfigAccessDeniedError,
    HeartbeatExecutionNotFoundError,
    AgentOwnershipError,
    AgentNotFoundForHeartbeatError,
    HeartbeatValidationError,
    HeartbeatAgentBusyError,
    HeartbeatAgentPausedError,
    HeartbeatBudgetExceededError,
    HeartbeatOutsideActiveHoursError,
} from './errors';

// Normalized event types (re-exported for convenience)
export * from './normalized-event.types';
export { HeartbeatConfigRepository, heartbeatConfigRepository } from './heartbeat-config.repository';
export { HeartbeatExecutionRepository, heartbeatExecutionRepository } from './heartbeat-execution.repository';
export { HeartbeatConfigService, heartbeatConfigService } from './heartbeat-config.service';
export {
    HeartbeatStaggerService,
    heartbeatStaggerService,
    computeStaggerOffset,
    cronToIntervalMs,
} from './heartbeat-stagger.service';
export type { StaggerOffsetResult } from './heartbeat-stagger.service';
export {
    HeartbeatProcessorService,
    heartbeatProcessorService,
    buildContextMessage,
    parseHeartbeatMd,
    parseRoutingTags,
    naturalLanguageToCron,
} from './heartbeat-processor.service';
export type {
    HeartbeatRequest,
    HeartbeatOutput,
    RoutedPost,
    RoutedAlert,
    ParsedScheduleEntry,
    ParsedEventEntry,
    ParsedHeartbeatMd,
} from './heartbeat-processor.service';
export { HeartbeatInboxService } from './heartbeat-inbox.service';
export type {
    ChannelSlugResolver,
    ProcessHeartbeatOutputInput,
    ProcessHeartbeatOutputResult,
} from './heartbeat-inbox.service';
export {
    HeartbeatRunnerService,
    heartbeatRunnerService,
} from './heartbeat-runner.service';
export type {
    HeartbeatDispatchFn,
    HeartbeatSnapshotFn,
} from './heartbeat-runner.service';
export {
    generateHeartbeatMd,
    cronToHumanReadable,
} from './heartbeat-md-parser';
export type { HeartbeatMdInput } from './heartbeat-md-parser';
export { HeartbeatStateRepository, heartbeatStateRepository } from './heartbeat-state.repository';
export { SnapshotService, snapshotService } from './snapshot/snapshot.service';
export { SnapshotConfigRepository, snapshotConfigRepository } from './snapshot/snapshot-config.repository';
export { SnapshotExecutionRepository, snapshotExecutionRepository } from './snapshot/snapshot-execution.repository';
export type {
    SnapshotConfig,
    SnapshotExecution,
    SnapshotResult,
    SnapshotSource,
    SnapshotSourceError,
} from './snapshot/snapshot.types';
