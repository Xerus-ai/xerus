'use client'

import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-[520px] h-[680px] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        <iframe
          ref={iframeRef}
          src={checkoutUrl}
          className="w-full h-full border-0"
          allow="payment"
          title="Checkout"
        />
      </motion.div>
    </motion.div>
  )
}
