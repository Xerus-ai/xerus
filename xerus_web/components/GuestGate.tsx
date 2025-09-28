'use client'

// Guest permission restrictions removed - unified permissions system
// All users (guest and authenticated) now have the same permissions

interface GuestGateProps {
  children: React.ReactNode
  feature?: string
  description?: string
  allowedFeatures?: string[]
  fallback?: React.ReactNode
  requireAuth?: boolean
}

export default function GuestGate({
  children
}: GuestGateProps) {
  // Guest restrictions removed - always show children
  return <>{children}</>
}
