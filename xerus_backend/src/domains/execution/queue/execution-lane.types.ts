// Execution Lane Types
// Queue and lane management for concurrent agent execution within shared sandbox

import { ExecutionStatus, CoordinationMode } from '../types';

// -----------------------------------------------------------------------------
// Trigger Priority
// Controls execution order - lower number = higher priority (processed first)
// -----------------------------------------------------------------------------

export const TRIGGER_PRIORITIES = {
    user_message: 1, // Highest - user is waiting
    channel_message: 1, // Same priority as user_message - human sent in channel
    mention: 2, // User-initiated via @mention
    team: 3, // Another agent delegated
    schedule: 4, // Scheduled trigger
    heartbeat: 5, // Lowest - proactive check
} as const;

export type TriggerType = keyof typeof TRIGGER_PRIORITIES;

type TriggerPriority = (typeof TRIGGER_PRIORITIES)[TriggerType];

// -----------------------------------------------------------------------------
// Execution Queue Request (in-memory only)
// DB table execution_queue was dropped (migration 052). Queue is in-memory.
// -----------------------------------------------------------------------------

type QueueStatus = 'queued' | 'claimed' | 'processing' | 'completed' | 'failed';

export interface ExecutionQueueRow {
    id: string;
    user_id: string;
    agent_slug: string;
    priority: number;
    trigger_type: string;
    prompt: string | null;
    metadata: Record<string, unknown> | null;
    coordination_mode: CoordinationMode | null;
    status: QueueStatus;
    claimed_at: Date | null;
    created_at: Date;
}

export interface ExecutionQueueRequest {
    id: string;
    user_id: string;
    agent_slug: string;
    trigger_type: TriggerType;
    priority: TriggerPriority;
    prompt: string;
    metadata?: Record<string, unknown>;
    coordination_mode?: CoordinationMode;
    status?: QueueStatus;
    claimed_at?: Date | null;
    created_at: Date;
}

export interface CreateExecutionRequest {
    user_id: string;
    agent_slug: string;
    trigger_type: TriggerType;
    prompt: string;
    metadata?: Record<string, unknown>;
    coordination_mode?: CoordinationMode;
}

// -----------------------------------------------------------------------------
// Execution Lane (in-memory only)
// DB table execution_lanes was dropped (migration 052).
// Represents a concurrency slot with optional execution tracking
// -----------------------------------------------------------------------------

export interface ExecutionLaneRow {
    id: string;
    user_id: string;
    lane_number: number;
    current_execution_id: string | null;
    busy: boolean;
    last_activity_at: Date;
    agent_slug: string | null;
    started_at: Date | null;
    prompt: string | null;
    trigger_type: TriggerType | null;
    coordination_mode: CoordinationMode | null;
    status: ExecutionStatus;
}

export interface ExecutionLane {
    lane_id: string;
    user_id: string;
    lane_number: number;
    agent_slug: string | null;
    request_id: string | null;
    busy: boolean;
    started_at: Date | null;
    last_activity_at: Date;
    status: ExecutionStatus;
    prompt: string | null;
    trigger_type: TriggerType | null;
    coordination_mode?: CoordinationMode;
}

// -----------------------------------------------------------------------------
// Queue Configuration
// Controls queue behavior
// -----------------------------------------------------------------------------

export interface QueueConfig {
    max_concurrent: number; // Max simultaneous executions per user (default 3)
    max_queue_size: number; // Max pending requests per user
    stale_timeout_ms: number; // Time after which a running lane is considered stale
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
    max_concurrent: 3,
    max_queue_size: 50,
    stale_timeout_ms: 6 * 60 * 1000, // 6 minutes (slightly > MAX_EXECUTION_TIMEOUT of 5 min)
};

// -----------------------------------------------------------------------------
// Queue State
// Tracking queue position and active lanes
// -----------------------------------------------------------------------------

export interface QueuePosition {
    request_id: string;
    position: number; // 0 = next to execute
    estimated_wait_ms?: number;
}

export interface UserQueueState {
    user_id: string;
    active_lanes: ExecutionLane[];
    pending_count: number;
    available_slots: number;
}

// -----------------------------------------------------------------------------
// Conflict Types
// For handling concurrent execution conflicts
// -----------------------------------------------------------------------------

export type ConflictReason = 'agent_already_running' | 'queue_full' | 'user_lane_limit';

export interface ConflictResult {
    conflict: true;
    reason: ConflictReason;
    message: string;
}

export interface NoConflictResult {
    conflict: false;
}

export type ConflictCheckResult = ConflictResult | NoConflictResult;

// -----------------------------------------------------------------------------
// Stale Lane Cleanup
// For tracking and auditing stale lane cleanup operations
// -----------------------------------------------------------------------------

export interface StaleLaneCleanupResult {
    lane_id: string;
    user_id: string;
    agent_slug: string | null;
    request_id: string | null;
    started_at: Date | null;
    age_ms: number;
    timeout_ms: number;
}
