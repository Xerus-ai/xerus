// Sandbox Provider Interface
// Abstraction layer for sandbox providers (Daytona, Docker, local)

import { SandboxState } from '../../types';

// Provider-agnostic sandbox handle
export interface ProviderSandbox {
    readonly sandboxId: string;
    readonly metadata?: Record<string, string>;
}

// Options for creating a new sandbox
export interface CreateProviderSandboxOptions {
    snapshot?: string;  // Daytona snapshot (base image)
    timeoutMs?: number;
    envVars?: Record<string, string>;
    metadata?: Record<string, string>;
}

// Sandbox status from provider
export interface ProviderSandboxStatus {
    sandboxId: string;
    state: SandboxState;
    createdAt?: Date;
    metadata?: Record<string, string>;
}

// Provider capabilities
export interface ProviderCapabilities {
    supportsPause: boolean;
    supportsResume: boolean;
    supportsTimeout: boolean;
    maxLifetimeMs: number;
}

// Sandbox provider interface
export interface SandboxProvider {
    readonly name: string;
    readonly capabilities: ProviderCapabilities;

    // Create a new sandbox
    create(options: CreateProviderSandboxOptions): Promise<ProviderSandbox>;

    // Connect to an existing sandbox (resume from paused state)
    connect(sandboxId: string): Promise<ProviderSandbox>;

    // Pause a sandbox (preserves state, can be resumed)
    pause(sandboxId: string): Promise<void>;

    // Kill a sandbox (terminates, cannot be resumed)
    kill(sandboxId: string): Promise<void>;

    // Get status of a sandbox
    // Throws SandboxNotFoundError if sandbox does not exist
    getStatus(sandboxId: string): Promise<ProviderSandboxStatus>;
}

// Provider types enum for factory
export const PROVIDER_TYPES = ['daytona'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
