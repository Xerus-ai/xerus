'use client'

import { useState } from 'react'
import { ConversationSidebar } from './ConversationSidebar'
import type { ProjectGroup, SelectedChannel } from './types'

export interface SidebarPropsRef {
  projects: ProjectGroup[]
  conversationId: string | null
  selectedChannel?: SelectedChannel | null
  isLoading: boolean
  hasMore: boolean
  isLoadingMore: boolean
  handleSelectConversation: (id: string) => void
  handleNewConversation: () => void
  handleDeleteConversation: (id: string) => void
  handleRenameConversation: (id: string, newTitle: string) => void
  handleSelectChannel: (ch: SelectedChannel) => void
  handleClearChannel: () => void
  handleLoadMore: () => void
}

export function ChatSidebarSlotComponent({ propsRef, forceUpdateRef }: {
  propsRef: React.RefObject<SidebarPropsRef>
  forceUpdateRef: React.MutableRefObject<() => void>
}) {
  const [, setTick] = useState(0)
  forceUpdateRef.current = () => setTick((t) => t + 1)
  const p = propsRef.current!
  return (
    <ConversationSidebar
      projects={p.projects}
      currentConversationId={p.conversationId}
      onSelectConversation={p.handleSelectConversation}
      onNewConversation={p.handleNewConversation}
      onDeleteConversation={p.handleDeleteConversation}
      onRenameConversation={p.handleRenameConversation}
      isCollapsed={false}
      isLoading={p.isLoading}
      selectedChannel={p.selectedChannel}
      onSelectChannel={p.handleSelectChannel}
      onClearChannel={p.handleClearChannel}
      hasMore={p.hasMore}
      isLoadingMore={p.isLoadingMore}
      onLoadMore={p.handleLoadMore}
    />
  )
}
