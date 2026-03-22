// Command Queue Types
// Types for backpressure control and metrics

// -----------------------------------------------------------------------------
// Backpressure Action
// Controls what happens when queue pressure increases
// -----------------------------------------------------------------------------

export type BackpressureAction = 'accept' | 'delay' | 'reject';

// -----------------------------------------------------------------------------
// Queue Position with Backpressure
// Extended position result with backpressure information
// -----------------------------------------------------------------------------

export interface CommandQueuePosition {
    request_id: string;
    position: number;
    backpressure_action: BackpressureAction;
    estimated_wait_ms?: number;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface CommandQueueConfig {
    // Max simultaneous executions per user (default 3)
    max_concurrent: number;

    // Max pending requests per user before overflow (default 20)
    max_queue_size: number;

    // Soft limit - above this, return 'delay' action
    soft_limit: number;

    // Hard limit - above this, return 'reject' action
    hard_limit: number;

    // Time after which a running lane is considered stale (ms)
    stale_timeout_ms: number;

    // Maximum allowed nesting depth for agent calls
    max_nesting_depth: number;

    // Maximum allowed max_concurrent value (absolute ceiling)
    max_concurrent_ceiling: number;

    // Base delay multiplier for backpressure (ms per position)
    delay_multiplier_ms: number;
}

export const DEFAULT_COMMAND_QUEUE_CONFIG: CommandQueueConfig = {
    max_concurrent: 3,
    max_queue_size: 20,
    soft_limit: 10,
    hard_limit: 15,
    stale_timeout_ms: 30 * 60 * 1000, // 30 minutes
    max_nesting_depth: 5,
    max_concurrent_ceiling: 10,
    delay_multiplier_ms: 100,
};

// -----------------------------------------------------------------------------
// Metrics
// -----------------------------------------------------------------------------

export interface QueueMetrics {
    // Current queue depth (pending requests)
    queue_depth: number;

    // Number of active lanes
    active_lanes: number;

    // Lane utilization (active / max_concurrent)
    lane_utilization: number;

    // Average wait time in queue (ms)
    avg_wait_time_ms: number;

    // Average processing time (ms)
    avg_processing_time_ms: number;

    // Total requests processed
    total_processed: number;

    // Total requests rejected due to backpressure
    total_rejected: number;

    // Configuration values for reference
    max_queue_size: number;
    max_concurrent: number;
}

export interface GlobalMetrics {
    // Total queue depth across all users
    total_queue_depth: number;

    // Total active lanes across all users
    total_active_lanes: number;

    // Number of users with active queues
    total_users: number;

    // Average utilization across all users
    avg_lane_utilization: number;

    // Total processed across all users
    total_processed: number;

    // Total rejected across all users
    total_rejected: number;
}

// -----------------------------------------------------------------------------
// Nesting Tracking
// For deadlock prevention in nested agent calls
// -----------------------------------------------------------------------------

export interface NestingInfo {
    // The parent lane ID
    parent_lane_id: string;

    // Current nesting depth (0 = root)
    depth: number;

    // Chain of agent slugs in the call stack
    agent_chain: string[];
}

// -----------------------------------------------------------------------------
// Extended Lane with Nesting
// -----------------------------------------------------------------------------

export interface CommandLane {
    lane_id: string;
    user_id: string;
    agent_slug: string;
    request_id: string;
    started_at: Date;
    status: 'running' | 'completed' | 'failed';

    // Request payload
    prompt: string;
    trigger_type: string;
    coordination_mode?: string;

    // Nesting information
    nesting?: NestingInfo;
}

// -----------------------------------------------------------------------------
// User-level Metrics State
// For tracking metrics per user
// -----------------------------------------------------------------------------

export interface UserMetricsState {
    // Running totals
    total_processed: number;
    total_rejected: number;

    // For wait time calculation
    wait_times: number[];

    // For processing time calculation
    processing_times: number[];

    // Custom max concurrent (if set via setMaxConcurrency)
    custom_max_concurrent?: number;
}
