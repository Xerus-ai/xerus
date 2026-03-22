// Command Queue Metrics
// Per-user metrics state tracking and metric computation helpers

import type {
    QueueMetrics,
    GlobalMetrics,
    UserMetricsState,
} from './command-queue.types';

// -----------------------------------------------------------------------------
// Metrics State Management
// -----------------------------------------------------------------------------

export function createEmptyMetricsState(): UserMetricsState {
    return {
        total_processed: 0,
        total_rejected: 0,
        wait_times: [],
        processing_times: [],
    };
}

export function incrementProcessed(state: UserMetricsState): void {
    state.total_processed++;
}

export function incrementRejected(state: UserMetricsState): void {
    state.total_rejected++;
}

export function recordWaitTime(state: UserMetricsState, waitTimeMs: number): void {
    state.wait_times.push(waitTimeMs);
    // Keep only last 100 samples
    if (state.wait_times.length > 100) {
        state.wait_times.shift();
    }
}

export function recordProcessingTime(state: UserMetricsState, processingTimeMs: number): void {
    state.processing_times.push(processingTimeMs);
    // Keep only last 100 samples
    if (state.processing_times.length > 100) {
        state.processing_times.shift();
    }
}

// -----------------------------------------------------------------------------
// Metric Computation
// -----------------------------------------------------------------------------

export function calculateAverage(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

export function computeUserMetrics(
    state: UserMetricsState,
    queueDepth: number,
    activeLaneCount: number,
    maxConcurrent: number,
    maxQueueSize: number,
): QueueMetrics {
    return {
        queue_depth: queueDepth,
        active_lanes: activeLaneCount,
        lane_utilization: maxConcurrent > 0 ? activeLaneCount / maxConcurrent : 0,
        avg_wait_time_ms: calculateAverage(state.wait_times),
        avg_processing_time_ms: calculateAverage(state.processing_times),
        total_processed: state.total_processed,
        total_rejected: state.total_rejected,
        max_queue_size: maxQueueSize,
        max_concurrent: maxConcurrent,
    };
}

export function computeGlobalMetrics(
    userMetricsList: QueueMetrics[],
): GlobalMetrics {
    let totalQueueDepth = 0;
    let totalActiveLanes = 0;
    let totalProcessed = 0;
    let totalRejected = 0;
    let totalUtilization = 0;

    for (const metrics of userMetricsList) {
        totalQueueDepth += metrics.queue_depth;
        totalActiveLanes += metrics.active_lanes;
        totalProcessed += metrics.total_processed;
        totalRejected += metrics.total_rejected;
        totalUtilization += metrics.lane_utilization;
    }

    const userCount = userMetricsList.length;

    return {
        total_queue_depth: totalQueueDepth,
        total_active_lanes: totalActiveLanes,
        total_users: userCount,
        avg_lane_utilization: userCount > 0 ? totalUtilization / userCount : 0,
        total_processed: totalProcessed,
        total_rejected: totalRejected,
    };
}

// -----------------------------------------------------------------------------
// Estimated Wait Time
// -----------------------------------------------------------------------------

export function calculateEstimatedWait(
    state: UserMetricsState | undefined,
    position: number,
    delayMultiplierMs: number,
): number {
    if (!state || state.processing_times.length === 0) {
        // Default estimate based on position and delay multiplier
        return position * delayMultiplierMs;
    }

    const avgProcessingTime = calculateAverage(state.processing_times);
    return position * avgProcessingTime;
}
