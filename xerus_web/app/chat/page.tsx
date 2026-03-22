'use client'

import { useSearchParams } from 'next/navigation'
import { ChatContainer } from '@/components/chat/ChatContainer'

export default function ChatPage() {
    const searchParams = useSearchParams()
    const initialMessage = searchParams.get('q') || undefined
    const agentId = searchParams.get('agent') || undefined

    return (
        <ChatContainer
            initialMessage={initialMessage}
            initialAgentId={agentId}
        />
    )
}
