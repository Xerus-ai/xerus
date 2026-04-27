'use client'

import { useCallback, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'

interface PolarCheckoutOverlayProps {
  checkoutUrl: string
  onSuccess: () => void
  onCancel: () => void
}

/**
 * Opens the Polar checkout in an iframe overlay.
 * Listens for postMessage events from the checkout to detect completion.
 */
export function PolarCheckoutOverlay({
  checkoutUrl,
  onSuccess,
  onCancel,
}: PolarCheckoutOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Polar sends a postMessage on checkout completion
      if (
        event.data &&
        typeof event.data === 'object' &&
        (event.data.type === 'polar:checkout:success' ||
          event.data.type === 'polar:checkout:confirmed' ||
          event.data.status === 'success')
      ) {
        onSuccess()
      }
    },
    [onSuccess],
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Focus the close button on mount
    closeRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel()
        return
      }

      if (e.key === 'Tab') {
        const focusable = [closeRef.current, iframeRef.current].filter(
          Boolean,
        ) as HTMLElement[]
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onCancel])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={shouldReduceMotion ? { scale: 1, opacity: 0 } : { scale: 0.95, opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-[520px] h-[680px] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Close button */}
        <button
          ref={closeRef}
          onClick={onCancel}
          aria-label="Close checkout"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        <iframe
          ref={iframeRef}
          tabIndex={0}
          src={checkoutUrl}
          className="w-full h-full border-0"
          allow="payment"
          title="Checkout"
        />
      </motion.div>
    </motion.div>
  )
}
