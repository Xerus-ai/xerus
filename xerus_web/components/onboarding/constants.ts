import type { OnboardingTemplateMessage } from './types'

/** Preset agents shown during the onboarding setup wizard step */
export const SETUP_AGENTS = [
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    description: 'Deep-dives into any topic and compiles findings into structured reports.',
    avatar_url: 'mascot:c0-2-1-30-15',
    tools: [
      { name: 'Google Search', name_slug: 'google-search' },
      { name: 'Web Scraper', name_slug: 'web-scraper' },
    ],
  },
  {
    id: 'content-writer',
    name: 'Content Writer',
    description: 'Creates blog posts, newsletters, and marketing copy tailored to your voice.',
    avatar_url: 'mascot:c2-1-0-25-20',
    tools: [
      { name: 'WordPress', name_slug: 'wordpress' },
      { name: 'Google Docs', name_slug: 'google-docs' },
    ],
  },
  {
    id: 'social-media-mgr',
    name: 'Social Media Manager',
    description: 'Schedules posts, tracks engagement, and manages your social presence across platforms.',
    avatar_url: 'mascot:c1-3-2-35-10',
    tools: [
      { name: 'Twitter', name_slug: 'twitter' },
      { name: 'LinkedIn', name_slug: 'linkedin' },
    ],
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyzes data from your connected apps and generates visual reports.',
    avatar_url: 'mascot:c3-0-1-20-25',
    tools: [
      { name: 'Google Sheets', name_slug: 'google-sheets' },
      { name: 'Notion', name_slug: 'notion' },
    ],
  },
  {
    id: 'email-assistant',
    name: 'Email Assistant',
    description: 'Drafts replies, categorizes incoming mail, and helps manage your email workflow.',
    avatar_url: 'mascot:c4-4-3-30-15',
    tools: [{ name: 'Gmail', name_slug: 'gmail' }],
  },
]

export function buildTemplateMessages(firstName: string): OnboardingTemplateMessage[] {
  return [
    {
      role: 'assistant',
      content: `Hey ${firstName}! I'm Xerus — think of me as your co-CEO.`,
    },
    {
      role: 'assistant',
      content: `Quick intro to how this place works — you and I run a virtual office together. I manage a team of AI agents, each one like a dedicated employee. Researchers, writers, social media managers, data analysts… you pick who you need from the marketplace, connect them to apps you already use — Gmail, Slack, Notion, Sheets — and they get to work.\n\nThe best part? They don't just sit around waiting for instructions. They check in on their own, spot things that need your attention, and post updates in your channels. Your workspace keeps everything organized into projects so you always know what's happening across the board.`,
    },
    {
      role: 'assistant',
      content: `Now let's build your office. I'll walk you through it step by step — just a few questions so I can set things up right for you.\n\nAre you starting fresh, or bringing an existing company onboard?`,
    },
  ]
}

export const INITIAL_QUICK_REPLIES = [
  { label: 'Start fresh', value: 'fresh', icon: 'sparkles' as const, subtitle: 'Build from scratch' },
  { label: 'Bring my company', value: 'existing', icon: 'building' as const, subtitle: 'Import existing setup' },
]
