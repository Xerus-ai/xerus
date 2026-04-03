// Conversation Helpers
// Tool icon resolution for rich history display.
// Dead Neon functions (createConversation, incrementMessageCount, resolveConversation)
// removed — pipeline uses workspace-db.service.ts equivalents.

// -----------------------------------------------------------------------------
// Tool Icon Resolution
// Maps tool names to persisted icon categories for rich history display.
// -----------------------------------------------------------------------------

export type PersistedToolIcon = 'read' | 'write' | 'search' | 'bash' | 'web' | 'think' | 'agent' | 'skill' | 'task' | 'question';

export function resolveToolIcon(name: string): PersistedToolIcon {
    const lowerName = name.toLowerCase();
    if (lowerName === 'agent' || lowerName === 'task') return 'agent';
    if (lowerName === 'skill') return 'skill';
    if (lowerName === 'todowrite') return 'task';
    if (lowerName === 'askuserquestion') return 'question';
    if (lowerName.includes('read') || lowerName.includes('glob') || lowerName.includes('grep')) return 'read';
    if (lowerName.includes('write') || lowerName.includes('edit') || lowerName.includes('notebook')) return 'write';
    if (lowerName.includes('bash') || lowerName.includes('exec') || lowerName.includes('command')) return 'bash';
    if (lowerName.includes('web') || lowerName.includes('fetch')) return 'web';
    if (lowerName.includes('search') || lowerName.includes('toolsearch')) return 'search';
    if (lowerName.includes('think') || lowerName.includes('plan') || lowerName.includes('reason')) return 'think';
    return 'search';
}
