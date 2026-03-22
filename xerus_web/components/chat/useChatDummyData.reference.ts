import type { Message, Conversation } from './types'
import type { TurnPart } from './streaming-turn.types'

// ---------------------------------------------------------------------------
// Tool call types for rich visualization
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string
  name: string
  icon: 'read' | 'write' | 'search' | 'bash' | 'web' | 'think' | 'agent' | 'skill' | 'task' | 'question'
  target?: string
  detail?: string
  output?: string
  status: 'success' | 'error' | 'running'
  duration_ms: number
}

export interface TodoItem {
  id: string
  label: string
  done: boolean
}

export interface WorkspaceArtifact {
  id: string
  filename: string
  path: string
  lineCount: number
  description: string
  preview?: string
}

export interface ChatMessageExtended extends Message {
  toolCalls?: ToolCall[]
  thinking?: string
  todoProgress?: { done: number; total: number; items?: TodoItem[] }
  planTitle?: string
  artifacts?: WorkspaceArtifact[]
  parts?: TurnPart[]
}

// ---------------------------------------------------------------------------
// Session status + project grouping types
// ---------------------------------------------------------------------------

export type SessionStatus = 'working' | 'finished' | 'error' | 'pending_approval' | 'idle'

export interface SessionEntry extends Conversation {
  status: SessionStatus
  statusText?: string
  projectId: string
}

export interface ProjectGroup {
  id: string
  name: string
  path: string
  sessions: SessionEntry[]
}

// ---------------------------------------------------------------------------
// Dummy data
// ---------------------------------------------------------------------------

function minutesAgo(mins: number): number {
  return Date.now() - mins * 60000
}

function hoursAgo(hours: number): number {
  return Date.now() - hours * 3600000
}

function daysAgo(days: number): number {
  return Date.now() - days * 86400000
}

const ALL_SESSIONS: SessionEntry[] = [
  // ── Q2 Marketing Campaign ──
  {
    id: 'conv-1', title: 'Competitive Analysis for Q2', projectId: 'proj-1',
    status: 'working', statusText: 'Working',
    messages: [], createdAt: hoursAgo(2), updatedAt: minutesAgo(5),
  },
  {
    id: 'conv-2', title: 'Setting up Agent Workflows', projectId: 'proj-1',
    status: 'pending_approval', statusText: 'Pending your approval',
    messages: [], createdAt: hoursAgo(6), updatedAt: hoursAgo(4),
  },
  {
    id: 'conv-3', title: 'Content Calendar Draft', projectId: 'proj-1',
    status: 'finished', statusText: 'Finished',
    messages: [], createdAt: daysAgo(1), updatedAt: daysAgo(1) + 3600000,
  },

  // ── Product Launch v2 ──
  {
    id: 'conv-4', title: 'SEO Keyword Research', projectId: 'proj-2',
    status: 'idle',
    messages: [], createdAt: daysAgo(2), updatedAt: daysAgo(2) + 7200000,
  },
  {
    id: 'conv-5', title: 'Blog Post: AI Workflows', projectId: 'proj-2',
    status: 'error', statusText: 'Error during generation',
    messages: [], createdAt: daysAgo(3), updatedAt: daysAgo(3) + 5400000,
  },
  {
    id: 'conv-6', title: 'Landing Page Copy Generation', projectId: 'proj-2',
    status: 'finished', statusText: 'Finished',
    messages: [], createdAt: daysAgo(4), updatedAt: daysAgo(3),
  },
  {
    id: 'conv-7', title: 'Pricing Page A/B Variants', projectId: 'proj-2',
    status: 'working', statusText: 'Working',
    messages: [], createdAt: daysAgo(1), updatedAt: minutesAgo(12),
  },

  // ── Research & Analysis ──
  {
    id: 'conv-8', title: 'Q1 Performance Review', projectId: 'proj-3',
    status: 'finished', statusText: 'Finished',
    messages: [], createdAt: daysAgo(5), updatedAt: daysAgo(5) + 3600000,
  },
  {
    id: 'conv-9', title: 'Onboarding Email Sequence', projectId: 'proj-3',
    status: 'idle',
    messages: [], createdAt: daysAgo(8), updatedAt: daysAgo(7),
  },
]

export const DUMMY_PROJECTS: ProjectGroup[] = [
  {
    id: 'proj-1', name: 'Q2 Marketing Campaign',
    path: '/workspace/marketing',
    sessions: ALL_SESSIONS.filter((s) => s.projectId === 'proj-1'),
  },
  {
    id: 'proj-2', name: 'Product Launch v2',
    path: '/workspace/product',
    sessions: ALL_SESSIONS.filter((s) => s.projectId === 'proj-2'),
  },
  {
    id: 'proj-3', name: 'Research & Analysis',
    path: '/workspace/research',
    sessions: ALL_SESSIONS.filter((s) => s.projectId === 'proj-3'),
  },
]

// Flat list for ChatContainer compatibility
export const DUMMY_CONVERSATIONS: Conversation[] = ALL_SESSIONS

// ---------------------------------------------------------------------------
// Dummy messages with tool calls + thinking + plans
// ---------------------------------------------------------------------------

export function buildDummyMessages(): ChatMessageExtended[] {
  return [
    // ── User message ──
    {
      id: 'msg-1',
      role: 'user',
      content: 'Research our top 5 competitors and create a comparison report with pricing, features, and market positioning.',
      timestamp: minutesAgo(45),
    },

    // ── Agent thinking + tool calls + response ──
    {
      id: 'msg-2',
      role: 'assistant',
      content: "I'll research the competitive landscape for you. Let me start by gathering data from multiple sources.",
      agentName: 'Xerus',
      timestamp: minutesAgo(44),
      thinking: 'The user wants a competitive analysis. I need to: 1) Identify the top 5 competitors, 2) Research their pricing pages, 3) Compare feature sets, 4) Analyze market positioning. Let me start with web research and then cross-reference with our existing knowledge base.',
      toolCalls: [
        {
          id: 'tc-1', name: 'Web Search', icon: 'web',
          target: '"AI agent platform" competitor analysis 2026',
          detail: 'Searching for competitor landscape data',
          output: 'Found 12 relevant results from TechCrunch, G2, and Gartner',
          status: 'success', duration_ms: 3200,
        },
        {
          id: 'tc-2', name: 'Read', icon: 'read',
          target: 'workspace/knowledge/market-research.md',
          detail: 'all 186 lines',
          output: '186 lines, 8.4KB — contains Q4 market data',
          status: 'success', duration_ms: 420,
        },
        {
          id: 'tc-3', name: 'Web Fetch', icon: 'web',
          target: 'https://acmecorp.com/pricing',
          detail: 'Fetching competitor pricing page',
          output: '200 OK — Enterprise: $99/mo, Pro: $49/mo, Free tier available',
          status: 'success', duration_ms: 1800,
        },
        {
          id: 'tc-4', name: 'Web Fetch', icon: 'web',
          target: 'https://betainc.io/plans',
          detail: 'Fetching competitor pricing page',
          output: '200 OK — Team: $39/mo, Individual: $19/mo',
          status: 'success', duration_ms: 2100,
        },
        {
          id: 'tc-5', name: 'Search', icon: 'search',
          target: '"competitive analysis" in workspace/knowledge/',
          detail: 'Searching knowledge base for prior analyses',
          output: 'Found 3 relevant documents from previous analyses',
          status: 'success', duration_ms: 680,
        },
      ],
      todoProgress: {
        done: 2, total: 5,
        items: [
          { id: 'todo-1', label: 'Identify top 5 competitors', done: true },
          { id: 'todo-2', label: 'Research pricing pages', done: true },
          { id: 'todo-3', label: 'Compare feature sets', done: false },
          { id: 'todo-4', label: 'Analyze market positioning', done: false },
          { id: 'todo-5', label: 'Generate comparison report', done: false },
        ],
      },
    },

    // ── Agent deliverable message ──
    {
      id: 'msg-3',
      role: 'assistant',
      content: "Here's the competitive analysis. I've identified the top 5 players and compiled their data:\n\n| Competitor | Market Share | Pricing | Key Strength |\n|-----------|-------------|---------|-------------|\n| Acme Corp | 23% | $49-99/mo | Brand recognition |\n| Beta Inc | 18% | $19-39/mo | Developer tools |\n| Gamma Ltd | 12% | $39/mo | Enterprise features |\n| Delta AI | 8% | $19/mo | Price leader |\n| Epsilon | 5% | $59/mo | Vertical focus |\n\n### Key Findings\n\n1. **Price gap opportunity** — No one owns the $29-39/mo mid-market\n2. **Tutorial content wins** — Beta Inc's developer blog drives 40% of signups\n3. **Enterprise is crowded** — Acme and Gamma dominate; avoid competing here initially\n\n### Recommendation\n\nPosition at **$29/mo** with a strong developer experience story. Invest in tutorial content (highest ROI channel) and differentiate on AI-native workflows.",
      agentName: 'Xerus',
      timestamp: minutesAgo(40),
      toolCalls: [
        {
          id: 'tc-6', name: 'Write', icon: 'write',
          target: 'competitive-analysis-q2.md',
          detail: 'Creating competitive analysis report',
          output: 'Written 68 lines — executive summary, comparison table, and recommendations',
          status: 'success', duration_ms: 4200,
        },
      ],
      todoProgress: {
        done: 5, total: 5,
        items: [
          { id: 'todo-1', label: 'Identify top 5 competitors', done: true },
          { id: 'todo-2', label: 'Research pricing pages', done: true },
          { id: 'todo-3', label: 'Compare feature sets', done: true },
          { id: 'todo-4', label: 'Analyze market positioning', done: true },
          { id: 'todo-5', label: 'Generate comparison report', done: true },
        ],
      },
      artifacts: [
        {
          id: 'art-1',
          filename: 'competitive-analysis-q2.md',
          path: 'workspace/competitive-analysis-q2.md',
          lineCount: 68,
          description: 'Executive summary, comparison table, and recommendations',
          preview: '# Competitive Analysis — Q2 2026\n\n## Executive Summary\n\nThe AI agent platform market is valued at $2.4B with 5 major players...\n\n## Comparison Matrix\n\n| Competitor | Pricing | Key Strength |\n|-----------|---------|-------------|\n| Acme Corp | $49-99/mo | Brand recognition |\n| Beta Inc  | $19-39/mo | Developer tools |',
        },
      ],
      metadata: { executionId: 'exec-001', processingTime: 42000, tokenCount: 8400 },
    },

    // ── User follow-up ──
    {
      id: 'msg-4',
      role: 'user',
      content: "Great analysis. Now create a content strategy plan based on these findings. Focus on tutorial content since that's what converts best.",
      timestamp: minutesAgo(30),
    },

    // ── Agent with plan ──
    {
      id: 'msg-5',
      role: 'assistant',
      content: "I'll create a comprehensive content strategy. Let me analyze our current content performance first and then draft the plan.",
      agentName: 'Xerus',
      timestamp: minutesAgo(29),
      thinking: 'The user wants a content strategy focused on tutorials. I should: 1) Pull current engagement data, 2) Identify top-performing content patterns, 3) Create a quarterly calendar, 4) Include KPIs and success metrics. Let me delegate the data analysis to the Analyst agent and the calendar drafting to the Writer agent.',
      toolCalls: [
        {
          id: 'tc-7', name: 'Read', icon: 'read',
          target: 'workspace/analysis/engagement-report.md',
          detail: 'all 35 lines',
          output: '35 lines, 2.1KB — engagement data from last 30 days',
          status: 'success', duration_ms: 380,
        },
        {
          id: 'tc-8', name: 'Read', icon: 'read',
          target: 'workspace/content/q1-calendar.md',
          detail: 'all 28 lines',
          output: '28 lines, 1.8KB — previous quarter calendar for reference',
          status: 'success', duration_ms: 320,
        },
        {
          id: 'tc-9', name: 'Search', icon: 'search',
          target: '"tutorial" in workspace/knowledge/',
          detail: 'Finding tutorial topic ideas',
          output: 'Found 8 potential tutorial topics from research notes',
          status: 'success', duration_ms: 540,
        },
        {
          id: 'tc-10', name: 'Bash', icon: 'bash',
          target: 'python scripts/analyze_content_gaps.py --quarter Q2',
          detail: 'Running content gap analysis',
          output: 'Identified 6 topic gaps with high search volume and low competition',
          status: 'success', duration_ms: 8400,
        },
      ],
    },

    // ── Plan card ──
    {
      id: 'msg-6',
      role: 'assistant',
      content: "## Content Strategy: Q2 2026\n\n### Executive Summary\n\nShift content mix from 50/50 to **70% tutorials, 30% thought leadership** based on engagement data showing tutorials convert 3.5x better than opinion pieces.\n\n### Monthly Calendar\n\n**March**\n- Week 1: *Tutorial* — Getting Started with AI Agent Teams\n- Week 2: *Case Study* — How Acme Corp Scaled with Agents\n- Week 3: *Tutorial* — Advanced Workflow Patterns\n- Week 4: *Opinion* — The Future of AI-Native Work\n\n**April**\n- Week 1: *Tutorial* — Integration Patterns & Best Practices\n- Week 2: *Tutorial* — Building Custom Agent Skills\n- Week 3: *Case Study* — Beta Inc Migration Story\n- Week 4: *Opinion* — AI Ethics in Automation\n\n**May**\n- Week 1: *Tutorial* — Agent Memory & Learning\n- Week 2: *Tutorial* — Real-time Collaboration Features\n- Week 3: *Case Study* — 10x Productivity Results\n- Week 4: *Tutorial* — Enterprise Deployment Guide\n\n### KPIs\n\n| Metric | Current | Q2 Target |\n|--------|---------|----------|\n| Avg. engagement | 2.3% | 4.0% |\n| Signups from content | 120/mo | 250/mo |\n| Tutorial completion | 45% | 65% |\n| SEO organic traffic | 3.2K/mo | 6K/mo |\n\n### Budget\n\nReallocate 40% of opinion piece budget to tutorial production. Estimated impact: **+1.5% engagement rate** and **2x signup conversion**.",
      agentName: 'Xerus',
      timestamp: minutesAgo(25),
      planTitle: 'Q2 Content Strategy Plan',
      toolCalls: [
        {
          id: 'tc-11', name: 'Write', icon: 'write',
          target: 'content-strategy-q2.md',
          detail: 'Creating Q2 content strategy document',
          output: 'Written 92 lines — full strategy with calendar, KPIs, and budget',
          status: 'success', duration_ms: 6800,
        },
      ],
      todoProgress: {
        done: 4, total: 4,
        items: [
          { id: 'todo-6', label: 'Pull current engagement data', done: true },
          { id: 'todo-7', label: 'Identify top-performing content patterns', done: true },
          { id: 'todo-8', label: 'Create quarterly content calendar', done: true },
          { id: 'todo-9', label: 'Define KPIs and success metrics', done: true },
        ],
      },
      artifacts: [
        {
          id: 'art-2',
          filename: 'content-strategy-q2.md',
          path: 'workspace/content-strategy-q2.md',
          lineCount: 92,
          description: 'Full strategy with calendar, KPIs, and budget',
          preview: '# Content Strategy — Q2 2026\n\n## Executive Summary\n\nShift content mix to 70% tutorials, 30% thought leadership.\nTutorials convert 3.5x better than opinion pieces.\n\n## Monthly Calendar\n\n### March\n- Week 1: Tutorial — Getting Started with AI Agent Teams\n- Week 2: Case Study — How Acme Corp Scaled',
        },
      ],
      metadata: { executionId: 'exec-002', processingTime: 38000, tokenCount: 12600 },
    },

    // ── User approval ──
    {
      id: 'msg-7',
      role: 'user',
      content: 'This looks solid. Approved. Can you also set up the @writer agent to start working on the first tutorial?',
      timestamp: minutesAgo(15),
    },

    // ── Agent delegation ──
    {
      id: 'msg-8',
      role: 'assistant',
      content: "I've dispatched the first tutorial task to @writer. Here's what's happening:\n\n1. **Writer** is now drafting *Getting Started with AI Agent Teams*\n2. I've shared the engagement data and competitive analysis as context\n3. Target: 2,000 words, beginner-friendly, with code examples\n4. Expected first draft: within 4 hours\n\nI'll notify you when the draft is ready for review. In the meantime, I'm also assigning @researcher to start gathering data for the Acme Corp case study (Week 2 content).",
      agentName: 'Xerus',
      timestamp: minutesAgo(14),
      toolCalls: [
        {
          id: 'tc-12', name: 'Bash', icon: 'bash',
          target: 'dispatch --agent writer --task "Draft tutorial: Getting Started with AI Agent Teams"',
          detail: 'Dispatching task to Writer agent',
          output: 'Task dispatched. Writer is now active.',
          status: 'success', duration_ms: 1200,
        },
        {
          id: 'tc-13', name: 'Write', icon: 'write',
          target: 'context/trigger/writer-tutorial-brief.md',
          detail: 'Writing task brief for Writer agent',
          output: 'Written 24 lines — topic, audience, word count, style guide, reference materials',
          status: 'success', duration_ms: 2400,
        },
      ],
      metadata: { executionId: 'exec-003', processingTime: 12000, tokenCount: 4200 },
    },
  ]
}
