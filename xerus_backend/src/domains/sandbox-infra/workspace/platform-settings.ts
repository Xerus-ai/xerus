// Platform Settings
// Canonical hooks and permissions for .claude/settings.json.
// These are platform-defined (not user data) and must survive S3 snapshot restore.
// Source of truth: xerus-workspace/.claude/settings.json template.

function hook(command: string) {
    return { type: 'command' as const, command: `bash .claude/hooks/scripts/${command}` };
}

export const PLATFORM_HOOKS = {
    SessionStart: [{ hooks: [hook('session-start.sh')] }],
    UserPromptSubmit: [{ hooks: [hook('user-prompt-submit.sh')] }],
    PreToolUse: [{ matcher: '', hooks: [hook('pre-tool-use.sh')] }],
    PostToolUse: [{
        matcher: '',
        hooks: [
            hook('post-tool-use.sh'),
            hook('post-tool-use-tracker.sh'),
            hook('workspace-sync-hook.sh'),
        ],
    }],
    PreCompact: [{ hooks: [hook('pre-compact.sh')] }],
    SessionEnd: [{ hooks: [hook('session-end.sh'), hook('data-integrity-check.sh')] }],
    Stop: [{ hooks: [hook('stop.sh')] }],
    SubagentStop: [{ hooks: [hook('subagent-stop.sh')] }],
    Notification: [{ hooks: [hook('notification.sh')] }],
    TeammateIdle: [{ hooks: [hook('teammate-idle.sh')] }],
    TaskCompleted: [{ hooks: [hook('task-completed.sh')] }],
};

export const PLATFORM_PERMISSIONS = {
    allow: [
        'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
        'Agent', 'Skill', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
        'SendMessage', 'TeamCreate',
    ],
};
