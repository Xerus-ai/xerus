// Credit Protocol Types
// Shared types for the credit check/response protocol between runner and backend.
// Extracted to break circular dependency: credits <-> execution.
//
// These types define the JSON messages exchanged via stdin/stdout between
// the backend credit service and the runner process inside the sandbox.

// -----------------------------------------------------------------------------
// Inbound Command (Backend -> Runner via stdin)
// -----------------------------------------------------------------------------

export interface CreditResponseCommand {
    cmd: 'credit_response';
    agent: string;
    approved: boolean;
    reserved_credits?: number;
    balance_remaining: number;
    reason?: string;
}

// -----------------------------------------------------------------------------
// Outbound Events (Runner -> Backend via stdout)
// -----------------------------------------------------------------------------

export interface CreditCheckEvent {
    event: 'credit_check';
    agent: string;
    estimated_tokens: number;
    trigger: 'execute' | 'heartbeat' | 'message';
    session_id?: string;
    timestamp?: string;
}

export interface SessionEndedEvent {
    event: 'session_ended';
    agent: string;
    session_id: string;
    reason: 'complete' | 'error' | 'interrupt' | 'done';
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
    timestamp?: string;
}
