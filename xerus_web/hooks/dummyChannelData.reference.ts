/**
 * Dummy/placeholder data for channel UI development and reference.
 * NOT imported by useChannelData hooks — kept for UI reference only.
 */

import type { ChannelMessage } from '@/components/channels/ChannelActivity'
import type { KanbanTask } from '@/components/common/TaskCard'
import type { Agent } from '@/components/common/PresenceAvatars'
import type { Deliverable } from '@/hooks/useChannelData'

// ---------------------------------------------------------------------------
// Shared channel agents (used by ChannelHeader + MentionInput)
// ---------------------------------------------------------------------------

export const CHANNEL_AGENTS: Agent[] = [
  { id: 'a-1', name: 'Researcher', slug: 'researcher', status: 'active' },
  { id: 'a-2', name: 'Analyst', slug: 'analyst', status: 'active' },
  { id: 'a-3', name: 'Strategist', slug: 'strategist', status: 'idle' },
  { id: 'a-4', name: 'Designer', slug: 'designer', status: 'sleeping' },
  { id: 'a-5', name: 'Writer', slug: 'writer', status: 'active' },
  { id: 'a-6', name: 'Reviewer', slug: 'reviewer', status: 'idle' },
]

// ---------------------------------------------------------------------------
// Dummy data builders
// ---------------------------------------------------------------------------

function daysAgo(days: number, hoursOffset = 0): string {
  return new Date(Date.now() - days * 86400000 + hoursOffset * 3600000).toISOString()
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600000).toISOString()
}

export function buildDummyMessages(channelId: string): ChannelMessage[] {
  return [
    // ── 2 days ago ──
    {
      id: 'msg-sys-1', channel_id: channelId,
      sender_type: 'system', sender_slug: 'system',
      content: 'Channel created', message_type: 'system',
      created_at: daysAgo(2),
    },
    {
      id: 'msg-1', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'researcher',
      content: '**Initial analysis complete.** I\'ve reviewed the current state and identified 3 key areas:\n\n1. Competitive positioning needs a refresh\n2. Content calendar has gaps in Q2\n3. SEO keyword targeting could be improved\n\nStarting with competitive analysis first.',
      message_type: 'post',
      metadata: { execution_id: 'exec-001' },
      created_at: daysAgo(2, 2),
    },

    // ── Yesterday ──
    {
      id: 'msg-coord-1', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'researcher',
      content: 'Can you pull engagement metrics for the last 3 blog posts?',
      message_type: 'coordination',
      metadata: { target_agent: 'analyst' },
      created_at: daysAgo(1, 1),
    },
    {
      id: 'msg-coord-2', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'analyst',
      content: 'Average engagement 2.3% — below our 3% target. Tutorial posts outperform opinion pieces 2:1.',
      message_type: 'coordination',
      metadata: { target_agent: 'researcher' },
      created_at: daysAgo(1, 1.5),
    },
    {
      id: 'msg-coord-3', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'researcher',
      content: 'Thanks. I\'ll factor this into the content strategy recommendation.',
      message_type: 'coordination',
      metadata: { target_agent: 'analyst' },
      created_at: daysAgo(1, 1.6),
    },
    {
      id: 'msg-coord-4', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'analyst',
      content: 'Also worth noting: the tutorial on AI workflows had 4.8% — highest ever.',
      message_type: 'coordination',
      metadata: { target_agent: 'researcher' },
      created_at: daysAgo(1, 1.7),
    },
    {
      id: 'msg-coord-5', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'researcher',
      content: 'Perfect — that confirms the pivot to technical content.',
      message_type: 'coordination',
      metadata: { target_agent: 'analyst' },
      created_at: daysAgo(1, 1.8),
    },
    {
      id: 'msg-2', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'analyst',
      content: '### Engagement Report\n\nLast 30 days summary:\n\n| Metric | Value | Target | Status |\n|--------|-------|--------|--------|\n| Avg. engagement | 2.3% | 3.0% | Below |\n| Tutorial posts | 4.1% | 3.0% | Above |\n| Opinion pieces | 1.2% | 3.0% | Below |\n\n**Recommendation**: Shift content mix to 70% tutorials, 30% opinion for Q2.',
      message_type: 'post',
      metadata: { execution_id: 'exec-002' },
      created_at: daysAgo(1, 4),
    },

    // ── Today ──
    {
      id: 'msg-sys-2', channel_id: channelId,
      sender_type: 'system', sender_slug: 'system',
      content: 'strategist assigned task "Q2 Content Strategy" to writer',
      message_type: 'system',
      created_at: hoursAgo(4),
    },
    {
      id: 'msg-3', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'strategist',
      content: '**Budget Reallocation Request**\n\nBased on the engagement analysis, I recommend shifting 40% of the opinion piece budget to tutorial content production.\n\nEstimated impact: **+1.5% average engagement rate**.\n\n@Human — please approve this budget reallocation before I proceed with the Q2 calendar.',
      message_type: 'post',
      metadata: { requires_approval: true },
      created_at: hoursAgo(3),
    },
    {
      id: 'msg-4', channel_id: channelId,
      sender_type: 'agent', sender_slug: 'writer',
      content: 'Started drafting the Q2 content calendar. First draft will include:\n\n- 8 tutorial posts (bi-weekly)\n- 4 opinion pieces (monthly)\n- 2 case studies\n\nExpected completion: tomorrow morning.',
      message_type: 'post',
      metadata: { execution_id: 'exec-003' },
      created_at: hoursAgo(1),
    },
    {
      id: 'msg-sys-3', channel_id: channelId,
      sender_type: 'system', sender_slug: 'system',
      content: 'reviewer started review of "Competitive Analysis Report"',
      message_type: 'system',
      created_at: hoursAgo(0.5),
    },
  ]
}

export function buildDummyChannelTasks(): KanbanTask[] {
  const pick = (idx: number) => CHANNEL_AGENTS[idx % CHANNEL_AGENTS.length]
  const agent = (idx: number) => [{ id: pick(idx).id, name: pick(idx).name, slug: pick(idx).slug, status: pick(idx).status }]

  return [
    {
      id: 'ch-t-1', title: 'Competitive analysis report', status: 'done',
      description: 'Research top 5 competitors and document findings.',
      priority: 'high', assignedAgents: agent(0),
      subtasks: { total: 4, completed: 4 }, commentCount: 6,
    },
    {
      id: 'ch-t-2', title: 'Engagement metrics dashboard', status: 'done',
      description: 'Build automated engagement tracking for blog posts.',
      priority: 'medium', assignedAgents: agent(1),
      subtasks: { total: 3, completed: 3 }, commentCount: 4,
    },
    {
      id: 'ch-t-3', title: 'Q2 content strategy', status: 'in_progress',
      description: 'Define content mix and editorial calendar for Q2.',
      priority: 'high',
      assignedAgents: [
        { id: 'a-3', name: 'Strategist', slug: 'strategist', status: 'idle' as const },
        { id: 'a-5', name: 'Writer', slug: 'writer', status: 'active' as const },
      ],
      subtasks: { total: 6, completed: 2 }, commentCount: 8,
    },
    {
      id: 'ch-t-4', title: 'Budget reallocation approval', status: 'needs_approval',
      description: 'Shift 40% of opinion piece budget to tutorials.',
      priority: 'critical', assignedAgents: agent(2),
      subtasks: { total: 2, completed: 1 }, commentCount: 3,
    },
    {
      id: 'ch-t-5', title: 'Tutorial: Getting Started Guide', status: 'todo',
      description: 'Write comprehensive getting started tutorial for new users.',
      priority: 'medium', assignedAgents: agent(4),
      subtasks: { total: 5, completed: 0 }, commentCount: 1,
    },
    {
      id: 'ch-t-6', title: 'SEO keyword refresh', status: 'todo',
      description: 'Update target keywords based on Q1 performance data.',
      priority: 'low', assignedAgents: agent(0),
      subtasks: { total: 3, completed: 0 }, commentCount: 0,
    },
  ]
}

export function buildDummyDeliverables(): Deliverable[] {
  return [
    {
      id: 'del-1', filename: 'competitive-analysis-q1.md', file_type: 'markdown',
      content: '# Competitive Analysis Q1\n\n## Executive Summary\n\nAnalyzed 5 key competitors in the AI agent platform space.\n\n## Findings\n\n| Competitor | Market Share | Pricing | Key Strength |\n|-----------|-------------|---------|-------------|\n| Acme Corp | 23% | $49/mo | Brand recognition |\n| Beta Inc | 18% | $29/mo | Developer tools |\n| Gamma Ltd | 12% | $39/mo | Enterprise features |\n| Delta AI | 8% | $19/mo | Price leader |\n| Epsilon | 5% | $59/mo | Vertical focus |\n\n## Recommendations\n\n1. **Pricing**: Position at $29-39/mo range\n2. **Differentiation**: Emphasize AI-native workflow\n3. **Content**: Create comparison landing pages',
      author_slug: 'researcher', file_size_bytes: 4200,
      created_at: daysAgo(3),
    },
    {
      id: 'del-2', filename: 'engagement-metrics.csv', file_type: 'code', language: 'csv',
      content: 'post_title,date,views,engagement_rate,type\n"Getting Started with AI Agents",2026-01-15,1245,4.2%,tutorial\n"Why AI Agents Matter",2026-01-22,890,1.1%,opinion\n"Building Your First Workflow",2026-02-01,1580,4.8%,tutorial\n"The Future of Work",2026-02-08,720,0.9%,opinion\n"Advanced Agent Patterns",2026-02-12,1320,3.7%,tutorial',
      author_slug: 'analyst', file_size_bytes: 1800,
      created_at: daysAgo(2),
    },
    {
      id: 'del-3', filename: 'content-calendar-q2-draft.md', file_type: 'markdown',
      content: '# Q2 Content Calendar (Draft)\n\n## February\n- **Week 3**: Tutorial — Getting Started Guide\n- **Week 4**: Case Study — Acme Corp Migration\n\n## March\n- **Week 1**: Tutorial — Advanced Workflows\n- **Week 2**: Opinion — Industry Trends 2026\n- **Week 3**: Tutorial — Integration Patterns\n- **Week 4**: Case Study — Beta Inc Scaling\n\n## April\n- **Week 1**: Tutorial — Agent Teams\n- **Week 2**: Opinion — AI Ethics in Automation',
      author_slug: 'writer', file_size_bytes: 3100,
      created_at: hoursAgo(2),
    },
    {
      id: 'del-4', filename: 'seo-keywords.json', file_type: 'code', language: 'json',
      content: '{\n  "primary_keywords": [\n    { "keyword": "ai agent platform", "volume": 2400, "difficulty": 38 },\n    { "keyword": "automated workflows", "volume": 1800, "difficulty": 42 },\n    { "keyword": "ai workforce management", "volume": 960, "difficulty": 28 }\n  ],\n  "long_tail": [\n    { "keyword": "how to build ai agent team", "volume": 480, "difficulty": 15 },\n    { "keyword": "ai agent vs chatbot", "volume": 720, "difficulty": 22 }\n  ]\n}',
      author_slug: 'researcher', file_size_bytes: 2500,
      created_at: daysAgo(1),
    },
  ]
}
