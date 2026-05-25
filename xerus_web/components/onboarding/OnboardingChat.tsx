'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/utils/AuthContext'
import { useOnboardingStream } from '@/hooks/useOnboardingStream'
import { createCheckout, syncSubscription, getSubscription } from '@/lib/api/billing'
import { saveApiKey, triggerCliLogin } from '@/lib/api/user'
import { PLANS, type PlanType } from '@/lib/plans'
import { BlobBackground } from './BlobBackground'
import { LogoEntrance } from './LogoEntrance'
import { OnboardingMessages } from './OnboardingMessages'
import { OnboardingSteps } from './OnboardingSteps'
import { PolarCheckoutOverlay } from './cards/PolarCheckoutOverlay'
import { ThinkingVerbs } from './ui/ThinkingVerbs'
import type { OnboardingMessage } from './types'
import { SETUP_AGENTS, buildTemplateMessages, INITIAL_QUICK_REPLIES } from './constants'

type Phase = 'logo' | 'template' | 'plan' | 'activate' | 'setup'

const SUBSCRIPTION_POLL_INTERVAL_MS = 3000
const SUBSCRIPTION_POLL_MAX_ATTEMPTS = 40 // ~2 minutes

export function OnboardingChat() {
  const router = useRouter()
  const { user, markWorkspaceReady } = useAuth()
  const firstName = user?.display_name?.split(' ')[0] || 'there'
  const userId = user?.uid || ''

  const [phase, setPhaseRaw] = useState<Phase>('logo')
  const setPhase = useCallback((p: Phase) => {
    setPhaseRaw(p)
  }, [])
  const [messages, setMessages] = useState<OnboardingMessage[]>([])
  const [templateIndex, setTemplateIndex] = useState(0)
  const [templateTypingDone, setTemplateTypingDone] = useState(-1)
  const [quickReplies, setQuickReplies] = useState<typeof INITIAL_QUICK_REPLIES>([])
  const [workspaceData, setWorkspaceData] = useState<{ workspace: string; project: string } | null>(null)
  const hasNavigatedRef = useRef(false)
  const quickReplyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Checkout overlay state
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [showThinking, setShowThinking] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingPlanRef = useRef<{ messageId: string; label: string } | null>(null)

  const stream = useOnboardingStream({ userId, onWorkspaceCreated: markWorkspaceReady })
  const templateMessages = useMemo(() => buildTemplateMessages(firstName), [firstName])

  // On mount: check if subscription is already active (e.g. user paid, then reloaded)
  // If so, skip directly to 'activate' phase — don't re-show plan selection.
  const resumeCheckedRef = useRef(false)
  useEffect(() => {
    if (resumeCheckedRef.current || !userId) return
    resumeCheckedRef.current = true
    getSubscription()
      .then((sub) => {
        if (sub.subscription_status === 'active') {
          setPhase('activate')
        }
      })
      .catch(() => {
        // Not subscribed or network error — proceed with normal flow
      })
  }, [userId, setPhase])

  // Logo phase: hold for 2.5s then transition to template (only if still on logo)
  useEffect(() => {
    if (phase !== 'logo') return
    const timer = setTimeout(() => {
      setPhaseRaw((current) => current === 'logo' ? 'template' : current)
    }, 2500)
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

  // Clean up poll timer on unmount
  useEffect(() => () => clearTimeout(pollRef.current), [])

  // User clicks "Start fresh" / "Bring my company" -> add workspace setup card to chat
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

    // Add Xerus response with the workspace setup card -- same chat UI
    setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: `workspace-card`,
        role: 'assistant' as const,
        content: `Great choice! Let's set up your office.\n\nYour workspace is your company's virtual HQ — all your agents, projects, and data live here. A project groups related work together (e.g. "Content Strategy" or "Q3 Launch"). Inside each project, channels keep conversations organized — like Slack channels but with AI agents participating.`,
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

  // Poll Polar via /billing/subscription/sync until subscription is active
  const pollForSubscription = useCallback(() => {
    let attempts = 0
    const poll = () => {
      attempts++
      if (attempts > SUBSCRIPTION_POLL_MAX_ATTEMPTS) {
        setShowThinking(false)
        setPhase('activate')
        return
      }
      syncSubscription()
        .then((result) => {
          if (result.synced && result.subscription_status === 'active') {
            setShowThinking(false)
            setPhase('activate')
          } else {
            pollRef.current = setTimeout(poll, SUBSCRIPTION_POLL_INTERVAL_MS)
          }
        })
        .catch(() => {
          pollRef.current = setTimeout(poll, SUBSCRIPTION_POLL_INTERVAL_MS)
        })
    }
    pollRef.current = setTimeout(poll, SUBSCRIPTION_POLL_INTERVAL_MS)
  }, [setPhase])

  // Handle workspace card submit -> collapse card, go to plan phase
  const { createWorkspace } = stream
  const handleUIAction = useCallback(async (messageId: string, action: string, data: Record<string, unknown>) => {
    if (action === 'create-workspace') {
      const workspace = String(data.workspace ?? '')
      const project = String(data.project ?? '')
      setWorkspaceData({ workspace, project })
      collapseCard(messageId, `${workspace} — ${project}`)

      // Add plan selection card inline
      setTimeout(() => {
        setMessages((prev) => [...prev, {
          id: 'plan-card',
          role: 'assistant' as const,
          content: `Now let's pick a plan for your workspace.\n\nEach plan comes with bonus credits to get you started. After that, you can bring your own API key — connect an OpenRouter key, log in with your Claude (Anthropic) subscription, or use Codex (coming soon) — and run agents with zero markup on token costs.`,
          source: 'stream' as const,
          ui: {
            type: 'plan-selection',
            props: {},
          },
        }])
      }, 600)

      setPhase('plan')
      return
    }

    if (action === 'plan-selected') {
      const plan = data.plan as PlanType
      const interval = data.interval as 'monthly' | 'annual'
      const planInfo = PLANS[plan]
      pendingPlanRef.current = { messageId, label: `${planInfo.label} plan — $${interval === 'monthly' ? planInfo.monthly : planInfo.annual}/mo` }

      // Create checkout session — card stays visible with selected state while loading
      try {
        const { checkout_url } = await createCheckout(plan, interval)
        setCheckoutUrl(checkout_url)
      } catch (err) {
        console.error('[Onboarding] Checkout creation failed:', err)
        pendingPlanRef.current = null
      }
      return
    }

    if (action === 'provider-selected') {
      const provider = data.provider as string
      const key = data.key as string | undefined
      collapseCard(messageId, provider === 'skip' ? 'Using bonus credits' : `Connected: ${provider}`)

      // Save API key if provided
      if (provider === 'openrouter' && key) {
        try {
          await saveApiKey(key, 'openrouter')
        } catch (err) {
          console.error('[Onboarding] Failed to save API key:', err)
        }
      }

      // Trigger CLI login for claudecode
      if (provider === 'claudecode') {
        try {
          await triggerCliLogin('claudecode')
        } catch (err) {
          console.error('[Onboarding] CLI login trigger failed:', err)
        }
      }

      // Kick off workspace handoff in background, then go to setup
      setPhase('setup')
      if (workspaceData) {
        try {
          await createWorkspace(workspaceData.workspace, workspaceData.project)
        } catch (err) {
          console.error('[Onboarding] Workspace creation failed:', err)
        }
      }
      return
    }

    collapseCard(messageId, '')
  }, [collapseCard, createWorkspace, setPhase, workspaceData])

  // Checkout success handler
  const handleCheckoutSuccess = useCallback(() => {
    if (pendingPlanRef.current) {
      collapseCard(pendingPlanRef.current.messageId, pendingPlanRef.current.label)
      pendingPlanRef.current = null
    }
    setCheckoutUrl(null)
    setShowThinking(true)
    pollForSubscription()
  }, [collapseCard, pollForSubscription])

  const handleCheckoutCancel = useCallback(() => {
    pendingPlanRef.current = null
    setCheckoutUrl(null)
  }, [])

  // When activate phase starts, add the activate workforce card
  useEffect(() => {
    if (phase !== 'activate') return
    // Check if card already added
    setMessages((prev) => {
      if (prev.some((m) => m.id === 'activate-card')) return prev
      return [...prev, {
        id: 'activate-card',
        role: 'assistant' as const,
        content: 'Your subscription is active! You can connect an AI provider now or set it up later in Settings > API Keys.',
        source: 'stream' as const,
        ui: {
          type: 'activate-workforce',
          props: {},
        },
      }]
    })
  }, [phase])

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

  const showChat = phase === 'logo' || phase === 'template' || phase === 'plan' || phase === 'activate'

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-alt">
      <BlobBackground />

      {/* Checkout overlay */}
      <AnimatePresence>
        {checkoutUrl && (
          <PolarCheckoutOverlay
            checkoutUrl={checkoutUrl}
            onSuccess={handleCheckoutSuccess}
            onCancel={handleCheckoutCancel}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* -- Chat phases (logo + template messages + workspace card + plan + activate) -- */}
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

            {(phase === 'template' || phase === 'plan' || phase === 'activate') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="flex-1 flex flex-col min-h-0"
              >
                {showThinking ? (
                  <div className="flex-1 flex items-center justify-center">
                    <ThinkingVerbs />
                  </div>
                ) : (
                  <OnboardingMessages
                    messages={messages}
                    onLogoReady={() => {}}
                    onTypingComplete={handleTypingComplete}
                    onUIAction={handleUIAction}
                    quickReplies={quickReplies.length > 0 ? quickReplies : undefined}
                    onQuickReply={handleQuickReply}
                  />
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* -- Setup wizard (Screen 2 -- visual progress + provisioning in background) -- */}
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
