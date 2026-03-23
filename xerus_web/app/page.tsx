'use client'

import { OfficeDashboard } from '@/components/office/OfficeDashboard'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function Home() {
  return (
    <ErrorBoundary label="Dashboard">
      <OfficeDashboard />
    </ErrorBoundary>
  )
}
