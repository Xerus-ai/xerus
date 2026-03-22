// Shell Safety Utilities
// Centralized shell escaping for safe command construction

/**
 * Escape a string for safe use as a shell argument.
 * Rejects control characters, then wraps in single quotes with proper escaping.
 * Optional label customizes the error message (e.g., 'path', 'git ref').
 */
export function shellEscape(arg: string, label = 'shell argument'): string {
    if (/[\n\r\t\0]/.test(arg)) {
        throw new Error(`Invalid ${label}: contains control characters: ${arg.replace(/[\n\r\t\0]/g, '?')}`);
    }
    return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Escape a file path for safe use in shell commands.
 * Delegates to shellEscape with path-specific error messaging.
 */
export function shellEscapePath(p: string): string {
    return shellEscape(p, 'path');
}
