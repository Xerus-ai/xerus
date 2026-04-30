'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Loader2, ArrowRight, Building2, Hash, Activity, Unplug,
  Inbox, Calendar, Search, PenTool, BarChart3, Zap, Circle,
  AlertTriangle,
} from 'lucide-react'
import {
  SiGmail, SiSlack, SiNotion, SiGooglesheets,
  SiGooglecalendar, SiX, SiLinkedin, SiGithub,
  SiYoutube, SiReddit, SiTrello, SiDropbox,
  SiZapier, SiFigma, SiAsana, SiJira,
} from 'react-icons/si'
import { MascotAvatar } from '@/components/agents/MascotAvatar'
import { isMascotConfig } from '@/lib/mascot-config'
import { getSkills } from '@/lib/api/skills'
import { auth as firebaseAuth } from '@/utils/firebase'

/* ── Types ── */

interface Agent {
  id: string
  name: string
  description: string
  avatar_url?: string
  tools?: Array<{ name: string; name_slug: string }>
}

interface OnboardingStepsProps {
  workspace: { workspace: string; project: string }
  agents: Agent[]
  onComplete: () => void
}

/* ── Static Data ── */

const PROGRESS_STEPS = [
  { label: 'Office Space', desc: 'Setting up your workspace', icon: Building2, duration: 2000 },
  { label: 'Channels & Projects', desc: 'Organizing workflow', icon: Hash, duration: 2000 },
  { label: 'Agent Heartbeat', desc: 'Preparing your AI team', icon: Activity, duration: 2000 },
  { label: 'Apps & Skills', desc: 'Connecting your tools', icon: Unplug, duration: 2000 },
  { label: 'Office & Inbox', desc: 'Your command center', icon: Inbox, duration: 2000 },
]

const APPS = [
  { name: 'Gmail', icon: SiGmail, color: '#EA4335' },
  { name: 'Slack', icon: SiSlack, color: '#4A154B' },
  { name: 'Notion', icon: SiNotion, color: '#000000' },
  { name: 'LinkedIn', icon: SiLinkedin, color: '#0A66C2' },
  { name: 'YouTube', icon: SiYoutube, color: '#FF0000' },
  { name: 'Calendar', icon: SiGooglecalendar, color: '#4285F4' },
  { name: 'Sheets', icon: SiGooglesheets, color: '#0F9D58' },
  { name: 'Reddit', icon: SiReddit, color: '#FF4500' },
  { name: 'GitHub', icon: SiGithub, color: '#24292F' },
  { name: 'Trello', icon: SiTrello, color: '#0052CC' },
  { name: 'Dropbox', icon: SiDropbox, color: '#0061FF' },
  { name: 'Zapier', icon: SiZapier, color: '#FF4A00' },
  { name: 'Figma', icon: SiFigma, color: '#F24E1E' },
  { name: 'Asana', icon: SiAsana, color: '#F06A6A' },
  { name: 'Jira', icon: SiJira, color: '#0052CC' },
  { name: 'X', icon: SiX, color: '#000000' },
]

const FALLBACK_SKILLS = [
  { name: 'Deep Research', desc: 'Topic analysis & reports', icon: Search },
  { name: 'Content Writing', desc: 'Newsletters & copy', icon: PenTool },
  { name: 'Data Analysis', desc: 'Spreadsheets & charts', icon: BarChart3 },
  { name: 'Automation', desc: 'Tasks & triggers', icon: Zap },
]

const SKILL_ICON_MAP: Record<string, typeof Search> = {
  productivity: Search,
  content: PenTool,
  business: BarChart3,
  development: Zap,
  education: Search,
  finance: BarChart3,
  operations: Zap,
  wellness: PenTool,
}

/* Inbox preview channels */
const CHANNELS = [
  { name: 'general', active: true },
  { name: 'marketing', active: false },
  { name: 'research', active: false },
]

/* Inbox preview activity messages - derived from agents at runtime */
const FALLBACK_ACTIVITY_MESSAGES = [
  { agent: 'Research Analyst', time: '2m ago', text: 'Compiled competitor analysis report — 12 sources reviewed, 3 key insights flagged.', color: 'hsl(var(--primary))' },
  { agent: 'Content Writer', time: '8m ago', text: 'Draft newsletter ready for review. Subject line A/B variants attached.', color: '#8B7355' },
]

const ESCALATION = {
  agent: 'Social Media Mgr',
  text: 'LinkedIn post scheduled for 2 PM needs approval — mentions partner brand.',
  time: '12m ago',
}

const KANBAN_COLUMNS = [
  {
    title: 'To Do',
    color: '#9E8E7E',
    tasks: [
      { title: 'Review Q1 marketing brief', labels: [{ name: 'Marketing', color: '#C2773B' }], due: 'Feb 24' },
      { title: 'Set up email campaign flow', labels: [{ name: 'Email', color: '#EA4335' }], due: 'Feb 26' },
    ],
  },
  {
    title: 'In Progress',
    color: '#3B82F6',
    tasks: [
      { title: 'Competitor landscape analysis', labels: [{ name: 'Research', color: 'hsl(var(--primary))' }], due: 'Feb 22' },
      { title: 'Social media content calendar', labels: [{ name: 'Social', color: '#1DA1F2' }], due: 'Feb 23' },
    ],
  },
  {
    title: 'Done',
    color: '#22C55E',
    tasks: [
      { title: 'Brand voice guidelines doc', labels: [{ name: 'Content', color: '#0F9D58' }], due: 'Feb 20' },
    ],
  },
]

/* ── Animation variants ── */

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

const fadeScale = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring' as const, stiffness: 200, damping: 20 } },
}

/* ── Component ── */

export function OnboardingSteps({ workspace, agents, onComplete }: OnboardingStepsProps) {
  const [completedPhase, setCompletedPhase] = useState(-1)
  const [done, setDone] = useState(false)
  const [contentSlide, setContentSlide] = useState<0 | 1>(0) // 0 = bento, 1 = inbox
  const [skills, setSkills] = useState(FALLBACK_SKILLS)

  const activePhase = done ? PROGRESS_STEPS.length : completedPhase + 1

  // Fetch skills from backend (only when auth is ready)
  useEffect(() => {
    if (!firebaseAuth?.currentUser) return
    let cancelled = false
    getSkills({ limit: 4, sort_by: 'created_at', sort_order: 'desc' })
      .then((result) => {
        if (cancelled || result.skills.length === 0) return
        setSkills(
          result.skills.slice(0, 4).map((s) => ({
            name: s.name,
            desc: s.description.length > 30 ? s.description.slice(0, 27) + '...' : s.description,
            icon: SKILL_ICON_MAP[s.category ?? ''] ?? Zap,
          }))
        )
      })
      .catch(() => {
        // Keep fallback skills on error
      })
    return () => { cancelled = true }
  }, [])

  // Derive activity messages from the agents prop
  const ACTIVITY_MESSAGES = agents.length >= 2
    ? [
        { agent: agents[0].name, time: '2m ago', text: `Completed initial analysis and filed report.`, color: 'hsl(var(--primary))' },
        { agent: agents[1].name, time: '8m ago', text: `Draft deliverable ready for review.`, color: '#8B7355' },
      ]
    : FALLBACK_ACTIVITY_MESSAGES

  // Sidebar step progression: 5 steps × 2s = 10s
  useEffect(() => {
    if (done) return
    const next = completedPhase + 1
    if (next >= PROGRESS_STEPS.length) {
      const timer = setTimeout(() => setDone(true), 800)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setCompletedPhase(next), PROGRESS_STEPS[next].duration)
    return () => clearTimeout(timer)
  }, [completedPhase, done])

  // Content slide: switch from bento → inbox after 5s
  useEffect(() => {
    if (done) return
    const timer = setTimeout(() => setContentSlide(1), 5000)
    return () => clearTimeout(timer)
  }, [done])

  // Take first 3 agents for the bento grid
  const displayAgents = agents.slice(0, 3)

  return (
    <div className="flex h-full">
      {/* ── Desktop Sidebar — ALWAYS visible ── */}
      <div className="hidden md:flex w-[340px] shrink-0 flex-col justify-center pl-12 pr-8">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-8 select-none">
          Office Setup
        </p>
        <nav className="space-y-2 stagger-in">
          {PROGRESS_STEPS.map((step, idx) => {
            const isDone = idx <= completedPhase || done
            const isActive = !done && idx === activePhase
            const StepIcon = step.icon

            return (
              <div
                key={step.label}
                className={`flex items-start gap-3.5 px-3.5 py-3 rounded-2xl transition-all duration-200 ${
                  isActive ? 'bg-secondary/5' : ''
                }`}
              >
                {isDone ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <Check className="w-4 h-4 text-secondary" />
                  </motion.div>
                ) : isActive ? (
                  <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Loader2 className="w-4 h-4 text-secondary animate-spin" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0 mt-0.5">
                    <StepIcon className="w-4 h-4 text-text-muted" />
                  </div>
                )}

                <div className="min-w-0 pt-0.5">
                  <span className={`text-base font-semibold leading-tight transition-colors duration-200 block ${
                    isDone ? 'text-text-secondary' :
                    isActive ? 'text-secondary' :
                    'text-text-muted'
                  }`}>
                    {step.label}
                  </span>
                  <span className="text-xs text-text-muted leading-tight block mt-1">
                    {step.desc}
                  </span>
                </div>
              </div>
            )
          })}
        </nav>
      </div>

      {/* ── Mobile Progress ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-surface-alt/90 backdrop-blur-sm px-4 py-3 border-b border-surface-active/30">
        <div className="flex items-center justify-center gap-3">
          {PROGRESS_STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                (idx <= completedPhase || done) ? 'bg-secondary' :
                (!done && idx === activePhase) ? 'bg-secondary/50' :
                'bg-surface-active'
              }`} />
              {idx < PROGRESS_STEPS.length - 1 && (
                <div className={`w-4 h-px ${
                  (done || completedPhase >= idx + 1) ? 'bg-secondary/30' : 'bg-surface-active'
                }`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-text-muted mt-1">
          {done ? 'All Set' : PROGRESS_STEPS[activePhase]?.label}
        </p>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 flex flex-col justify-center md:mt-0 mt-14 overflow-hidden px-6 md:px-10">
        <AnimatePresence mode="wait">
          {done ? (
            /* ── Completion ── */
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col items-center text-center py-16"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-6"
              >
                <Image src="/logo/xerus.svg" alt="Xerus" width={36} height={36} />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="font-serif text-3xl sm:text-4xl text-text"
              >
                Your AI office is ready
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="text-base sm:text-lg text-text-secondary mt-3 max-w-lg"
              >
                {workspace.workspace} is set up with your {workspace.project} project.
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-sm sm:text-base text-text-muted mt-4 max-w-lg leading-relaxed"
              >
                You can always chat with me from the Chat window — I&apos;ll help you
                create agents, build teams, and manage your office.
              </motion.p>

              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, type: 'spring', stiffness: 200, damping: 20 }}
                onClick={onComplete}
                className="mt-8 w-full max-w-xs px-8 py-4 rounded-2xl bg-text hover:bg-text/90 text-white text-base font-medium transition-all duration-200 flex items-center justify-center gap-2.5 active:scale-[0.98] shadow-sm hover:shadow-md"
              >
                Enter your office
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </motion.div>

          ) : contentSlide === 0 ? (
            /* ═══════════════════════════════════════════════════
               SLIDE 1: Bento Grid — Agents + Apps + Skills (5s)
               ═══════════════════════════════════════════════════ */
            <motion.div
              key="bento"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.4 }}
              className="max-w-4xl w-full mx-auto space-y-6"
            >
              {/* Heading */}
              <motion.div {...fadeUp}>
                <h2 className="font-serif text-4xl sm:text-5xl text-text">Your AI Office</h2>
                <p className="text-base sm:text-lg text-text-secondary mt-2">
                  Here&apos;s what we&apos;re setting up for you
                </p>
              </motion.div>

              {/* Row 1: Agent cards */}
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                variants={stagger}
                initial="initial"
                animate="animate"
              >
                {displayAgents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    variants={fadeScale}
                    className="bg-surface rounded-[28px] p-5 shadow-sm border border-surface-active/30"
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-surface-active bg-surface-hover mb-3">
                      {isMascotConfig(agent.avatar_url) ? (
                        <MascotAvatar config={agent.avatar_url!} size={48} className="w-full h-full" alt={agent.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base font-serif text-text-muted">
                          {agent.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <h4 className="font-serif text-base text-text leading-tight">{agent.name}</h4>
                    <p className="text-xs text-text-secondary leading-relaxed mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                    {agent.tools && agent.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {agent.tools.map((tool) => (
                          <span
                            key={tool.name_slug}
                            className="text-[10px] font-medium text-text-muted bg-surface-hover border border-surface-active rounded-full px-1.5 py-0.5"
                          >
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>

              {/* Row 2: Two bento cards — Apps Mosaic + Skills Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-in">

                {/* ── Apps Mosaic ── */}
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.5 }}
                  className="rounded-3xl bg-surface p-6 shadow-sm border border-surface-active/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-5 select-none">
                    Connected Apps
                  </p>
                  <div className="grid grid-cols-5 gap-3">
                    {APPS.map((app, i) => {
                      const Icon = app.icon
                      return (
                        <motion.div
                          key={app.name}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            delay: 0.42 + i * 0.03,
                            type: 'spring' as const,
                            stiffness: 280,
                            damping: 18,
                          }}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div
                            className="w-11 h-11 rounded-[14px] flex items-center justify-center shadow-sm border border-surface-active/20"
                            style={{ backgroundColor: `${app.color}0A` }}
                          >
                            <Icon size={20} color={app.color} />
                          </div>
                          <span className="text-[9px] font-medium text-text-muted text-center leading-none">
                            {app.name}
                          </span>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>

                {/* ── Skill Capability Grid ── */}
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="rounded-3xl bg-surface p-6 shadow-sm border border-surface-active/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-5 select-none">
                    Skills
                  </p>
                  {/* 2×2 mini bento cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {skills.map((skill, i) => {
                      const Icon = skill.icon
                      return (
                        <motion.div
                          key={skill.name}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5 + i * 0.07 }}
                          className="rounded-xl bg-surface-alt/60 border border-surface-active/20 p-3.5 flex flex-col gap-2.5"
                        >
                          <div className="w-9 h-9 rounded-lg bg-secondary/8 flex items-center justify-center">
                            <Icon className="w-[18px] h-[18px] text-secondary" />
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-text leading-tight">{skill.name}</div>
                            <div className="text-[10px] text-text-muted mt-0.5 leading-snug">{skill.desc}</div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>

              </div>
            </motion.div>

          ) : (
            /* ═══════════════════════════════════════════════════
               SLIDE 2: Inbox — Channels + Task Board (5s)
               ═══════════════════════════════════════════════════ */
            <motion.div
              key="inbox"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-4xl w-full mx-auto space-y-6"
            >
              {/* Heading */}
              <motion.div {...fadeUp}>
                <h2 className="font-serif text-4xl sm:text-5xl text-text">Your Command Center</h2>
                <p className="text-base sm:text-lg text-text-secondary mt-2">
                  Where your agents report back
                </p>
              </motion.div>

              {/* Two-column: Activity + Kanban */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                {/* Left: Channel activity (2/5) */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.45 }}
                  className="lg:col-span-2 rounded-3xl bg-surface p-5 shadow-sm border border-surface-active/30 flex flex-col"
                >
                  {/* Channel tabs */}
                  <div className="flex items-center gap-1.5 mb-4">
                    {CHANNELS.map((ch) => (
                      <div
                        key={ch.name}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          ch.active
                            ? 'bg-secondary/8 text-secondary'
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        <Hash className="w-3 h-3 inline mr-0.5 -mt-px" />
                        {ch.name}
                      </div>
                    ))}
                  </div>

                  {/* Activity messages */}
                  <div className="space-y-3 flex-1">
                    {ACTIVITY_MESSAGES.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.12 }}
                        className="flex gap-2.5"
                      >
                        <div
                          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                          style={{ backgroundColor: msg.color }}
                        >
                          {msg.agent.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-text">{msg.agent}</span>
                            <span className="text-[10px] text-text-muted">{msg.time}</span>
                          </div>
                          <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5 line-clamp-2">
                            {msg.text}
                          </p>
                        </div>
                      </motion.div>
                    ))}

                    {/* Escalation */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="border border-amber-400/30 bg-amber-50/40 rounded-xl px-3 py-2.5"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-700">
                          Needs Approval
                        </span>
                        <span className="text-[10px] text-text-muted ml-auto">{ESCALATION.time}</span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        <span className="font-semibold text-text">{ESCALATION.agent}:</span>{' '}
                        {ESCALATION.text}
                      </p>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Right: Kanban board (3/5) */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.45 }}
                  className="lg:col-span-3 rounded-3xl bg-surface p-5 shadow-sm border border-surface-active/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-4 select-none">
                    Task Board
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {KANBAN_COLUMNS.map((col, colIdx) => (
                      <motion.div
                        key={col.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 + colIdx * 0.1 }}
                      >
                        {/* Column header */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: col.color }}
                          />
                          <span className="text-[11px] font-semibold text-text">{col.title}</span>
                          <span className="text-[10px] text-text-muted ml-auto">{col.tasks.length}</span>
                        </div>

                        {/* Tasks */}
                        <div className="space-y-2">
                          {col.tasks.map((task, taskIdx) => (
                            <motion.div
                              key={taskIdx}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.5 + colIdx * 0.1 + taskIdx * 0.08 }}
                              className="bg-surface-alt rounded-xl p-3 border border-surface-active/20"
                            >
                              <div className="flex items-start gap-1.5">
                                <Circle className="w-3.5 h-3.5 text-surface-active mt-px shrink-0" strokeWidth={1.5} />
                                <h5 className="text-[11px] font-medium text-text leading-snug line-clamp-2">
                                  {task.title}
                                </h5>
                              </div>
                              <div className="flex items-center gap-2 mt-2 pl-5">
                                {task.labels.map((label) => (
                                  <span
                                    key={label.name}
                                    className="text-[9px] font-medium rounded-full px-1.5 py-px"
                                    style={{
                                      color: label.color,
                                      backgroundColor: `${label.color}15`,
                                    }}
                                  >
                                    {label.name}
                                  </span>
                                ))}
                                <span className="text-[9px] text-text-muted ml-auto flex items-center gap-0.5">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {task.due}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
