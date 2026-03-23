'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChatContainer } from '@/components/chat/ChatContainer'
import { XerusLoader } from '@/components/common/XerusLoader'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

function ChatPageInner() {
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

export default function ChatPage() {
    return (
        <ErrorBoundary label="Chat">
            <Suspense fallback={<XerusLoader variant="inline" className="h-screen bg-surface" />}>
                <ChatPageInner />
            </Suspense>
        </ErrorBoundary>
    )
}
