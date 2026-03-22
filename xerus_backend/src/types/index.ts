import { Request } from 'express';
import type { UserRole } from '../domains/users/types';

export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email: string;
        name?: string;
        role?: UserRole;
    };
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    meta?: {
        request_id: string;
        trace_id: string;
        response_time_ms: number;
    };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}
