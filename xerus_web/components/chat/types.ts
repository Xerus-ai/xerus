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

export interface ChatState {
  currentAgent: Agent | null
  messages: Message[]
  isLoading: boolean
  conversationId: string | null
  conversations: Conversation[]
  error: string | null
  executionState?: ExecutionState | null
  streamingTurn?: import('./streaming-turn.types').StreamingAssistantTurn | null
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
