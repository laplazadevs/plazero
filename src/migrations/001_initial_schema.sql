-- UP MIGRATION
-- Initial database schema for Plazero Discord Bot

-- Users table (normalized Discord user data)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(20) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    discriminator VARCHAR(4),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY,
    target_user_id VARCHAR(20) REFERENCES users(id),
    initiator_id VARCHAR(20) REFERENCES users(id),
    reason TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    message_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    timeout_applied BOOLEAN DEFAULT FALSE,
    final_up_votes INTEGER DEFAULT 0,
    final_down_votes INTEGER DEFAULT 0,
    final_net_votes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Vote reactions table
CREATE TABLE IF NOT EXISTS vote_reactions (
    id SERIAL PRIMARY KEY,
    vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
    user_id VARCHAR(20) REFERENCES users(id),
    reaction_type VARCHAR(10) NOT NULL,
    weight INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(vote_id, user_id, reaction_type)
);

-- User cooldowns table
CREATE TABLE IF NOT EXISTS user_cooldowns (
    user_id VARCHAR(20) PRIMARY KEY REFERENCES users(id),
    last_vote_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Meme contests table
CREATE TABLE IF NOT EXISTS meme_contests (
    id UUID PRIMARY KEY,
    type VARCHAR(10) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(10) DEFAULT 'active',
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20),
    created_by_id VARCHAR(20) REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Meme winners table (only storing winners, not all memes)
CREATE TABLE IF NOT EXISTS meme_winners (
    id VARCHAR(50) PRIMARY KEY,
    contest_id UUID REFERENCES meme_contests(id),
    message_id VARCHAR(20) NOT NULL,
    author_id VARCHAR(20) REFERENCES users(id),
    reaction_count INTEGER NOT NULL,
    contest_type VARCHAR(10) NOT NULL,
    rank INTEGER NOT NULL,
    week_start TIMESTAMP,
    week_end TIMESTAMP,
    submitted_at TIMESTAMP DEFAULT NOW()
);

-- User statistics table
CREATE TABLE IF NOT EXISTS user_stats (
    user_id VARCHAR(20) PRIMARY KEY REFERENCES users(id),
    total_meme_wins INTEGER DEFAULT 0,
    total_bone_wins INTEGER DEFAULT 0,
    total_contests_participated INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Welcome requests table
CREATE TABLE IF NOT EXISTS welcome_requests (
    id UUID PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id),
    join_time TIMESTAMP NOT NULL,
    message_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    linkedin_url TEXT,
    presentation TEXT,
    invited_by TEXT,
    approved BOOLEAN DEFAULT FALSE,
    approved_by_id VARCHAR(20) REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- DOWN MIGRATION
DROP TABLE IF EXISTS welcome_requests;
DROP TABLE IF EXISTS user_stats;
DROP TABLE IF EXISTS meme_winners;
DROP TABLE IF EXISTS meme_contests;
DROP TABLE IF EXISTS user_cooldowns;
DROP TABLE IF EXISTS vote_reactions;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS users;
