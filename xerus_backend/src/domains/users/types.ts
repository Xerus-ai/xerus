// Users Domain Types
// Core types for user management, credits, and API keys

// ===== ENUMS & CONSTANTS =====

export type PlanType = 'free' | 'starter' | 'advanced' | 'prodigy';
export type UserRole = 'admin' | 'user';
export type ApiProvider = 'openrouter' | 'daytona' | 'anthropic' | 'openai';

export const PLAN_CREDITS: Record<PlanType, number> = {
    free: 0,
    starter: 2500,
    advanced: 10000,
    prodigy: 100000,
};

export const VALID_API_PROVIDERS: ApiProvider[] = ['openrouter', 'daytona', 'anthropic', 'openai'];

// ===== CORE ENTITIES =====

// User entity - matches actual database schema
// Note: user_id IS the Firebase UID (primary key)
export interface User {
    user_id: string; // Firebase UID - Primary Key
    email: string | null;
    display_name: string | null;
    role: UserRole;
    created_at: Date;
    updated_at: Date;
    last_login: Date | null;
    is_active: boolean;
    avatar_url: string | null;
    timezone: string | null;
    credits_available: number;
    credits_used: number;
    credits_reset_date: Date | null;
    plan_type: PlanType;
    platform_key_access: boolean;
}

export interface UserPreferences {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    notifications?: {
        email?: boolean;
        push?: boolean;
    };
    [key: string]: unknown;
}

// Credit balance view - derived from User
export interface CreditBalance {
    user_id: string;
    balance: number; // credits_available
    used: number; // credits_used
    plan_type: PlanType;
    reset_date: Date | null; // credits_reset_date
}

// User API key - matches actual database schema
export interface UserApiKey {
    id: number;
    user_id: string;
    provider: ApiProvider;
    api_key_encrypted: string;
    created_at: Date;
    updated_at: Date;
}

// ===== INPUT DTOs =====

export interface UserCreateInput {
    firebase_uid: string; // Will be stored as user_id
    email: string;
    display_name?: string | null;
    avatar_url?: string | null;
}

export interface UserUpdateInput {
    display_name?: string | null;
    avatar_url?: string | null;
    timezone?: string | null;
}

export interface CreditDeductInput {
    amount?: number;
    description?: string;
    reference_id?: string;
    reference_type?: string;
}

export interface ApiKeySetInput {
    provider: ApiProvider;
    api_key: string;
}

// ===== OUTPUT DTOs =====

export interface FindOrCreateResult {
    user: User;
    created: boolean;
    credit_balance: CreditBalance;
}

export interface DeleteUserResult {
    deleted: boolean;
    user_id: string;
    cleanup: {
        agents_deleted: number;
        api_keys_deleted: number;
    };
}

export interface ApiKeyStatus {
    provider: ApiProvider;
    is_set: boolean;
    key_hint: string | null;
}

export interface CreditHistoryPage {
    history: CreditHistoryEntry[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}

// Simple credit history entry for API response
// Note: No credit_history table exists, this is for future use
export interface CreditHistoryEntry {
    amount: number;
    operation: 'deduct' | 'reset' | 'add' | 'refund';
    description: string | null;
    timestamp: Date;
}

// ===== LIST OPTIONS =====

export interface CreditHistoryOptions {
    page?: number;
    limit?: number;
    operation?: CreditHistoryEntry['operation'];
    start_date?: Date;
    end_date?: Date;
}

// ===== DATABASE ROW TYPES =====

export interface UserRow {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role: string;
    created_at: Date;
    updated_at: Date;
    last_login: Date | null;
    is_active: boolean;
    avatar_url: string | null;
    timezone: string | null;
    credits_available: number;
    credits_used: number;
    credits_reset_date: Date | null;
    plan_type: string;
    platform_key_access: boolean;
}

export interface UserApiKeyRow {
    id: number;
    user_id: string;
    provider: string;
    api_key_encrypted: string;
    created_at: Date;
    updated_at: Date;
}
