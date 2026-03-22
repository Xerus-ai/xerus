// External Service Error
// Error class for external API communication failures

import { AppError } from '../../utils/errors';

export class ExternalServiceError extends AppError {
    constructor(service: string, message: string, statusCode = 503) {
        super(`${service}: ${message}`, statusCode, 'EXTERNAL_SERVICE_ERROR');
    }
}
