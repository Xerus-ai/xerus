/**
 * Pure helpers for useChatState. Extracted to keep the hook under the 400-line limit.
 */
import type { Conversation as ApiConversation, ConversationDetail } from '@/lib/api/execute'
import type { Agent, Conversation, ConversationExecutionState, ProjectGroup, SessionEntry, SessionStatus } from './types'
import type { ChatMessageExtended } from './chat-message.types'

export const PAGE_SIZE = 50

export function mapConversation(c: ApiConversation): Conversation {
  return {
    id: c.id,
    title: c.title,
    agentSlug: c.agent_slug ?? undefined,
    messages: [],
    createdAt: new Date(c.created_at).getTime(),
    updatedAt: new Date(c.last_message_at || c.created_at).getTime(),
  }
}

export function mapDetailToMessages(convId: string, detail: ConversationDetail): ChatMessageExtended[] {
  return detail.messages.map((msg, idx) => {
    const base: ChatMessageExtended = {
      id: `msg_${convId}_${idx}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: {
        executionId: msg.execution_id,
        tokenCount: msg.input_tokens || msg.output_tokens
          ? (msg.input_tokens ?? 0) + (msg.output_tokens ?? 0)
          : undefined,
      },
    }
    if (msg.role === 'assistant' && msg.message_metadata?.parts && msg.message_metadata.parts.length > 0) {
      base.parts = msg.message_metadata.parts as ChatMessageExtended['parts']
    }
    return base
  })
}

function deriveSessionStatus(
  conv: Conversation,
  exec?: ConversationExecutionState,
): { status: SessionStatus; statusText?: string } {
  if (exec?.isLoading) {
    return { status: 'working' }
  }
  if (exec?.lastExecutionResult === 'error') {
    return { status: 'error' }
  }
  if (exec?.pendingMessages && exec.pendingMessages.length > 0) {
    return { status: 'pending_approval', statusText: `${exec.pendingMessages.length} queued` }
  }
  const msgCount = conv.messages?.length ?? 0
  if (msgCount > 0) {
    return { status: 'finished' }
  }
  return { status: 'idle' }
}

export function groupConversationsByAgent(
  conversations: Conversation[],
  agents: Agent[],
  execByConversation?: Record<string, ConversationExecutionState>,
): ProjectGroup[] {
  const agentMap = new Map<string, Agent>()
  for (const agent of agents) {
    if (agent.slug) agentMap.set(agent.slug, agent)
  }

  const groups = new Map<string, { agent: Agent | null; sessions: SessionEntry[] }>()

  for (const conv of conversations) {
    const agent = conv.agentSlug ? agentMap.get(conv.agentSlug) ?? null : null
    const groupKey = agent ? `agent-${agent.slug}` : 'general'

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { agent, sessions: [] })
    }

    const exec = execByConversation?.[conv.id]
    const { status, statusText } = deriveSessionStatus(conv, exec)

    groups.get(groupKey)!.sessions.push({
      ...conv,
      status,
      statusText,
      projectId: groupKey,
    })
  }

  const result: ProjectGroup[] = []
  for (const [key, { agent, sessions }] of groups) {
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    result.push({
      id: key,
      name: agent?.name ?? 'General',
      path: `/workspace/${agent?.domain?.toLowerCase().replace(/\s+/g, '-') ?? 'general'}`,
      sessions,
    })
  }

  result.sort((a, b) => {
    const aLatest = a.sessions[0]?.updatedAt ?? 0
    const bLatest = b.sessions[0]?.updatedAt ?? 0
    return bLatest - aLatest
  })

  return result
}

import type { Assistant } from '@/lib/api/types'

export function mapApiAgent(a: Assistant): Agent {
  return {
    id: a.id,
    slug: a.slug ?? null,
    name: a.name,
    description: a.description,
    avatar: a.avatar,
    avatarUrl: a.avatarUrl ?? null,
    model: a.model,
    status: a.status,
    capabilities: a.capabilities,
    personality_type: a.category,
    domain: a.category,
    tools: a.tools?.map((t) => ({ name_slug: t.name_slug, name: t.name, img_src: t.img_src })) ?? [],
  }
}
