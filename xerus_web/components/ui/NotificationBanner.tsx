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
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    accentColor: 'text-indigo-500',
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    accentColor: 'text-emerald-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    accentColor: 'text-amber-500',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    accentColor: 'text-red-500',
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
      setCountdown((prev) => {
        if (prev <= 1) {
          handleClose()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isVisible, autoCloseSeconds, handleClose])

  if (!isVisible) return null

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col items-center w-full max-w-[26rem] font-sans">
      {/* Main Card */}
      <div className="w-full bg-white/95 backdrop-blur-sm border border-surface-active/60 rounded-[18px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden transition-all duration-300 ease-out hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)]">
        <div className="flex items-center pl-3 pr-2 py-2.5 gap-3">
          {/* Icon - Left */}
          <div className={`shrink-0 w-7 h-7 rounded-full ${config.iconBg} flex items-center justify-center ring-4 ring-white`}>
            <Icon className={`w-3.5 h-3.5 ${config.iconColor}`} strokeWidth={2.5} />
          </div>

          {/* Content - Center */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <p className="text-sm font-semibold text-text leading-none">{title}</p>
            {message && (
              <p className="text-xs text-text-muted font-medium leading-tight mt-0.5">{message}</p>
            )}
          </div>

          {/* Actions & Close - Right */}
          <div className="flex items-center gap-2 shrink-0 pl-1">
            {actions && actions.length > 0 && (
              <div className="flex items-center gap-1.5">
                {actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={action.onClick}
                    className={`text-[0.7rem] font-semibold px-2.5 py-1 rounded-md transition-all duration-200 border ${
                      action.variant === 'primary'
                        ? 'bg-[#1a1a1a] text-white border-transparent hover:bg-black' 
                        : 'bg-white text-text border-surface-active hover:bg-surface-hover'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            {actions && actions.length > 0 && (
              <div className="w-px h-5 bg-surface-active" /> 
            )}

            {/* Circle Close Button */}
            <button
              onClick={handleClose}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface-hover/80 border border-transparent hover:border-surface-active transition-all"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Countdown - Outside the card */}
      {autoCloseSeconds && countdown > 0 && (
        <div className="mt-1.5 text-center animate-in fade-in slide-in-from-top-1 duration-300">
          <p className="text-[10px] text-text-secondary/70 font-medium tracking-wide">
            This message will automatically close in <span className="text-[#5A24E0] font-bold">{countdown} sec</span>
          </p>
        </div>
      )}
    </div>
  )
}
