import AIAgentDetailClient from "../client"

export default function AIAgentDetailPage({ params }: { params: { id: string; slug?: string[] } }) {
  // ID is the source of truth, slug is cosmetic (ignored)
  return <AIAgentDetailClient agentId={params.id} />
}
