'use client'

import { useParams } from 'next/navigation'
import { useDomains } from '@/hooks/useDomains'
import { ChannelHeader } from '@/components/channels/ChannelHeader'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

function ChannelPageInner() {
  const params = useParams<{ domain: string; channel: string }>()
  const { domains, isLoading } = useDomains()

  if (isLoading) {
    return (
      <main className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Loading channel...</p>
      </main>
    )
  }

  const domain = domains.find(d => d.slug === params.domain)
  const channel = domain?.channels.find(ch => ch.slug === params.channel)

  if (!domain || !channel) {
    return (
      <main className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Channel not found</p>
      </main>
    )
  }

  return (
    <main className="flex flex-col h-full px-4 sm:px-6 lg:px-8 py-6">
      <ChannelHeader
        channelId={channel.id}
        channelName={channel.name}
        channelDescription={channel.description ?? ''}
        channelAgents={[]}
      />
    </main>
  )
}

export default function ChannelPage() {
  return (
    <ErrorBoundary label="Channel">
      <ChannelPageInner />
    </ErrorBoundary>
  )
}
