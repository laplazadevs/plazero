-- UP MIGRATION
-- Turno notifications tracking table

CREATE TABLE IF NOT EXISTS turno_notifications (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES corabastos_sessions(id) ON DELETE CASCADE,
    turno INTEGER NOT NULL,
    notification_date DATE NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, turno, notification_date)
);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_turno_notifications_session_turno ON turno_notifications(session_id, turno, notification_date);

-- DOWN MIGRATION
DROP INDEX IF EXISTS idx_turno_notifications_session_turno;
DROP TABLE IF EXISTS turno_notifications;
