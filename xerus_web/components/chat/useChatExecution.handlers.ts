/**
 * Stream / agent / tool / subagent handler factories for useChatExecution.
 * Pure functions — given a HandlerCtx, return SSE event callbacks.
 * Task / notification / billing handlers live in useChatExecution.task-handlers.ts
 * to keep both files under the 400-line limit.
 */
import type {
  StreamEvent,
  TokenEventContent,
  ToolCallEventContent,
  ToolResultEventContent,
  ProgressEventContent,
  MetaEventContent,
  ReasoningEventContent,
  SubagentStartEventContent,
  SubagentStopEventContent,
  DelegationEventContent,
  NotificationEventContent,
  AgentMessageEventContent,
} from '@/hooks/useExecutionStream'
import { resolveToolIcon } from './tool-icon.utils'
import {
  createStreamingTurn,
  appendToken,
  appendReasoning,
  startToolCall,
  completeToolCall,
  addStatus,
} from './streaming-turn-reducer'
import type { ChatAction } from './chatReducer'
import {
  type PerConvRefs,
  INFRA_NOISE,
  VIEWABLE_EXTS,
  WRITE_TOOLS,
  modelContextSize,
  fileExtension,
  normalizeSandboxPath,
} from './useChatExecution.helpers'

export interface HandlerCtx {
  getRefs: (convId: string) => PerConvRefs
  getConvId: () => string | null
  dispatch: (action: ChatAction) => void
  scheduleTokenFlush: (convId: string) => void
}

function pushTurn(ctx: HandlerCtx, convId: string, refs: PerConvRefs): void {
  if (refs.turn) ctx.dispatch({ type: 'SET_STREAMING_TURN', convId, turn: refs.turn })
}

export function makeOnToken(ctx: HandlerCtx) {
  return (event: StreamEvent<'token'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as TokenEventContent
    const text = content.text
    if (text.includes('"type":"error"') && text.includes('"api_error"')) return
    const refs = ctx.getRefs(convId)
    refs.rawText += text
    // Use actual token count from backend when available, fall back to estimation
    refs.tokenCount += content.tokenCount > 0 ? content.tokenCount : Math.ceil(text.length / 4)
    refs.pendingTokenText += text
    if (refs.pendingTokenFrame === null) {
      refs.pendingTokenFrame = requestAnimationFrame(() => ctx.scheduleTokenFlush(convId))
    }
  }
}

export function makeOnProgress(ctx: HandlerCtx) {
  return (event: StreamEvent<'progress'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as ProgressEventContent
    const isNoise = INFRA_NOISE.has(content.phase.toLowerCase())
    const refs = ctx.getRefs(convId)
    if (refs.turn && !isNoise) {
      refs.turn = addStatus(refs.turn, content.phase)
      pushTurn(ctx, convId, refs)
    } else if (!refs.turn && !isNoise) {
      refs.pendingStatusLabels.push(content.phase)
    }
    ctx.dispatch({
      type: 'PUSH_EXECUTION_STEP',
      convId,
      step: { id: `step-${Date.now()}`, name: content.phase, status: 'active', startTime: Date.now() },
      currentNode: content.phase,
      markPrevCompleted: true,
    })
  }
}

export function makeOnToolCall(ctx: HandlerCtx) {
  return (event: StreamEvent<'tool_call'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as ToolCallEventContent
    const refs = ctx.getRefs(convId)
    refs.toolStartTimes.set(content.callId, Date.now())
    refs.toolMeta.set(content.callId, {
      toolName: content.toolName,
      filePath: content.arguments?.file_path as string | undefined,
      oldString: content.arguments?.old_string as string | undefined,
      newString: content.arguments?.new_string as string | undefined,
    })
    if (!refs.turn) return
    refs.turn = startToolCall(refs.turn, content.callId, content.toolName, resolveToolIcon(content.toolName), content.arguments)
    pushTurn(ctx, convId, refs)
  }
}

export function makeOnToolResult(ctx: HandlerCtx) {
  return (event: StreamEvent<'tool_result'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const content = event.content as ToolResultEventContent
    const now = Date.now()
    const refs = ctx.getRefs(convId)
    const startTime = refs.toolStartTimes.get(content.callId)
    refs.toolStartTimes.delete(content.callId)
    const meta = refs.toolMeta.get(content.callId)
    refs.toolMeta.delete(content.callId)

    if (refs.turn) {
      refs.turn = completeToolCall(refs.turn, content.callId, content.result, content.success, startTime ? now - startTime : undefined)
      pushTurn(ctx, convId, refs)
    }

    const rawPath = meta?.filePath ?? ''
    const filePath = normalizeSandboxPath(rawPath)
    const ext = fileExtension(filePath)
    const isWriteTool = !!meta && WRITE_TOOLS.has(meta.toolName)
    const isPlanFile = filePath.includes('/plans/') || filePath.endsWith('-plan.md')
    if (isWriteTool && content.success && (VIEWABLE_EXTS.has(ext) || isPlanFile)) {
      const fileName = filePath.split('/').pop() ?? filePath
      const editDiff = meta?.oldString && meta?.newString
        ? { oldString: meta.oldString, newString: meta.newString }
        : undefined
      ctx.dispatch({
        type: 'SET_PENDING_ARTIFACT_FILE',
        file: { name: fileName, path: filePath, extension: ext, ts: now, editDiff },
      })
      if (refs.turn) {
        const existing = refs.turn.writtenFiles ?? []
        if (!existing.some(f => f.path === filePath)) {
          refs.turn = { ...refs.turn, writtenFiles: [...existing, { name: fileName, path: filePath, extension: ext }] }
        }
      }
    }
  }
}

export function makeOnMeta(ctx: HandlerCtx) {
  return (event: StreamEvent<'meta'>) => {
    const content = event.content as MetaEventContent & { conversationId?: string }
    const convId = content?.conversationId ?? ctx.getConvId()
    if (!convId) return
    const refs = ctx.getRefs(convId)

    if (content.agentSlug || content.agentName) {
      refs.respondingAgent = {
        agentSlug: content.agentSlug ?? refs.respondingAgent.agentSlug,
        agentName: content.agentName ?? refs.respondingAgent.agentName,
      }
      ctx.dispatch({ type: 'SET_RESPONDING_AGENT', convId, respondingAgent: refs.respondingAgent })
    }
    if (content.model) {
      refs.tokenCount = 0
      refs.modelContextSize = modelContextSize(content.model)
      ctx.dispatch({ type: 'SET_TOKEN_USAGE', convId, tokenUsage: { used: 0, total: refs.modelContextSize } })
    }
    if (content.agentName) {
      let turn = createStreamingTurn(content.agentSlug ?? refs.respondingAgent.agentSlug, content.agentName ?? refs.respondingAgent.agentName)
      for (const label of refs.pendingStatusLabels) turn = addStatus(turn, label)
      refs.pendingStatusLabels = []
      refs.turn = turn
      ctx.dispatch({ type: 'SET_STREAMING_TURN', convId, turn })
      ctx.dispatch({
        type: 'SET_EXECUTION_STATE',
        convId,
        executionState: { mode: 'simple', steps: [], completedSteps: 0, currentNode: `Running ${content.agentName}` },
      })
    }
    if (content.conversationId) {
      ctx.dispatch({ type: 'SET_CONVERSATION_ID', convId: content.conversationId })
    }
  }
}

export function makeOnReasoning(ctx: HandlerCtx) {
  return (event: StreamEvent<'reasoning'>) => {
    const convId = ctx.getConvId()
    if (!convId) return
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = appendReasoning(refs.turn, (event.content as ReasoningEventContent).thought + '\n')
    pushTurn(ctx, convId, refs)
  }
}

export function makeOnSubagentStart(ctx: HandlerCtx) {
  return (event: StreamEvent<'subagent_start'>) => {
    const convId = ctx.getConvId()
    const content = event.content as SubagentStartEventContent
    if (!convId || !content) return
    const refs = ctx.getRefs(convId)
    if (refs.turn) {
      refs.turn = addStatus(refs.turn, `${content.subagentType}: ${content.taskDescription || 'working...'}`)
      pushTurn(ctx, convId, refs)
    }
    const taskId = `subagent-${Date.now()}`
    ctx.dispatch({
      type: 'PUSH_EXECUTION_STEP',
      convId,
      step: {
        id: taskId,
        name: content.taskDescription || content.subagentType,
        status: 'active',
        startTime: Date.now(),
      },
    })
    ctx.dispatch({
      type: 'ADD_BACKGROUND_TASK',
      task: {
        id: taskId,
        name: content.taskDescription || content.subagentType,
        description: content.subagentType,
        status: 'running',
        startedAt: Date.now(),
      },
    })
  }
}

export function makeOnSubagentStop(ctx: HandlerCtx) {
  return (event: StreamEvent<'subagent_stop'>) => {
    const convId = ctx.getConvId()
    const content = event.content as SubagentStopEventContent
    if (!convId || !content) return
    const refs = ctx.getRefs(convId)
    if (refs.turn) {
      const label = content.success
        ? `${content.subagentType} completed`
        : `${content.subagentType} failed${content.error ? `: ${content.error}` : ''}`
      refs.turn = addStatus(refs.turn, label)
      pushTurn(ctx, convId, refs)
    }
    ctx.dispatch({
      type: 'COMPLETE_EXECUTION_STEPS',
      convId,
      matchName: content.subagentType,
      failed: !content.success,
    })
    ctx.dispatch({
      type: 'UPDATE_BACKGROUND_TASK',
      taskName: content.subagentType,
      status: content.success ? 'completed' : 'failed',
    })
  }
}

export function makeOnDelegation(ctx: HandlerCtx) {
  return (event: StreamEvent<'delegation'>) => {
    const convId = ctx.getConvId()
    const content = event.content as DelegationEventContent
    if (!convId || !content) return
    ctx.dispatch({
      type: 'PUSH_EXECUTION_STEP',
      convId,
      step: {
        id: `delegation-${Date.now()}`,
        name: content.task || `Delegating to ${content.toAgent}`,
        status: 'active',
        startTime: Date.now(),
        metadata: { toAgent: content.toAgent, fromAgent: content.fromAgent },
      },
      mode: 'coordinated',
      currentNode: `Delegating to ${content.toAgent}`,
      agents: [content.toAgent],
    })
  }
}

export function makeOnAgentMessage(ctx: HandlerCtx) {
  return (event: StreamEvent<'agent_message'>) => {
    const convId = ctx.getConvId()
    const content = event.content as AgentMessageEventContent
    if (!convId || !content) return
    const refs = ctx.getRefs(convId)
    if (refs.turn) {
      refs.turn = addStatus(refs.turn, `${content.fromAgent}: ${content.summary || content.message}`)
      pushTurn(ctx, convId, refs)
    }
  }
}

export function makeOnNotification(ctx: HandlerCtx) {
  return (event: StreamEvent<'notification'>) => {
    const convId = ctx.getConvId()
    const content = event.content as NotificationEventContent
    if (!convId || !content) return
    const refs = ctx.getRefs(convId)
    if (!refs.turn) return
    refs.turn = addStatus(refs.turn, `Notification: ${content.message}`)
    pushTurn(ctx, convId, refs)
  }
}
