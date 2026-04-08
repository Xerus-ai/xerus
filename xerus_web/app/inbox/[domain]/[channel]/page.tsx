'use client'

import { useParams } from 'next/navigation'
import { useDomains } from '@/hooks/useDomains'
import { useChannelAgents } from '@/hooks/useChannelAgents'
import { ChannelHeader } from '@/components/channels/ChannelHeader'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

function ChannelPageInner() {
  const params = useParams<{ domain: string; channel: string }>()
  const { domains, isLoading, refetch: refreshDomains } = useDomains()

  const domain = domains.find(d => d.slug === params.domain)
  const channel = domain?.channels.find(ch => ch.slug === params.channel)

  // channel.id is the DB slug (e.g. "marketing--general"), used for all API calls
  const channelDbSlug = channel?.id ?? ''
  const {
    agents: channelAgents,
    allAgents,
    assignAgent,
    unassignAgent,
  } = useChannelAgents(channelDbSlug)

  if (isLoading) {
    return (
      <main className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">Loading channel...</p>
      </main>
    )
  }

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
        channelSlug={channelDbSlug}
        channelName={channel.name}
        channelDescription={channel.description ?? ''}
        channelAgents={channelAgents}
        allAgents={allAgents}
        onAssignAgent={assignAgent}
        onUnassignAgent={unassignAgent}
        onChannelUpdated={refreshDomains}
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
