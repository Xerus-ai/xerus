'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'

type NotificationType = 'info' | 'success' | 'warning' | 'error'

interface NotificationAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

interface NotificationBannerProps {
  type?: NotificationType
  title: string
  message?: string
  actions?: NotificationAction[]
  autoCloseSeconds?: number
  onClose?: () => void
  show: boolean
}

const typeConfig = {
  info: {
    icon: Info,
    iconColor: 'text-secondary',
    iconBg: 'bg-secondary/10',
    ringColor: 'ring-secondary/20',
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-success',
    iconBg: 'bg-success/10',
    ringColor: 'ring-success/20',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    iconBg: 'bg-warning/10',
    ringColor: 'ring-warning/20',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-destructive',
    iconBg: 'bg-destructive/10',
    ringColor: 'ring-destructive/20',
  },
}

export function NotificationBanner({
  type = 'info',
  title,
  message,
  actions,
  autoCloseSeconds,
  onClose,
  show,
}: NotificationBannerProps) {
  const [countdown, setCountdown] = useState(autoCloseSeconds || 0)
  const [isVisible, setIsVisible] = useState(show)

  const config = typeConfig[type]
  const Icon = config.icon

  const handleClose = useCallback(() => {
    setIsVisible(false)
    onClose?.()
  }, [onClose])

  useEffect(() => {
    setIsVisible(show)
    if (show && autoCloseSeconds) {
      setCountdown(autoCloseSeconds)
    }
  }, [show, autoCloseSeconds])

  useEffect(() => {
    if (!isVisible || !autoCloseSeconds) return

    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [isVisible, autoCloseSeconds])

  useEffect(() => {
    if (countdown === 0 && isVisible && autoCloseSeconds) {
      handleClose()
    }
  }, [countdown, isVisible, autoCloseSeconds, handleClose])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-center w-full max-w-[23rem] font-sans animate-slide-in-top">
      {/* Main Card */}
      <div className="w-full bg-card border border-border rounded-2xl shadow-lg overflow-hidden transition-all duration-200">
        <div className="flex items-center pl-3 pr-2 py-2 gap-2">
          {/* Icon */}
          <div className={`shrink-0 w-6 h-6 rounded-full ${config.iconBg} flex items-center justify-center ring-2 ${config.ringColor}`}>
            <Icon className={`w-3 h-3 ${config.iconColor}`} strokeWidth={2.5} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-[12px] font-semibold text-text leading-tight">{title}</p>
            {message && (
              <p className="text-[10px] text-text-secondary font-normal leading-snug mt-0.5">{message}</p>
            )}
          </div>

          {/* Actions & Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {actions && actions.length > 0 && (
              <div className="flex items-center gap-1.5">
                {actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={action.onClick}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-card text-text border border-border hover:bg-surface-hover transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-text-muted hover:text-text transition-colors"
              aria-label="Close notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Countdown */}
      {autoCloseSeconds && countdown > 0 && (
        <div className="mt-2 text-center animate-in fade-in slide-in-from-top-1 duration-300">
          <p className="text-[9px] text-text-muted font-medium tracking-wide">
            This message will automatically close in <span className="text-primary font-bold">{countdown} sec</span>
          </p>
        </div>
      )}
    </div>
  )
}
