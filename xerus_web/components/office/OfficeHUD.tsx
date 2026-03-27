'use client'

import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'
import type { OfficeAgent } from '@/hooks/useOfficeData'

interface OfficeHUDProps {
  agents: OfficeAgent[]
  lastRefresh: Date | null
}

export function OfficeHUD({ agents }: OfficeHUDProps) {
  const activeAgents = agents.filter(a => a.status === 'active' && a.current_task)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <>
      {/* Whiteboard clock overlay */}
      <div
        className="absolute flex flex-col items-center justify-center pointer-events-none"
        style={{ left: '42%', top: '9%', width: '22%', transform: 'translate(-50%, -50%)', zIndex: 35 }}
      >
        <span className="text-[1.6vw] font-bold text-[#3D2B1F]/80 font-mono leading-none tracking-wide">
          {time}
        </span>
        <span className="text-[0.8vw] text-[#3D2B1F]/50 font-medium mt-[0.2vw]">
          {date}
        </span>
      </div>

      {/* Bottom: Activity ticker */}
      {activeAgents.length > 0 && (
        <div className="absolute bottom-3 left-3 right-3 z-40 flex gap-2 overflow-x-auto scrollbar-none">
          {activeAgents.slice(0, 4).map(agent => (
            <div
              key={agent.id}
              className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm whitespace-nowrap flex-shrink-0"
            >
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-medium text-text">{agent.name}</span>
              <span className="text-[10px] text-text-secondary max-w-[120px] truncate">
                {agent.current_task}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
