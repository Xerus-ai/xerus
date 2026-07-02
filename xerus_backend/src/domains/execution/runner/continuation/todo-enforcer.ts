// Todo Enforcer — checks tracked todos for genuinely unfinished work.
// Todos are authoritative over the model's prose.

export interface TrackedTodo {
    text: string;
    done: boolean;
}

const BLOCKED_KEYWORDS = [
    'blocked', 'waiting', 'pending approval', 'need credentials',
    'requires access', 'api key', 'permission denied', 'cannot proceed',
];

function isTodoBlocked(todo: TrackedTodo): boolean {
    const lower = todo.text.toLowerCase();
    return BLOCKED_KEYWORDS.some(kw => lower.includes(kw));
}

export interface TodoEnforcerResult {
    hasUnfinishedWork: boolean;
    openCount: number;
    blockedCount: number;
    actionableCount: number;
    summary: string;
}

export function enforceTodos(todos: TrackedTodo[]): TodoEnforcerResult {
    const open = todos.filter(t => !t.done);
    const blocked = open.filter(isTodoBlocked);
    const actionable = open.filter(t => !isTodoBlocked(t));

    if (actionable.length === 0) {
        return {
            hasUnfinishedWork: false,
            openCount: open.length,
            blockedCount: blocked.length,
            actionableCount: 0,
            summary: blocked.length > 0
                ? `${blocked.length} todo(s) blocked on external dependencies`
                : 'All todos completed',
        };
    }

    const todoList = actionable
        .slice(0, 5)
        .map(t => `- ${t.text}`)
        .join('\n');

    return {
        hasUnfinishedWork: true,
        openCount: open.length,
        blockedCount: blocked.length,
        actionableCount: actionable.length,
        summary: `${actionable.length} actionable todo(s) remain:\n${todoList}`,
    };
}
