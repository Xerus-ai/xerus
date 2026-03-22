'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/utils/AuthContext'
import { useOnboardingStream } from '@/hooks/useOnboardingStream'
import { BlobBackground } from './BlobBackground'
import { LogoEntrance } from './LogoEntrance'
import { OnboardingMessages } from './OnboardingMessages'
import { OnboardingSteps } from './OnboardingSteps'
import type { OnboardingMessage, OnboardingTemplateMessage } from './types'

type Phase = 'logo' | 'template' | 'live' | 'setup'

// Mock agents for the setup wizard (same as in useOnboardingStream)
const SETUP_AGENTS = [
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

function buildTemplateMessages(firstName: string): OnboardingTemplateMessage[] {
  return [
    {
      role: 'assistant',
      content: `Hey ${firstName}! I\u2019m Xerus \u2014 think of me as your co-CEO.`,
    },
    {
      role: 'assistant',
      content: `Quick intro to how this place works \u2014 you and I run a virtual office together. I manage a team of AI agents, each one like a dedicated employee. Researchers, writers, social media managers, data analysts\u2026 you pick who you need from the marketplace, connect them to apps you already use \u2014 Gmail, Slack, Notion, Sheets \u2014 and they get to work.\n\nThe best part? They don\u2019t just sit around waiting for instructions. They check in on their own, spot things that need your attention, and post updates in your channels. Your workspace keeps everything organized into projects so you always know what\u2019s happening across the board.`,
    },
    {
      role: 'assistant',
      content: `Now let\u2019s build your office. I\u2019ll walk you through it step by step \u2014 just a few questions so I can set things up right for you.\n\nAre you starting fresh, or bringing an existing company onboard?`,
    },
  ]
}

const INITIAL_QUICK_REPLIES = [
  { label: 'Start fresh', value: 'fresh', icon: 'sparkles' as const, subtitle: 'Build from scratch' },
  { label: 'Bring my company', value: 'existing', icon: 'building' as const, subtitle: 'Import existing setup' },
]

export function OnboardingChat() {
  const router = useRouter()
  const { user } = useAuth()
  const firstName = user?.display_name?.split(' ')[0] || 'there'
  const userId = user?.uid || ''

  const [phase, setPhase] = useState<Phase>('logo')
  const [messages, setMessages] = useState<OnboardingMessage[]>([])
  const [templateIndex, setTemplateIndex] = useState(0)
  const [templateTypingDone, setTemplateTypingDone] = useState(-1)
  const [quickReplies, setQuickReplies] = useState<typeof INITIAL_QUICK_REPLIES>([])
  const [logoReady, setLogoReady] = useState(false)
  const [workspaceData, setWorkspaceData] = useState<{ workspace: string; project: string } | null>(null)

  const stream = useOnboardingStream({ userId })
  const templateMessages = useMemo(() => buildTemplateMessages(firstName), [firstName])

  // Provision sandbox in background on mount
  useEffect(() => {
    if (userId) stream.startProvisioning()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Logo phase: hold for 2.5s then transition to template
  useEffect(() => {
    if (phase !== 'logo') return
    const timer = setTimeout(() => setPhase('template'), 2500)
    return () => clearTimeout(timer)
  }, [phase])

  // Sequential template messages
  useEffect(() => {
    if (phase !== 'template') return
    if (templateIndex >= templateMessages.length) return

    const nextIdx = templateIndex

    if (nextIdx === 0) {
      const timer = setTimeout(() => {
        setMessages((prev) => [...prev, {
          id: `template-${nextIdx}`,
          role: 'assistant' as const,
          content: templateMessages[nextIdx].content,
          source: 'template' as const,
        }])
        setTemplateIndex(nextIdx + 1)
      }, 600)
      return () => clearTimeout(timer)
    }

    if (templateTypingDone < nextIdx - 1) return

    const timer = setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: `template-${nextIdx}`,
        role: 'assistant' as const,
        content: templateMessages[nextIdx].content,
        source: 'template' as const,
      }])
      setTemplateIndex(nextIdx + 1)
    }, 800)
    return () => clearTimeout(timer)
  }, [phase, templateIndex, templateTypingDone, templateMessages])

  const handleTypingComplete = useCallback((messageId: string) => {
    const match = messageId.match(/^template-(\d+)$/)
    if (!match) return
    const idx = parseInt(match[1])
    setTemplateTypingDone(idx)

    if (idx === templateMessages.length - 1) {
      setTimeout(() => setQuickReplies(INITIAL_QUICK_REPLIES), 500)
    }
  }, [templateMessages.length])

  // Merge streamed messages from the hook
  useEffect(() => {
    if (stream.streamedMessages.length === 0) return
    setMessages((prev) => {
      const nonStreamed = prev.filter((m) => m.source !== 'stream')
      return [...nonStreamed, ...stream.streamedMessages]
    })
  }, [stream.streamedMessages])

  const handleQuickReply = useCallback((value: string) => {
    const reply = INITIAL_QUICK_REPLIES.find((r) => r.value === value)
    const label = reply?.label || value
    const userMsg: OnboardingMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: label,
      source: 'template',
    }
    setMessages((prev) => [...prev, userMsg])
    setQuickReplies([])
    setPhase('live')
    stream.handoff(value, [...messages, userMsg])
  }, [messages, stream])

  const handleSend = useCallback((content: string) => {
    const userMsg: OnboardingMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      source: phase === 'live' ? 'stream' : 'template',
    }
    setMessages((prev) => [...prev, userMsg])
    if (phase === 'live') stream.sendMessage(content)
  }, [phase, stream])

  const handleUIAction = useCallback((messageId: string, action: string, data: Record<string, any>) => {
    // Collapse the UI card
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.ui) return m
        let collapsedText = ''
        if (action === 'create-workspace') {
          collapsedText = `${data.workspace} created with ${data.project} project`
        }
        return { ...m, ui: { ...m.ui, collapsed: true, collapsedText } }
      })
    )

    // Workspace creation → call backend then transition to setup wizard
    if (action === 'create-workspace') {
      setWorkspaceData({ workspace: data.workspace, project: data.project })
      // Fire backend call (non-blocking — setup wizard shows progress animation)
      stream.createWorkspace(data.workspace, data.project)
      setTimeout(() => setPhase('setup'), 800)
      return
    }

    // Other actions forward to stream
    if (phase === 'live') {
      stream.sendMessage(`[action:${action}] ${JSON.stringify(data)}`)
    }
  }, [phase, stream])

  const handleSetupComplete = useCallback(() => {
    stream.completeOnboarding()
    router.push('/')
  }, [stream, router])

  const showChat = phase === 'logo' || phase === 'template' || phase === 'live'

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-alt">
      <BlobBackground />

      <AnimatePresence mode="wait">
        {/* ── Chat phases ── */}
        {showChat && (
          <motion.div
            key="chat"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Logo splash */}
            <AnimatePresence>
              {phase === 'logo' && (
                <motion.div
                  key="logo-splash"
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <LogoEntrance phase="center" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            {phase !== 'logo' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <OnboardingMessages
                  messages={messages}
                  onLogoReady={() => setLogoReady(true)}
                  onTypingComplete={handleTypingComplete}
                  onUIAction={handleUIAction}
                  quickReplies={quickReplies.length > 0 ? quickReplies : undefined}
                  onQuickReply={handleQuickReply}
                />
              </motion.div>
            )}

            {/* Input bar removed — onboarding uses generative UI only */}
          </motion.div>
        )}

        {/* ── Setup wizard ── */}
        {phase === 'setup' && workspaceData && (
          <motion.div
            key="setup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex-1 min-h-0"
          >
            <OnboardingSteps
              workspace={workspaceData}
              agents={SETUP_AGENTS}
              onComplete={handleSetupComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

