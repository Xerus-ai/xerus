'use client'

import { useState, useCallback } from 'react'
import type { FlyingTaskData } from '@/components/office/office-types'

const MAX_CONCURRENT = 2

export function useAnimationQueue() {
  const [queue, setQueue] = useState<FlyingTaskData[]>([])
  const [active, setActive] = useState<FlyingTaskData[]>([])

  const enqueue = useCallback((task: FlyingTaskData) => {
    setActive(prev => {
      if (prev.length < MAX_CONCURRENT) {
        return [...prev, task]
      }
      setQueue(q => [...q, task])
      return prev
    })
  }, [])

  const dequeue = useCallback((id: string) => {
    setActive(prev => {
      const next = prev.filter(t => t.id !== id)
      // Promote from queue if space available
      setQueue(q => {
        if (q.length > 0 && next.length < MAX_CONCURRENT) {
          const [promoted, ...rest] = q
          next.push(promoted)
          return rest
        }
        return q
      })
      return next
    })
  }, [])

  return { active, enqueue, dequeue }
}
