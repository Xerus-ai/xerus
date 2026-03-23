import AIAgentDetailClient from "../client"
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function AIAgentDetailPage({ params }: { params: { id: string; slug?: string[] } }) {
  return (
    <ErrorBoundary label="Agent Editor">
      <AIAgentDetailClient agentId={params.id} />
    </ErrorBoundary>
  )
}
