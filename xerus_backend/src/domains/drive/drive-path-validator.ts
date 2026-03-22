// Drive Path Validator
// Shared validation for user-supplied workspace paths across drive route files.

import { BadRequestError } from '../../utils/errors';
import { validateWorkspacePath } from '../../utils/path-validation';
import { isHidden } from './editability';

export function validateDrivePath(filePath: string): string {
    const result = validateWorkspacePath(filePath);
    if (!result.valid) {
        const messages: Record<string, string> = {
            empty: 'File path is required',
            null_byte: 'Invalid file path',
            decode_failed: 'Invalid file path encoding',
            traversal: 'Path traversal not allowed',
        };
        throw new BadRequestError(messages[result.reason] ?? 'Invalid file path');
    }

    if (isHidden(result.normalized)) {
        throw new BadRequestError('File access denied: path is hidden');
    }

    return result.normalized;
}
