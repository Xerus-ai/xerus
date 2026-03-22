'use client'

import { useMemo, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAnimationQueue } from '@/hooks/useAnimationQueue'
import { calculateAllPositions, INBOX_DESK_POSITION } from './office-layout'
import { AgentNode } from './AgentNode'
import { FlyingTask } from './FlyingTask'
import { OfficeHUD } from './OfficeHUD'
import type { OfficeAgent } from '@/hooks/useOfficeData'
import type { StatusTransition, FlyingTaskData } from './office-types'

interface OfficeCanvasProps {
  agents: OfficeAgent[]
  transitions: StatusTransition[]
  lastRefresh: Date | null
}

export function OfficeCanvas({ agents, transitions, lastRefresh }: OfficeCanvasProps) {
  const { active: flyingTasks, enqueue, dequeue } = useAnimationQueue()

  const agentStates = useMemo(() => {
    return calculateAllPositions(agents, null)
  }, [agents])

  useEffect(() => {
    for (const transition of transitions) {
      const agentState = agentStates.get(transition.agentId)
      if (!agentState || !transition.taskTitle) continue

      if (transition.from === 'active') {
        const flyingTask: FlyingTaskData = {
          id: `${transition.agentId}-${Date.now()}`,
          from: agentState.position,
          to: INBOX_DESK_POSITION,
          taskTitle: transition.taskTitle,
          type: 'return',
        }
        enqueue(flyingTask)
      }

      if (transition.to === 'active') {
        const flyingTask: FlyingTaskData = {
          id: `${transition.agentId}-dispatch-${Date.now()}`,
          from: INBOX_DESK_POSITION,
          to: agentState.position,
          taskTitle: transition.taskTitle,
          type: 'dispatch',
        }
        enqueue(flyingTask)
      }
    }
  }, [transitions, agentStates, enqueue])

  // Label collision detection
  const labelHidden = useMemo(() => {
    const hidden = new Set<string>()
    const states = Array.from(agentStates.values())
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const a = states[i].position
        const b = states[j].position
        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
        if (dist < 8) hidden.add(states[j].agent.id)
      }
    }
    return hidden
  }, [agentStates])

  return (
    <div
      className="office-scene relative w-full overflow-hidden rounded-2xl border border-[#3D2B1F]/30"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* === BACKGROUND === */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/office/bg.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      </div>

      {/* === FURNITURE === */}

      {/* --- WALL --- */}
      {/* Whiteboard (moved right) */}
      <div className="absolute pointer-events-none" style={{
        left: '42%', top: '9%', width: '22%',
        transform: 'translate(-50%, -50%)', zIndex: 30, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/whiteboard.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* Cabinet (next to whiteboard) */}
      <div className="absolute pointer-events-none" style={{
        left: '62%', top: '16%', width: '10%',
        transform: 'translate(-50%, -50%)', zIndex: 30, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/cabinet.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* Printer (on plain desk) */}
      <div className="absolute pointer-events-none" style={{
        left: '82%', top: '56%', width: '8%',
        transform: 'translate(-50%, -50%)', zIndex: 26, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/printer.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* --- FLOOR: RIGHT WORK ZONE (x: 45-96%) --- */}
      {/* Row 1: desks with PCs */}
      {[
        { x: 58, y: 36, w: 16 },
        { x: 80, y: 36, w: 16 },
      ].map((d, i) => (
        <div key={`deskpc-${i}`} className="absolute pointer-events-none" style={{
          left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`,
          transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/office/desk-with-pc.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
        </div>
      ))}

      {/* Row 2: plain desks */}
      {[
        { x: 58, y: 58, w: 16 },
        { x: 80, y: 58, w: 16 },
      ].map((d, i) => (
        <div key={`desk-${i}`} className="absolute pointer-events-none" style={{
          left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`,
          transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/office/desk.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
        </div>
      ))}

      {/* Inbox desk (center-right, below desk rows) */}
      <div className="absolute pointer-events-none" style={{
        left: '69%', top: '82%', width: '18%',
        transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/inbox-desk.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* Writing table (idle area, bottom-center) */}
      <div className="absolute pointer-events-none" style={{
        left: '55%', top: '85%', width: '14%',
        transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/writing-table.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* --- CAFE ZONE (top-left, coffee break area) --- */}
      {/* Cafe sign on wall */}
      <div className="absolute pointer-events-none" style={{
        left: '14%', top: '28%', width: '8%',
        transform: 'translate(-50%, -50%)', zIndex: 30, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/cafesign.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* Cafe tables (below sign, where sleeping agents rest) */}
      <div className="absolute pointer-events-none" style={{
        left: '14%', top: '38%', width: '14%',
        transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/cafetables.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>

      {/* --- RUG (bottom, idle zone) --- */}
      <div className="absolute pointer-events-none" style={{
        left: '22%', top: '75%', width: '30%',
        transform: 'translate(-50%, -50%)', zIndex: 5, imageRendering: 'pixelated',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/office/rug.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated', opacity: 0.9 }} draggable={false} />
      </div>

      {/* --- PLANTS --- */}
      {[
        { x: 4, y: 25, w: 7 },
        { x: 50, y: 36, w: 6 },
        { x: 45, y: 58, w: 6 },
        { x: 96, y: 25, w: 7 },
      ].map((p, i) => (
        <div key={`plant-${i}`} className="absolute pointer-events-none" style={{
          left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`,
          transform: 'translate(-50%, -50%)', zIndex: 25, imageRendering: 'pixelated',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/office/plant.png" alt="" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} draggable={false} />
        </div>
      ))}

      {/* === AGENTS === */}
      <AnimatePresence>
        {Array.from(agentStates.values()).map(state => (
          <AgentNode
            key={state.agent.id}
            state={state}
            labelHidden={labelHidden.has(state.agent.id)}
          />
        ))}
      </AnimatePresence>

      {/* === FLYING TASKS === */}
      <AnimatePresence>
        {flyingTasks.map(task => (
          <FlyingTask key={task.id} data={task} onComplete={dequeue} />
        ))}
      </AnimatePresence>

      {/* === HUD OVERLAY === */}
      <OfficeHUD agents={agents} lastRefresh={lastRefresh} />
    </div>
  )
}
