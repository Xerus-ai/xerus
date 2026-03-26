'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast, type NotificationData } from '@/lib/toast'
import { NotificationBanner } from './NotificationBanner'

export function NotificationProvider() {
  const [notification, setNotification] = useState<NotificationData | null>(null)

  useEffect(() => {
    return toast.subscribe((n) => {
      setNotification(n)
    })
  }, [])

  const handleClose = useCallback(() => {
    setNotification(null)
  }, [])

  if (!notification) return null

  return (
    <NotificationBanner
      key={notification.id}
      type={notification.type}
      title={notification.title}
      message={notification.message}
      actions={notification.actions}
      autoCloseSeconds={notification.autoCloseSeconds}
      onClose={handleClose}
      show={true}
    />
  )
}
