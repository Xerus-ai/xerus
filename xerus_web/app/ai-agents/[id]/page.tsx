import { sampleAssistants } from "@/lib/sample-assistants"
import AIAgentDetailClient from "./client"

// Generate static params for known assistants
export async function generateStaticParams() {
  // Include both sample assistants and database agent IDs
  const knownAgents = [
    ...sampleAssistants.map((assistant) => ({ id: assistant.id })),
    // Database agent IDs (numeric) - Extended range to cover new agents
    { id: '1' }, // Assistant
    { id: '2' }, // Technical Expert  
    { id: '3' }, // Creative Assistant
    { id: '4' }, // Tutor
    { id: '5' }, // Executive Assistant
    { id: '6' }, // Research Assistant
    { id: '7' }, // Demo Tutorial Agent
    { id: '8' }, // Customer Support Agent
    { id: '9' }, // Additional Agent
    { id: '10' }, // RAG Test Agent
    { id: '11' }, // Additional Agent
    { id: '12' }, // Additional Agent
    { id: '13' }, // Additional Agent
    { id: '14' }, // Additional Agent
    { id: '15' }, // Additional Agent
    { id: '16' }, // Additional Agent
    { id: '17' }, // Additional Agent
    { id: '18' }, // Additional Agent
    { id: '19' }, // Additional Agent
    { id: '20' }, // Additional Agent
    // Legacy string IDs for compatibility
    { id: 'assistant' },
    { id: 'technical_expert' },
    { id: 'creative_assistant' },
    { id: 'tutor' },
    { id: 'executive_assistant' },
    { id: 'research_assistant' },
    { id: 'Demo-tutorial-agent' },
    { id: 'School' },
    { id: 'Meetings' },
    { id: 'Sales' },
    { id: 'Recruiting' },
    { id: 'Customer Support' }
  ];
  
  return knownAgents;
}

export default function AIAgentDetailPage({ params }: { params: { id: string } }) {
  return <AIAgentDetailClient params={params} />
} 