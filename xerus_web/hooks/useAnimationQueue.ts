'use client'

import { useCallback, useRef, useState } from 'react'
import type { FlyingTaskData } from '@/components/office/office-types'

const MAX_CONCURRENT = 2

interface AnimationState {
  queue: FlyingTaskData[]
  active: FlyingTaskData[]
}

export function useAnimationQueue() {
  const [state, setState] = useState<AnimationState>({ queue: [], active: [] })

  const enqueue = useCallback((task: FlyingTaskData) => {
    setState(prev => {
      if (prev.active.length < MAX_CONCURRENT) {
        return { ...prev, active: [...prev.active, task] }
      }
      return { ...prev, queue: [...prev.queue, task] }
    })
  }, [])

  const dequeue = useCallback((id: string) => {
    setState(prev => {
      const remaining = prev.active.filter(t => t.id !== id)
      const promoted: FlyingTaskData[] = []
      let newQueue = prev.queue

      // Promote from queue to fill available slots
      while (remaining.length + promoted.length < MAX_CONCURRENT && newQueue.length > 0) {
        const [next, ...rest] = newQueue
        promoted.push(next)
        newQueue = rest
      }

      return {
        queue: newQueue,
        active: [...remaining, ...promoted],
      }
    })
  }, [])

  return { active: state.active, enqueue, dequeue }
}
