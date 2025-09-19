-- UP MIGRATION
-- Corabastos feature database schema

-- Corabastos sessions table (weekly sessions)
CREATE TABLE IF NOT EXISTS corabastos_sessions (
    id UUID PRIMARY KEY,
    week_start TIMESTAMP NOT NULL,  -- Monday of the corabastos week
    week_end TIMESTAMP NOT NULL,    -- Sunday of the corabastos week
    scheduled_time TIMESTAMP,       -- When the corabastos is scheduled (usually Friday 12pm)
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, active, completed, cancelled
    type VARCHAR(20) DEFAULT 'regular',     -- regular, emergency
    channel_id VARCHAR(20),         -- Voice channel ID
    announcement_message_id VARCHAR(20),   -- Message ID of the @everyone announcement
    announcement_channel_id VARCHAR(20),   -- Channel where announcement was sent
    created_by_id VARCHAR(20) REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Corabastos agenda items table
CREATE TABLE IF NOT EXISTS corabastos_agenda (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES corabastos_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(20) REFERENCES users(id),
    turno INTEGER NOT NULL,         -- 0 = 12pm, 1 = 1pm, 2 = 2pm, etc.
    topic TEXT NOT NULL,            -- The agenda topic
    description TEXT,               -- Optional detailed description
    status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, completed, cancelled
    confirmation_message_id VARCHAR(20), -- Message where user confirmed
    order_index INTEGER DEFAULT 0, -- Order within the same turno
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, user_id, turno, topic) -- Prevent duplicate topics
);

-- Emergency corabastos requests table
CREATE TABLE IF NOT EXISTS corabastos_emergency_requests (
    id UUID PRIMARY KEY,
    requested_by_id VARCHAR(20) REFERENCES users(id),
    reason TEXT NOT NULL,           -- Emergency topic/reason
    description TEXT,               -- Detailed description
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled
    confirmation_message_id VARCHAR(20), -- Message asking for confirmations
    confirmations_needed INTEGER DEFAULT 10, -- Number of confirmations needed
    confirmations_received INTEGER DEFAULT 0, -- Current confirmations
    expires_at TIMESTAMP,           -- When the request expires
    approved_at TIMESTAMP,          -- When it was approved
    session_id UUID REFERENCES corabastos_sessions(id), -- Created session if approved
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Emergency corabastos confirmations table
CREATE TABLE IF NOT EXISTS corabastos_emergency_confirmations (
    id SERIAL PRIMARY KEY,
    request_id UUID REFERENCES corabastos_emergency_requests(id) ON DELETE CASCADE,
    user_id VARCHAR(20) REFERENCES users(id),
    confirmed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(request_id, user_id) -- One confirmation per user per request
);

-- Corabastos attendance tracking (optional for future features)
CREATE TABLE IF NOT EXISTS corabastos_attendance (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES corabastos_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(20) REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    total_duration INTEGER, -- In minutes
    UNIQUE(session_id, user_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_corabastos_sessions_week ON corabastos_sessions(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_corabastos_sessions_status ON corabastos_sessions(status);
CREATE INDEX IF NOT EXISTS idx_corabastos_agenda_session ON corabastos_agenda(session_id);
CREATE INDEX IF NOT EXISTS idx_corabastos_agenda_turno ON corabastos_agenda(session_id, turno);
CREATE INDEX IF NOT EXISTS idx_corabastos_emergency_status ON corabastos_emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_corabastos_emergency_expires ON corabastos_emergency_requests(expires_at);

-- DOWN MIGRATION
DROP INDEX IF EXISTS idx_corabastos_emergency_expires;
DROP INDEX IF EXISTS idx_corabastos_emergency_status;
DROP INDEX IF EXISTS idx_corabastos_agenda_turno;
DROP INDEX IF EXISTS idx_corabastos_agenda_session;
DROP INDEX IF EXISTS idx_corabastos_sessions_status;
DROP INDEX IF EXISTS idx_corabastos_sessions_week;
DROP TABLE IF EXISTS corabastos_attendance;
DROP TABLE IF EXISTS corabastos_emergency_confirmations;
DROP TABLE IF EXISTS corabastos_emergency_requests;
DROP TABLE IF EXISTS corabastos_agenda;
DROP TABLE IF EXISTS corabastos_sessions;
