// Sandbox-specific types
// Extends execution/types.ts with Daytona-specific types

import { SandboxState } from '../types';
import type { SessionHandle } from './providers/daytona-runner';

// Workspace row with sandbox columns (migration 066 absorbed sandbox_registry into workspaces)
export interface SandboxRegistryEntry {
    id: string;
    user_id: string;
    slug: string;
    name: string;
    sandbox_id: string | null;
    sandbox_status: SandboxState | null;
    sandbox_template_version: string | null;
    sandbox_active_agent_id: number | null;
    sandbox_active_execution_count: number;
    created_at: Date;
    sandbox_paused_at: Date | null;
    sandbox_last_activity_at: Date | null;
    sandbox_total_runtime_seconds: number;
    sandbox_resume_count: number;
    sandbox_novnc_url: string | null;
}

// Per-agent session handle with its env vars snapshot
export interface AgentSessionEntry {
    handle: SessionHandle;
    envVars: Record<string, string>;
}

// In-memory sandbox session
export interface SandboxSession {
    sandboxId: string;
    userId: string;
    status: SandboxState;
    createdAt: Date;
    lastActivityAt: Date;
    wasResumed: boolean;
    activeExecutionCount: number;
    // Per-agent session handles (keyed by agent slug)
    agentSessions: Map<string, AgentSessionEntry>;
    // Legacy: single runner handle for backward compat during migration
    runnerHandle?: SessionHandle;
    // Env vars baked into the runner process at creation time.
    // Used to detect stale keys on reuse (M12).
    runnerEnvVars?: Record<string, string>;
    // noVNC URL for browser access (from computerUse.start() + getSignedPreviewUrl(6080))
    novncUrl?: string;
    // ttyd URL for web terminal access (getSignedPreviewUrl(7681))
    terminalUrl?: string;
    // Setup report from runFullWorkspaceSetup (present on first creation, null on resume)
    setupReport?: { git_initialized: boolean; memory_git_initialized: boolean; sqlite_installed: boolean; duration_ms: number } | null;
}

// Sandbox creation options
export interface CreateSandboxOptions {
    userId: string;
    template?: string;
    timeoutMs?: number;
    envVars?: Record<string, string>;
}

// Sandbox operation result
export interface SandboxOperationResult {
    success: boolean;
    sandboxId: string;
    message?: string;
    durationMs: number;
}

// Sandbox status response
export interface SandboxStatusResponse {
    userId: string;
    sandboxId: string | null;
    status: SandboxState | 'none';
    lastActivityAt: Date | null;
    activeExecutionCount: number;
    resumeCount: number;
    totalRuntimeSeconds: number;
}

// Sandbox metrics for monitoring
export interface SandboxMetrics {
    activeCount: number;
    pausedCount: number;
    totalResumes: number;
    averageResumeTimeMs: number;
}
