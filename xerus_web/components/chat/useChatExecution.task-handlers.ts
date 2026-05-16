/**
 * Task / notification / auth / preview / billing handler factories for
 * useChatExecution. Split from useChatExecution.handlers.ts to keep both files
 * under the 400-line limit.
 */
import type {
  StreamEvent,
  ToolAuthRequiredEventContent,
  GuidanceEventContent,
  PreviewEventContent,
  CreditWarningEventContent,
  ProviderUnavailableEventContent,
  TaskStartedEventContent,
  TaskUpdatedEventContent,
  TaskProgressEventContent,
  TaskNotificationEventContent,
  ToolProgressEventContent,
  ToolUseSummaryEventContent,
} from '@/hooks/useExecutionStream'
import { addStatus, updateToolProgress, enrichToolSummary } from './streaming-turn-reducer'
import { toast } from '@/lib/toast'
import type { HandlerCtx } from './useChatExecution.handlers'
import type { PerConvRefs } from './useChatExecution.helpers'

function pushTurn(ctx: HandlerCtx, convId: string, refs: PerConvRefs): void {
  if (refs.turn) ctx.dispatch({ type: 'SET_STREAMING_TURN', convId, turn: refs.turn })
}

export function makeOnToolAuthRequired(ctx: HandlerCtx) {
  return (event: StreamEvent<'tool_auth_required'>) => {
    const content = event.content as ToolAuthRequiredEventContent
    if (!content) return
    ctx.dispatch({
      type: 'SET_PENDING_TOOL_AUTH',
      pendingToolAuth: { app_slug: content.app_slug, agent_slug: content.agent_slug },
    })
  }
}

export function makeOnGuidance(ctx: HandlerCtx) {
  return (event: StreamEvent<'guidance'>) => {
    const content = event.content as GuidanceEventContent
    if (!content) return
    ctx.dispatch({
      type: 'SET_PENDING_GUIDANCE',
      pendingGuidance: {
        question: content.question,
        options: content.options,
        timeout_seconds: content.timeout_seconds,
        pause_id: content.pause_id,
        scenario: content.scenario,
        tool_name: content.tool_name,
        agent_slug: content.agent_slug,
        requires_auth: content.requires_auth,
        execution_id: content.execution_id || event.execution_id,
        ui_hint: content.ui_hint,
        browser_url: content.browser_url,
        preview_url: content.preview_url,
        artifact_path: content.artifact_path,
      },
    })
  }
}

export function makeOnPreview(ctx: HandlerCtx) {
  return (event: StreamEvent<'preview'>) => {
    const content = event.content as PreviewEventContent | undefined
    if (!content?.url) return
    ctx.dispatch({
      type: 'SET_PENDING_PREVIEW',
      preview: { port: content.port, url: content.url, label: content.label, ts: Date.now() },
    })
  }
}

export function makeOnCreditWarning() {
  return (event: StreamEvent<'credit_warning'>) => {
    const content = event.content as CreditWarningEventContent | undefined
    if (!content) return
    toast.warning(`Credits running low — ${content.credits_available} of ${content.credits_total} remaining`)
  }
}

export function makeOnInsufficientCredits() {
  return () => {
    toast.error('Insufficient credits — connect your own API key for unlimited usage')
  }
}

export function makeOnProviderUnavailable() {
  return (event: StreamEvent<'provider_unavailable'>) => {
    const content = event.content as ProviderUnavailableEventContent | undefined
    if (!content) return
    toast.error('AI provider temporarily unavailable', { description: content.message })
  }
}

export function makeOnTaskStarted(ctx: HandlerCtx) {
  return (event: StreamEvent<'task_started'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as TaskStartedEventContent
    const refs = ctx.getRefs(convId)
    if (refs.turn) {
      refs.turn = addStatus(refs.turn, `Started: ${content.taskName}`)
      pushTurn(ctx, convId, refs)
    }
    ctx.dispatch({
      type: 'ADD_BACKGROUND_TASK',
      task: {
        id: content.taskId,
        name: content.taskName,
        description: content.taskDescription,
        status: 'running',
        startedAt: Date.now(),
      },
    })
  }
}

export function makeOnTaskUpdated(ctx: HandlerCtx) {
  return (event: StreamEvent<'task_updated'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as TaskUpdatedEventContent
    const refs = ctx.getRefs(convId)
    const label = content.status === 'completed' ? 'Completed task'
      : content.status === 'failed' ? 'Task failed'
        : null
    if (refs.turn && label) {
      refs.turn = addStatus(refs.turn, label)
      pushTurn(ctx, convId, refs)
    }
    ctx.dispatch({ type: 'UPDATE_BACKGROUND_TASK', taskId: content.taskId, status: content.status })
  }
}

export function makeOnTaskProgress(ctx: HandlerCtx) {
  return (event: StreamEvent<'task_progress'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as TaskProgressEventContent
    if (!content.message) return
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = addStatus(refs.turn, content.message)
    pushTurn(ctx, convId, refs)
  }
}

export function makeOnTaskNotification(ctx: HandlerCtx) {
  return (event: StreamEvent<'task_notification'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as TaskNotificationEventContent
    const text = content.status === 'completed' ? `Finished: ${content.taskSubject}`
      : content.status === 'failed' ? `Failed: ${content.taskSubject}`
        : content.taskSubject
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = addStatus(refs.turn, text)
    pushTurn(ctx, convId, refs)
  }
}

export function makeOnToolProgress(ctx: HandlerCtx) {
  return (event: StreamEvent<'tool_progress'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as ToolProgressEventContent
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = updateToolProgress(refs.turn, content.toolUseId, content.progress.message)
    pushTurn(ctx, convId, refs)
  }
}

export function makeOnToolUseSummary(ctx: HandlerCtx) {
  return (event: StreamEvent<'tool_use_summary'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as ToolUseSummaryEventContent
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = enrichToolSummary(refs.turn, content.toolUseId, content.durationMs, content.output, content.status)
    pushTurn(ctx, convId, refs)
  }
}
