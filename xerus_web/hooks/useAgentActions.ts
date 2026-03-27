'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  cloneAgent,
  publishAgent,
  unpublishAgent,
  deleteAssistant,
} from '@/lib/api/agents'
import { slugify } from '@/utils/slugify'
import { toast } from '@/lib/toast'
import type { Assistant } from '@/lib/api/types'

interface UseAgentActionsArgs {
  agent: Assistant | null | undefined
  setAgent: (agent: Assistant) => void
}

function formatPublishError(errorMsg: string): { title: string; description: string } {
  if (errorMsg.includes('requirements not met')) {
    const hints: string[] = []
    if (errorMsg.includes('execution_count')) hints.push('run it at least 10 times')
    if (errorMsg.includes('success_rate')) hints.push('reach 80% success rate')
    if (errorMsg.includes('system_prompt')) hints.push('add a detailed prompt (100+ characters)')
    if (errorMsg.includes('description')) hints.push('add a public description')
    if (errorMsg.includes('tag')) hints.push('add at least one tag')

    return {
      title: 'Not ready to publish yet',
      description: hints.length > 0
        ? `To publish, ${hints.join(', ')}.`
        : 'Your agent needs more usage before it can be published.',
    }
  }
  if (errorMsg.includes('already public')) {
    return { title: 'Already published', description: 'This agent is already in the marketplace.' }
  }
  return { title: "Couldn't publish", description: 'Something went wrong. Please try again.' }
}

export function useAgentActions({ agent, setAgent }: UseAgentActionsArgs) {
  const router = useRouter()
  const [isCloning, setIsCloning] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleClone = useCallback(async () => {
    if (!agent?.id) return
    setIsCloning(true)
    try {
      const identifier = agent.slug || agent.id
      const result = await cloneAgent(identifier)
      if (result.success && result.agent) {
        router.push(`/ai-agents/${result.agent.id}/${slugify(result.agent.name || '')}`)
      }
    } catch (error) {
      console.error('Failed to clone agent:', error)
      toast.error("Couldn't copy this agent", { description: 'Please try again in a moment.' })
    } finally {
      setIsCloning(false)
    }
  }, [agent?.id, agent?.slug, router])

  const handlePublish = useCallback(async () => {
    if (!agent?.id) return
    setIsPublishing(true)
    try {
      const updatedAgent = await publishAgent(agent.id)
      toast.success('Published to marketplace', {
        description: 'Your agent is now available for others to discover.',
      })
      setAgent({ ...agent, ...updatedAgent })
    } catch (error: unknown) {
      console.error('Failed to publish agent:', error)
      const friendly = formatPublishError(error instanceof Error ? error.message : String(error))
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setIsPublishing(false)
    }
  }, [agent, setAgent])

  const handleUnpublish = useCallback(async () => {
    if (!agent?.id) return
    setIsPublishing(true)
    try {
      const updatedAgent = await unpublishAgent(agent.id)
      toast.success('Removed from marketplace', {
        description: 'Your agent is now private. Only you can access it.',
      })
      setAgent({ ...agent, ...updatedAgent })
    } catch (error: unknown) {
      console.error('Failed to unpublish agent:', error)
      toast.error("Couldn't unpublish", { description: 'Something went wrong. Please try again.' })
    } finally {
      setIsPublishing(false)
    }
  }, [agent, setAgent])

  const handleDelete = useCallback(async () => {
    if (!agent?.id) return
    toast('This agent will be permanently removed.', {
      action: {
        label: 'Yes, delete',
        onClick: async () => {
          setIsDeleting(true)
          try {
            await deleteAssistant(Number(agent.id))
            toast.success('Agent deleted', { description: 'This agent has been permanently removed.' })
            router.push('/ai-agents')
          } catch (error) {
            console.error('Failed to delete agent:', error)
            toast.error("Couldn't delete this agent", { description: 'Please try again.' })
            setIsDeleting(false)
          }
        },
      },
    })
  }, [agent?.id, router])

  return {
    isCloning,
    isPublishing,
    isDeleting,
    handleClone,
    handlePublish,
    handleUnpublish,
    handleDelete,
  }
}
