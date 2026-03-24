'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/utils/AuthContext'
import { useOnboardingStream } from '@/hooks/useOnboardingStream'
import { BlobBackground } from './BlobBackground'
import { LogoEntrance } from './LogoEntrance'
import { OnboardingMessages } from './OnboardingMessages'
import { OnboardingSteps } from './OnboardingSteps'
import type { OnboardingMessage, OnboardingTemplateMessage } from './types'

type Phase = 'logo' | 'template' | 'setup'

// Preset agents shown during the onboarding setup wizard step
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
  const { user, markWorkspaceReady } = useAuth()
  const firstName = user?.display_name?.split(' ')[0] || 'there'
  const userId = user?.uid || ''

  const [phase, setPhaseRaw] = useState<Phase>(() => {
    if (typeof window === 'undefined') return 'logo'
    const saved = sessionStorage.getItem('xerus_onboarding_phase')
    if (saved === 'template') return saved as Phase
    return 'logo'
  })
  const setPhaseRef = useRef((p: Phase) => {
    setPhaseRaw(p)
    sessionStorage.setItem('xerus_onboarding_phase', p)
  })
  const setPhase = setPhaseRef.current
  const [messages, setMessages] = useState<OnboardingMessage[]>([])
  const [templateIndex, setTemplateIndex] = useState(0)
  const [templateTypingDone, setTemplateTypingDone] = useState(-1)
  const [quickReplies, setQuickReplies] = useState<typeof INITIAL_QUICK_REPLIES>([])
  const [workspaceData, setWorkspaceData] = useState<{ workspace: string; project: string } | null>(null)
  const hasNavigatedRef = useRef(false)
  const quickReplyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const stream = useOnboardingStream({ userId, onWorkspaceCreated: markWorkspaceReady })
  const templateMessages = useMemo(() => buildTemplateMessages(firstName), [firstName])

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
      quickReplyTimerRef.current = setTimeout(() => setQuickReplies(INITIAL_QUICK_REPLIES), 500)
    }
  }, [templateMessages.length])

  useEffect(() => () => clearTimeout(quickReplyTimerRef.current), [])

  // User clicks "Start fresh" / "Bring my company" → add workspace setup card to chat
  const handleQuickReply = useCallback((value: string) => {
    const reply = INITIAL_QUICK_REPLIES.find((r) => r.value === value)
    const label = reply?.label || value
    // Add user's choice as a message
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: label,
      source: 'template' as const,
    }])
    setQuickReplies([])

    // Add Xerus response with the workspace setup card — same chat UI
    setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: `workspace-card`,
        role: 'assistant' as const,
        content: 'Great choice! Let\u2019s name your workspace and first project.',
        source: 'stream' as const,
        ui: {
          type: 'workspace-setup',
          props: {},
        },
      }])
    }, 600)
  }, [])

  const collapseCard = useCallback((messageId: string, collapsedText: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.ui) return m
        return { ...m, ui: { ...m.ui, collapsed: true, collapsedText } }
      })
    )
  }, [])

  // Handle workspace card submit → collapse card, show Screen 2, handoff in background
  const { createWorkspace } = stream
  const handleUIAction = useCallback(async (messageId: string, action: string, data: Record<string, unknown>) => {
    if (action === 'create-workspace') {
      const workspace = String(data.workspace ?? '')
      const project = String(data.project ?? '')
      setWorkspaceData({ workspace, project })
      collapseCard(messageId, `${workspace} \u2014 ${project}`)
      setPhase('setup')

      // Background: POST /onboarding/handoff (creates workspace + domain + channel + sandbox)
      try {
        await createWorkspace(workspace, project)
      } catch (err) {
        console.error('[Onboarding] Workspace creation failed:', err)
      }
      return
    }

    collapseCard(messageId, '')
  }, [collapseCard, createWorkspace])

  const handleSetupComplete = useCallback(() => {
    stream.completeOnboarding()
  }, [stream])

  // Navigate after onboarding completes
  useEffect(() => {
    if (stream.mode === 'complete' && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      sessionStorage.removeItem('xerus_onboarding_phase')
      router.push('/')
    }
  }, [stream.mode, router])

  const showChat = phase === 'logo' || phase === 'template'

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-alt">
      <BlobBackground />

      <AnimatePresence mode="wait">
        {/* ── Chat phases (logo + template messages + workspace card) ── */}
        {showChat && (
          <motion.div
            key="chat"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col min-h-0"
          >
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

            {phase === 'template' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <OnboardingMessages
                  messages={messages}
                  onLogoReady={() => {}}
                  onTypingComplete={handleTypingComplete}
                  onUIAction={handleUIAction}
                  quickReplies={quickReplies.length > 0 ? quickReplies : undefined}
                  onQuickReply={handleQuickReply}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── Setup wizard (Screen 2 — visual progress + provisioning in background) ── */}
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
