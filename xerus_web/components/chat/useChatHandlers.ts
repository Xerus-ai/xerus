import { useCallback, useRef } from 'react'
import { toast } from '@/lib/toast'
import { getSharedPipedreamClient } from '@/lib/pipedream-client'
import { respondToGuidance } from '@/lib/api/execute'
import type { ChatAction } from './chatReducer'
import type { ChatState } from './types'

interface UseChatHandlersInput {
  state: ChatState
  dispatch: (action: ChatAction) => void
  handleDismissToolAuth: () => void
}

export function useChatHandlers({ state, dispatch, handleDismissToolAuth }: UseChatHandlersInput) {
  const handleToolAuthConnect = useCallback((appSlug: string) => {
    try {
      const pipedreamClient = getSharedPipedreamClient()
      pipedreamClient.connectAccount({
        app: appSlug,
        onSuccess: () => {
          handleDismissToolAuth()
          toast.success('App connected', { description: 'Your agent can now use this app.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
        onError: () => {
          toast.error("Connection failed", { description: 'Please close and try again.' })
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
        onClose: () => {
          document.querySelectorAll('iframe[id^="pipedream-connect-iframe-"]').forEach((el) => el.remove())
        },
      })
    } catch {
      toast.error("Couldn't connect the app", { description: 'Please try again or check your permissions.' })
    }
  }, [handleDismissToolAuth])

  const guidanceSubmittingRef = useRef(false)
  const handleGuidanceRespond = useCallback(async (accepted: boolean, feedback?: string) => {
    if (guidanceSubmittingRef.current) return
    const guidance = state.pendingGuidance
    if (!guidance) return
    guidanceSubmittingRef.current = true
    try {
      await respondToGuidance(guidance.execution_id, {
        guidance_id: guidance.pause_id,
        accepted,
        response_value: feedback,
      })
      dispatch({ type: 'SET_PENDING_GUIDANCE', pendingGuidance: null })
    } catch {
      toast.error("Your response wasn't sent", { description: 'The agent may have moved on. Try sending a new message.' })
    } finally {
      guidanceSubmittingRef.current = false
    }
  }, [state.pendingGuidance, dispatch])

  return { handleToolAuthConnect, handleGuidanceRespond }
}
