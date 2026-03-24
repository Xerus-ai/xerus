// Invite Codes Domain Types
// Access gating with single-use invite codes

// ===== CORE ENTITIES =====

export interface InviteCode {
    id: number;
    code: string;
    created_by: string;
    used_by: string | null;
    used_at: Date | null;
    expires_at: Date | null;
    is_used: boolean;
    created_at: Date;
}

// ===== INPUT DTOs =====

export interface GenerateCodesInput {
    count: number;
    expires_at?: Date | null;
}

export interface RedeemCodeInput {
    code: string;
    user_id: string;
}

// ===== OUTPUT DTOs =====

export interface RedeemResult {
    activated: boolean;
    code: InviteCode;
}

export interface GenerateResult {
    codes: string[];
    expires_at: Date | null;
}

export interface InviteCodeListResult {
    codes: InviteCode[];
    total: number;
}

// ===== DATABASE ROW TYPES =====

export interface InviteCodeRow {
    id: number;
    code: string;
    created_by: string;
    used_by: string | null;
    used_at: Date | null;
    expires_at: Date | null;
    is_used: boolean;
    created_at: Date;
}
