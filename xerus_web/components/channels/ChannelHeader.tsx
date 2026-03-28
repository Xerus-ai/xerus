'use client'

import { PresenceAvatars } from '@/components/common/PresenceAvatars'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ChannelActivity } from './ChannelActivity'
import { ChannelTasks } from './ChannelTasks'
import { ChannelDeliverables } from './ChannelDeliverables'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelAgent {
  id: string
  name: string
  slug: string
  avatar_url?: string
  status: 'active' | 'idle' | 'sleeping' | 'error'
}

interface ChannelHeaderProps {
  channelId: string
  channelName: string
  channelDescription: string
  channelAgents: ChannelAgent[]
  className?: string
}

// ---------------------------------------------------------------------------
// Tab styling
// ---------------------------------------------------------------------------

const TAB_LIST_CLASSES =
  'mb-8 bg-surface p-[0.325rem] rounded-full inline-flex h-auto w-auto border-none'

const TAB_TRIGGER_CLASSES = cn(
  'rounded-full px-6 py-2.5 text-sm font-medium transition-all',
  'data-[state=active]:bg-text data-[state=active]:text-white data-[state=active]:shadow-sm',
  'text-text-secondary hover:text-text'
)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelHeader({
  channelId,
  channelName,
  channelDescription,
  channelAgents,
  className,
}: ChannelHeaderProps) {
  const onlineCount = channelAgents.filter((a) => a.status === 'active').length

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header section */}
      <div className="flex-shrink-0 pb-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-semibold text-text truncate">
              # {channelName}
            </h1>
            {channelDescription && (
              <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                {channelDescription}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <PresenceAvatars
              agents={channelAgents}
              size="md"
              maxVisible={5}
              showStatus
            />
            {channelAgents.length > 0 && (
              <span className="text-xs text-text-muted whitespace-nowrap">
                {onlineCount} online
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs section */}
      <Tabs defaultValue="activity" className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0">
          <TabsList className={TAB_LIST_CLASSES} aria-label="Channel views">
            <TabsTrigger value="tasks" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-tasks">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="activity" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-activity">
              Activity
            </TabsTrigger>
            <TabsTrigger value="deliverables" className={TAB_TRIGGER_CLASSES} data-testid="channel-tab-deliverables">
              Deliverables
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks" className="flex-1 min-h-0 mt-0">
          <ChannelTasks channelId={channelId} className="h-full" />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
          <ChannelActivity channelId={channelId} className="h-full" />
        </TabsContent>

        <TabsContent value="deliverables" className="flex-1 min-h-0 mt-0">
          <ChannelDeliverables channelId={channelId} className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
