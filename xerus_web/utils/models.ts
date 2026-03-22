/**
 * Model display utilities
 * Shared formatting for AI model names across components
 */

/** Strip provider prefix and date suffixes for display */
export const formatModelName = (model: string): string => {
    const withoutProvider = model.includes('/') ? model.split('/')[1] : model
    return withoutProvider.replace(/-\d{8}$/, '')
}
