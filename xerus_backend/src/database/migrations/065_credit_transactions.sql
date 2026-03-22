-- Migration 065: Credit Transactions Audit Table
-- Records all credit operations for audit trail and history

CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    reason TEXT,
    session_id VARCHAR(255),
    balance_after INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT credit_transactions_operation_type_check
        CHECK (operation_type IN ('deduct', 'add', 'refund', 'reset'))
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
    ON credit_transactions(user_id, created_at DESC);

COMMENT ON TABLE credit_transactions IS 'Audit trail for all credit operations (deduct, add, refund, reset)';
COMMENT ON COLUMN credit_transactions.amount IS 'Credits changed (negative for deductions, positive for additions)';
COMMENT ON COLUMN credit_transactions.operation_type IS 'deduct, add, refund, or reset';
COMMENT ON COLUMN credit_transactions.balance_after IS 'User credit balance after this operation';
COMMENT ON COLUMN credit_transactions.session_id IS 'Execution session that triggered the deduction (nullable)';
