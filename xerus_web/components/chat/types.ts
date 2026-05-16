// Chat interface types

/**
 * Message Interface - STRICT TYPES
 * Message IDs are strings (client-generated UUIDs)
 * Agent references use slugs
 */
export interface Message {
  id: string // Message ID stays string (client-generated)
  role: 'user' | 'assistant' | 'system'
  content: string
  agentSlug?: string // Agent slug identity
  agentName?: string
  timestamp: number
  isStreaming?: boolean
  metadata?: {
    model?: string
    tools?: string[]
    processingTime?: number
    tokenCount?: number
    executionId?: string
    agentContributions?: Record<string, unknown>[]
    executionMetrics?: Record<string, unknown>
  }
}

export interface Conversation {
  id: string
  title: string
  agentSlug?: string // Agent slug for avatar display
  agentType?: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

/**
 * Agent Interface - STRICT TYPES
 * Agents use numeric IDs for CRUD, slugs for execution identity
 */
export interface AgentTool {
  name_slug: string
  name: string
  img_src: string | null
}

export interface Agent {
  id: number // STRICT: Always numeric ID
  slug?: string | null
  name: string
  description: string
  avatar?: string
  avatarUrl?: string | null
  model?: string
  status: 'active' | 'inactive'
  capabilities?: string[]
  personality_type?: string
  domain?: string // Agent category/domain for grouped dropdown
  tools?: AgentTool[]
}

export interface SelectedChannel {
  id: string
  slug: string
  name: string
  domainName: string
}

/**
 * Per-conversation execution state. Keyed by conversationId in execByConversation.
 *
 * This isolation prevents loading/streaming state from one conversation bleeding
 * into another when the user switches between sessions while an agent is still
 * executing in the background.
 */
export interface ConversationExecutionState {
  isLoading: boolean
  streamingTurn: import('./streaming-turn.types').StreamingAssistantTurn | null
  executionState: ExecutionState | null
  tokenUsage: { used: number; total: number } | null
  pendingMessages: string[]
  activeExecutionId: string | null
  lastExecutionResult: 'success' | 'cancelled' | 'error' | null
  respondingAgent: { agentSlug?: string; agentName?: string } | null
}

export const EMPTY_EXEC_STATE: ConversationExecutionState = {
  isLoading: false,
  streamingTurn: null,
  executionState: null,
  tokenUsage: null,
  pendingMessages: [],
  activeExecutionId: null,
  lastExecutionResult: null,
  respondingAgent: null,
}

export interface ChatState {
  currentAgent: Agent | null
  messages: Message[]
  conversationId: string | null
  conversations: Conversation[]
  hasMoreConversations: boolean
  error: string | null
  // Per-conversation execution state. Use getExecState(state, convId) to read.
  execByConversation: Record<string, ConversationExecutionState>
  selectedChannel?: SelectedChannel | null
  pendingToolAuth?: { app_slug: string; agent_slug: string } | null
  pendingGuidance?: {
    question: string;
    options?: string[];
    timeout_seconds: number;
    pause_id: string;
    scenario: string;
    tool_name: string;
    agent_slug: string;
    requires_auth: boolean;
    execution_id: string;
    ui_hint?: import('@/hooks/useExecutionStream.types').UIHint;
    browser_url?: string;
    preview_url?: string;
    artifact_path?: string;
  } | null
  backgroundTasks?: Array<{
    id: string
    name: string
    description?: string
    status: 'running' | 'completed' | 'failed'
    startedAt: number
  }>
  // Tool result that produced a viewable file — ChatContainer opens artifact panel.
  pendingArtifactFile?: {
    name: string
    path: string
    extension: string
    ts: number
  } | null
  // Latest live-preview event from the agent's dev server. ChatContainer
  // watches this and opens an artifact tab when it changes.
  pendingPreview?: {
    port: number;
    url: string;
    label?: string;
    ts: number;
  } | null
}

// Orchestration types
export interface ExecutionState {
  mode: 'simple' | 'planned' | 'coordinated'
  currentNode?: string
  steps: ExecutionStep[]
  agents?: string[]
  totalSteps?: number
  completedSteps?: number
  error?: string
}

export interface ExecutionStep {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  description?: string
  progress?: number
  startTime?: number
  endTime?: number
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface ToolExecution {
  id: string
  name: string
  icon?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  parameters?: Record<string, unknown>
  result?: unknown
  startTime?: number
  endTime?: number
  error?: string
}

// Session status for sidebar display
export type SessionStatus = 'working' | 'finished' | 'error' | 'pending_approval' | 'idle'

// Conversation with status info for sidebar
export interface SessionEntry extends Conversation {
  status: SessionStatus
  statusText?: string
  projectId?: string
}

// Project group for sidebar grouping
export interface ProjectGroup {
  id: string
  name: string
  path: string
  sessions: SessionEntry[]
}
