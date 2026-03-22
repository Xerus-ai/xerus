'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  cloneAgent,
  publishAgent,
  unpublishAgent,
  deleteAssistant,
} from '@/lib/api'
import { slugify } from '@/utils/slugify'
import { toast } from 'sonner'

interface NotificationState {
  show: boolean
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
}

interface UseAgentActionsArgs {
  agent: any
  setAgent: (agent: any) => void
}

function formatPublishError(errorMsg: string): { title: string; message: string } {
  if (errorMsg.includes('requirements not met')) {
    const hints: string[] = []
    if (errorMsg.includes('execution_count')) hints.push('run it at least 10 times')
    if (errorMsg.includes('success_rate')) hints.push('reach 80% success rate')
    if (errorMsg.includes('system_prompt')) hints.push('add a detailed prompt (100+ characters)')
    if (errorMsg.includes('description')) hints.push('add a public description')
    if (errorMsg.includes('tag')) hints.push('add at least one tag')

    return {
      title: 'Not ready to publish yet',
      message: hints.length > 0
        ? `To publish, ${hints.join(', ')}.`
        : 'Your agent needs more usage before it can be published.',
    }
  }
  if (errorMsg.includes('already public')) {
    return { title: 'Already published', message: 'This agent is already in the marketplace.' }
  }
  return { title: 'Could not publish', message: 'Something went wrong. Please try again.' }
}

export function useAgentActions({ agent, setAgent }: UseAgentActionsArgs) {
  const router = useRouter()
  const [isCloning, setIsCloning] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<NotificationState>({
    show: false, type: 'info', title: '',
  })

  const handleClone = useCallback(async () => {
    if (!agent?.id) return
    setIsCloning(true)
    try {
      // Use slug for marketplace agents (id is synthetic -1), numeric id for user agents
      const identifier = agent.slug || agent.id
      const result = await cloneAgent(identifier)
      if (result.success && result.agent) {
        router.push(`/ai-agents/${result.agent.id}/${slugify(result.agent.name || '')}`)
      }
    } catch (error) {
      console.error('Failed to clone agent:', error)
    } finally {
      setIsCloning(false)
    }
  }, [agent?.id, agent?.slug, router])

  const handlePublish = useCallback(async () => {
    if (!agent?.id) return
    setIsPublishing(true)
    try {
      const updatedAgent = await publishAgent(agent.id)
      setNotification({
        show: true,
        type: 'success',
        title: 'Published to marketplace',
        message: 'Your agent is now available for others to discover and clone.',
      })
      setAgent({ ...agent, ...updatedAgent })
    } catch (error: any) {
      console.error('Failed to publish agent:', error)
      const friendly = formatPublishError(error?.message || '')
      setNotification({ show: true, type: 'error', ...friendly })
    } finally {
      setIsPublishing(false)
    }
  }, [agent, setAgent])

  const handleUnpublish = useCallback(async () => {
    if (!agent?.id) return
    setIsPublishing(true)
    try {
      const updatedAgent = await unpublishAgent(agent.id)
      setNotification({
        show: true,
        type: 'success',
        title: 'Removed from marketplace',
        message: 'Your agent is now private. Only you can access it.',
      })
      setAgent({ ...agent, ...updatedAgent })
    } catch (error: any) {
      console.error('Failed to unpublish agent:', error)
      setNotification({
        show: true,
        type: 'error',
        title: 'Could not unpublish',
        message: 'Something went wrong. Please try again.',
      })
    } finally {
      setIsPublishing(false)
    }
  }, [agent, setAgent])

  const handleDelete = useCallback(async () => {
    if (!agent?.id) return
    toast('Delete this agent?', {
      action: {
        label: 'Confirm Delete',
        onClick: async () => {
          setIsDeleting(true)
          try {
            await deleteAssistant(parseInt(agent.id))
            toast.success('Agent deleted')
            router.push('/ai-agents')
          } catch (error) {
            console.error('Failed to delete agent:', error)
            toast.error('Failed to delete agent')
            setIsDeleting(false)
          }
        },
      },
    })
  }, [agent?.id, router])

  const dismissNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, show: false }))
  }, [])

  return {
    isCloning,
    isPublishing,
    isDeleting,
    notification,
    handleClone,
    handlePublish,
    handleUnpublish,
    handleDelete,
    dismissNotification,
  }
}
