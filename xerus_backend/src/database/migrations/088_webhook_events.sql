CREATE TABLE IF NOT EXISTS polar_webhook_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    polar_customer_id VARCHAR(255),
    polar_subscription_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polar_webhook_event_type ON polar_webhook_events(event_type);
