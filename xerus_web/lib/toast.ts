/**
 * Custom notification system using NotificationBanner design.
 * Drop-in replacement for Sonner's toast API.
 */

type NotificationType = 'info' | 'success' | 'warning' | 'error'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  description?: string
  duration?: number
  action?: ToastAction
}

export interface NotificationData {
  id: string
  type: NotificationType
  title: string
  message?: string
  autoCloseSeconds: number
  actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' }>
}

type Listener = (notification: NotificationData) => void

const listeners = new Set<Listener>()

let counter = 0

function show(type: NotificationType, title: string, opts?: ToastOptions) {
  const id = `notif-${++counter}-${Date.now()}`
  const autoCloseSeconds = opts?.duration
    ? Math.ceil(opts.duration / 1000)
    : type === 'error' ? 12 : type === 'warning' ? 10 : 6
  const actions = opts?.action
    ? [{ label: opts.action.label, onClick: opts.action.onClick, variant: 'primary' as const }]
    : undefined
  const notification: NotificationData = {
    id,
    type,
    title,
    message: opts?.description,
    autoCloseSeconds,
    actions,
  }
  listeners.forEach(fn => fn(notification))
}

function toastFn(title: string, opts?: ToastOptions) {
  show('warning', title, opts)
}

toastFn.info = (title: string, opts?: ToastOptions) => show('info', title, opts)
toastFn.success = (title: string, opts?: ToastOptions) => show('success', title, opts)
toastFn.warning = (title: string, opts?: ToastOptions) => show('warning', title, opts)
toastFn.error = (title: string, opts?: ToastOptions) => show('error', title, opts)
toastFn.subscribe = (fn: Listener) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const toast = toastFn
