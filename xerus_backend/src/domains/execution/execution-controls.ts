// Execution Controls
// HITL response and cancellation logic, extracted from ExecutionService.

import { logger } from '../../utils/logger';
import { sendCommand } from '../sandbox-infra/sandbox';
import type { StreamSink } from './streaming/stream.handler';
import type { SessionHandle } from '../sandbox-infra/sandbox/providers/daytona-runner';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';

const log = logger('ExecutionControls');

export interface ActiveExecution {
    handle: SessionHandle;
    agentSlug: string;
    stream: StreamSink;
    sandboxId: string;
    userId: string;
}

export async function respondToHitl(
    active: ActiveExecution,
    provider: DaytonaProvider,
    pauseId: string,
    approved: boolean,
    feedback?: string,
): Promise<void> {
    await sendCommand(active.handle, {
        type: 'hitl_response',
        pause_id: pauseId,
        approved,
        feedback,
    });

    const responseContent = JSON.stringify({ approved, feedback: feedback || '', timestamp: new Date().toISOString() });
    provider.getSandboxInstance(active.sandboxId)
        .then(sandbox => sandbox.fs.uploadFile(
            Buffer.from(responseContent, 'utf-8'),
            `/tmp/xerus-hitl/${pauseId}.response`,
        ))
        .catch(err => log.warn('Failed to write HITL response file', { error: (err as Error).message }));
}

export function cancelExecution(
    active: ActiveExecution,
    provider: DaytonaProvider,
    executionId: string,
): void {
    provider.getSandboxInstance(active.sandboxId)
        .then(sandbox => sandbox.process.deleteSession(active.handle.sessionId))
        .then(() => log.info('Cancelled: deleted runner session', { execution_id: executionId, session: active.handle.sessionId }))
        .catch(err => log.error('Failed to delete runner session', { execution_id: executionId, error: (err as Error).message }));

    if (!active.stream.isClosed()) {
        active.stream.send('stop', { reason: 'user_cancel' });
    }
}
