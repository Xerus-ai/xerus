// Plan Lifecycle Service — handles workspace resize/recreate for plan changes
// Extracted from drive.service.ts for file size compliance (<400 lines)

import {
    SandboxService,
    SANDBOX_CONFIG,
    createWorkspaceTar,
} from '../sandbox-infra';
import type { DaytonaProvider } from '../sandbox-infra';
import type { PlanType } from '../users/types';
import type { S3BackupService } from '../sandbox-infra/storage/s3-backup.service';
import { shellEscapePath } from '../../utils/shell-safety';
import { logger } from '../../utils/logger';

const log = logger('DrivePlanLifecycle');

export interface WorkspaceUsageResult {
    disk_used_mb: number;
    disk_limit_mb: number;
    disk_used_percent: number;
    plan: string;
}

interface PlanLifecycleDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const PLAN_DISK: Record<PlanType, number> = { pro: 10, max: 25, ultra: 50 };
const PLAN_ORDER: Record<PlanType, number> = { pro: 1, max: 2, ultra: 3 };
const PLAN_RESOURCES: Record<PlanType, { cpu: number; memory: number; disk: number }> = {
    pro: { cpu: 1, memory: 2, disk: 10 },
    max: { cpu: 2, memory: 4, disk: 25 },
    ultra: { cpu: 4, memory: 8, disk: 50 },
};

export class DrivePlanLifecycleService {
    private usageCache = new Map<string, { data: WorkspaceUsageResult; expiresAt: number }>();
    private static readonly USAGE_CACHE_TTL_MS = 60_000;

    constructor(
        private readonly sandboxService: SandboxService,
        private readonly db: PlanLifecycleDatabase,
        private readonly backupService?: S3BackupService,
    ) {}

    async getUsage(userId: string, sandboxId: string, provider: DaytonaProvider): Promise<WorkspaceUsageResult> {
        const now = Date.now();
        const cached = this.usageCache.get(userId);
        if (cached && cached.expiresAt > now) return cached.data;

        const workspacePath = SANDBOX_CONFIG.workspacePath;
        const result = await provider.executeCommand(
            sandboxId,
            `du -sm ${shellEscapePath(workspacePath)} 2>/dev/null | cut -f1`,
        );
        const diskUsedMb = parseInt(result.result.trim(), 10) || 0;

        const planType = await this.getUserPlanType(userId);
        const diskLimitMb = (PLAN_DISK[planType] || 10) * 1024;
        const diskUsedPercent = diskLimitMb > 0 ? Math.round((diskUsedMb / diskLimitMb) * 100) : 0;

        const data: WorkspaceUsageResult = { disk_used_mb: diskUsedMb, disk_limit_mb: diskLimitMb, disk_used_percent: diskUsedPercent, plan: planType };
        this.usageCache.set(userId, { data, expiresAt: now + DrivePlanLifecycleService.USAGE_CACHE_TTL_MS });
        return data;
    }

    async resizeForPlan(userId: string, provider: DaytonaProvider): Promise<{ resized: true; sandbox_plan: string }> {
        const activeCount = this.sandboxService.getActiveExecutionCount(userId);
        if (activeCount > 0) {
            throw new Error(`Cannot resize: ${activeCount} agent(s) currently running. Stop all agents first.`);
        }

        const currentPlan = await this.getSandboxPlan(userId);
        const targetPlan = await this.getUserPlanType(userId);
        if (PLAN_ORDER[targetPlan] <= PLAN_ORDER[currentPlan as PlanType]) {
            throw new Error(`Cannot resize: target plan '${targetPlan}' is not higher than current sandbox plan '${currentPlan}'`);
        }

        const resources = PLAN_RESOURCES[targetPlan];
        const session = this.sandboxService.getSession(userId);
        if (!session) throw new Error('No active sandbox session');

        await provider.pause(session.sandboxId);
        session.status = 'paused';
        try {
            await provider.resizeSandbox(session.sandboxId, { cpu: resources.cpu, memory: resources.memory, disk: resources.disk });
        } catch (err) {
            try { await provider.start(session.sandboxId); session.status = 'running'; } catch { /* sandbox stuck paused — next getOrCreate will resume */ }
            throw err;
        }
        try {
            await provider.start(session.sandboxId);
            session.status = 'running';
        } catch (startErr) {
            log.error('Sandbox start failed after resize — sandbox is paused', { user_id: userId, sandbox_id: session.sandboxId, error: (startErr as Error).message });
            throw new Error(`Resize succeeded but sandbox failed to restart: ${(startErr as Error).message}. Try starting your workspace from Settings.`);
        }

        await this.updateSandboxPlan(userId, targetPlan);
        session.sandboxPlan = targetPlan;
        return { resized: true, sandbox_plan: targetPlan };
    }

    async recreateForPlan(userId: string, provider: DaytonaProvider): Promise<{ recreated: true; sandbox_plan: string; sandbox_id: string }> {
        const activeCount = this.sandboxService.getActiveExecutionCount(userId);
        if (activeCount > 0) {
            throw new Error(`Cannot recreate: ${activeCount} agent(s) currently running. Stop all agents first.`);
        }

        if (!this.backupService) {
            throw new Error('Cannot recreate sandbox: backup service is not configured. Contact support.');
        }

        const targetPlan = await this.getUserPlanType(userId);

        const session = this.sandboxService.getSession(userId);
        if (session) {
            const buffer = await createWorkspaceTar(provider, session.sandboxId);
            await this.backupService.createSnapshot(userId, buffer);
            log.info('Safety-net snapshot before recreate', { user_id: userId });
        }

        await this.sandboxService.killSandbox(userId);

        try {
            const newSession = await this.sandboxService.createSandbox({ userId });
            return { recreated: true, sandbox_plan: targetPlan, sandbox_id: newSession.sandboxId };
        } catch (createErr) {
            log.error('Sandbox creation failed after kill during recreate', { user_id: userId, error: (createErr as Error).message });
            throw new Error(`Sandbox was destroyed but recreation failed: ${(createErr as Error).message}. Your data is safe in S3 backups. Try creating a new workspace from Settings.`);
        }
    }

    async getUserPlanType(userId: string): Promise<PlanType> {
        const result = await this.db.query<{ plan_type: string }>('SELECT plan_type FROM users WHERE user_id = $1', [userId]);
        const planType = result.rows[0]?.plan_type;
        if (!planType) throw new Error(`User ${userId} has no plan_type`);
        return planType as PlanType;
    }

    async getSandboxPlan(userId: string): Promise<string> {
        const result = await this.db.query<{ sandbox_plan: string | null }>('SELECT sandbox_plan FROM workspaces WHERE user_id = $1', [userId]);
        return result.rows[0]?.sandbox_plan || 'pro';
    }

    private async updateSandboxPlan(userId: string, plan: string): Promise<void> {
        await this.db.query('UPDATE workspaces SET sandbox_plan = $2, updated_at = NOW() WHERE user_id = $1', [userId, plan]);
        this.sandboxService.invalidateRegistryCache(userId);
    }
}
