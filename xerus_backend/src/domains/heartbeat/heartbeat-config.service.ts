// Heartbeat Config Service
// Wraps repository with ownership validation

import { HeartbeatConfigRepository, heartbeatConfigRepository } from './heartbeat-config.repository';
import { HeartbeatExecutionRepository, heartbeatExecutionRepository } from './heartbeat-execution.repository';
import {
    HeartbeatConfig,
    CreateHeartbeatConfigDTO,
    UpdateHeartbeatConfigDTO,
    HeartbeatExecutionListOptions,
    PaginatedHeartbeatExecutions,
    HeartbeatExecution,
} from './types';
import {
    HeartbeatConfigNotFoundError,
    AgentOwnershipError,
    AgentNotFoundForHeartbeatError,
} from './errors';
import { HeartbeatStaggerService, heartbeatStaggerService } from './heartbeat-stagger.service';
import { agentRegistryRepository } from '../agents/agent-registry.repository';

type StaggerUpdateCallback = (agentId: number, offsetMs: number) => void;

export class HeartbeatConfigService {
    private onStaggerUpdate: StaggerUpdateCallback | null = null;

    constructor(
        private configRepository: HeartbeatConfigRepository = heartbeatConfigRepository,
        private executionRepository: HeartbeatExecutionRepository = heartbeatExecutionRepository,
        private staggerService: HeartbeatStaggerService = heartbeatStaggerService
    ) {}

    setStaggerUpdateCallback(cb: StaggerUpdateCallback): void {
        this.onStaggerUpdate = cb;
    }

    async getByAgentId(agentId: number, userId: string): Promise<HeartbeatConfig> {
        await this.validateAgentOwnership(agentId, userId);

        const config = await this.configRepository.getByAgentId(agentId);
        if (!config) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        return config;
    }

    async getByAgentIdOrNull(agentId: number, userId: string): Promise<HeartbeatConfig | null> {
        await this.validateAgentOwnership(agentId, userId);
        return this.configRepository.getByAgentId(agentId);
    }

    async upsert(
        data: Omit<CreateHeartbeatConfigDTO, 'user_id'>,
        userId: string
    ): Promise<HeartbeatConfig> {
        await this.validateAgentOwnership(data.agent_id, userId);

        const configData: CreateHeartbeatConfigDTO = {
            ...data,
            user_id: userId,
        };

        const config = await this.configRepository.upsert(configData);
        await this.recalculateAndNotify(userId);
        return config;
    }

    async update(agentId: number, data: UpdateHeartbeatConfigDTO, userId: string): Promise<HeartbeatConfig> {
        await this.validateAgentOwnership(agentId, userId);

        const existing = await this.configRepository.getByAgentId(agentId);
        if (!existing) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        const updated = await this.configRepository.update(agentId, data);
        if (!updated) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        if (data.cron_expression !== undefined || data.enabled !== undefined) {
            await this.recalculateAndNotify(existing.user_id);
        }

        return updated;
    }

    async delete(agentId: number, userId: string): Promise<boolean> {
        await this.validateAgentOwnership(agentId, userId);
        const config = await this.configRepository.getByAgentId(agentId);
        const deleted = await this.configRepository.deleteByAgentId(agentId);
        if (deleted && config) {
            await this.recalculateAndNotify(config.user_id);
        }
        return deleted;
    }

    async enable(agentId: number, userId: string): Promise<HeartbeatConfig> {
        return this.update(agentId, { enabled: true }, userId);
    }

    async disable(agentId: number, userId: string): Promise<HeartbeatConfig> {
        return this.update(agentId, { enabled: false }, userId);
    }

    async listExecutions(
        agentId: number,
        userId: string,
        options?: HeartbeatExecutionListOptions
    ): Promise<PaginatedHeartbeatExecutions> {
        await this.validateAgentOwnership(agentId, userId);
        return this.executionRepository.listByAgentId(agentId, options);
    }

    async getLatestExecution(agentId: number, userId: string): Promise<HeartbeatExecution | null> {
        await this.validateAgentOwnership(agentId, userId);
        return this.executionRepository.getLatestByAgentId(agentId);
    }

    private async recalculateAndNotify(userId: string): Promise<void> {
        const results = await this.staggerService.recalculateForUser(userId);
        if (this.onStaggerUpdate) {
            for (const r of results) {
                this.onStaggerUpdate(r.agent_id, r.stagger_offset_ms);
            }
        }
    }

    private async validateAgentOwnership(agentId: number, userId: string): Promise<void> {
        const agent = await agentRegistryRepository.findById(agentId);

        if (!agent) {
            throw new AgentNotFoundForHeartbeatError(agentId);
        }

        if (agent.user_id !== userId) {
            throw new AgentOwnershipError(agentId, userId);
        }
    }
}

export const heartbeatConfigService = new HeartbeatConfigService();
