'use client'

import { motion } from 'framer-motion'
import type { FlyingTaskData } from './office-types'

interface FlyingTaskProps {
  data: FlyingTaskData
  onComplete: (id: string) => void
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
}

export function FlyingTask({ data, onComplete }: FlyingTaskProps) {
  const isDispatch = data.type === 'dispatch'
  const duration = isDispatch ? 2 : 1.5
  const accentColor = isDispatch ? '#FF6600' : '#4CAF50'

  // Bezier control point for the arc (halfway x, offset y upward)
  const midX = (data.from.x + data.to.x) / 2
  const midY = Math.min(data.from.y, data.to.y) - 12

  return (
    <>
      {/* Trail particles */}
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={`trail-${data.id}-${i}`}
          className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            backgroundColor: accentColor,
            opacity: 0.6 - i * 0.1,
            zIndex: 50,
          }}
          initial={{
            left: `${data.from.x}%`,
            top: `${data.from.y}%`,
            scale: 0,
          }}
          animate={{
            left: [`${data.from.x}%`, `${midX}%`, `${data.to.x}%`],
            top: [`${data.from.y}%`, `${midY}%`, `${data.to.y}%`],
            scale: [0, 0.8, 0],
            opacity: [0, 0.6 - i * 0.1, 0],
          }}
          transition={{
            duration,
            delay: i * 0.08,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Task card */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ zIndex: 51 }}
        initial={{
          left: `${data.from.x}%`,
          top: `${data.from.y}%`,
          scale: 0.6,
          opacity: 0,
        }}
        animate={{
          left: [`${data.from.x}%`, `${midX}%`, `${data.to.x}%`],
          top: [`${data.from.y}%`, `${midY}%`, `${data.to.y}%`],
          scale: [0.6, 1, 0.8],
          opacity: [0, 1, 0],
        }}
        transition={{
          duration,
          ease: 'easeInOut',
        }}
        onAnimationComplete={() => onComplete(data.id)}
      >
        <div
          className="bg-white shadow-md rounded-xl px-2 py-1 whitespace-nowrap"
          style={{
            borderWidth: 1,
            borderColor: `${accentColor}40`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="text-[9px] font-medium text-text">
            {truncate(data.taskTitle, 30)}
          </span>
        </div>
      </motion.div>
    </>
  )
}
