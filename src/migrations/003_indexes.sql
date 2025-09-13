-- UP MIGRATION
-- Performance indexes for optimal query performance

-- Vote-related indexes
CREATE INDEX IF NOT EXISTS idx_votes_completed_created 
ON votes(completed, created_at);

CREATE INDEX IF NOT EXISTS idx_votes_target_user 
ON votes(target_user_id, completed);

CREATE INDEX IF NOT EXISTS idx_votes_message_id 
ON votes(message_id);

CREATE INDEX IF NOT EXISTS idx_vote_reactions_vote_id 
ON vote_reactions(vote_id);

CREATE INDEX IF NOT EXISTS idx_vote_reactions_user_id 
ON vote_reactions(user_id);

-- Meme-related indexes
CREATE INDEX IF NOT EXISTS idx_meme_contests_status 
ON meme_contests(status, created_at);

CREATE INDEX IF NOT EXISTS idx_meme_contests_type 
ON meme_contests(type, status);

CREATE INDEX IF NOT EXISTS idx_meme_winners_contest_id 
ON meme_winners(contest_id);

CREATE INDEX IF NOT EXISTS idx_meme_winners_author_id 
ON meme_winners(author_id);

CREATE INDEX IF NOT EXISTS idx_meme_winners_contest_type 
ON meme_winners(contest_type, rank);

-- Welcome-related indexes
CREATE INDEX IF NOT EXISTS idx_welcome_requests_approved_created 
ON welcome_requests(approved, created_at);

CREATE INDEX IF NOT EXISTS idx_welcome_requests_user_id 
ON welcome_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_welcome_requests_message_id 
ON welcome_requests(message_id);

-- User-related indexes
CREATE INDEX IF NOT EXISTS idx_users_username 
ON users(username);

CREATE INDEX IF NOT EXISTS idx_user_cooldowns_last_vote_time 
ON user_cooldowns(last_vote_time);

-- User stats indexes
CREATE INDEX IF NOT EXISTS idx_user_stats_total_wins 
ON user_stats((total_meme_wins + total_bone_wins) DESC);

-- DOWN MIGRATION
DROP INDEX IF EXISTS idx_user_stats_total_wins;
DROP INDEX IF EXISTS idx_user_cooldowns_last_vote_time;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_welcome_requests_message_id;
DROP INDEX IF EXISTS idx_welcome_requests_user_id;
DROP INDEX IF EXISTS idx_welcome_requests_approved_created;
DROP INDEX IF EXISTS idx_meme_winners_contest_type;
DROP INDEX IF EXISTS idx_meme_winners_author_id;
DROP INDEX IF EXISTS idx_meme_winners_contest_id;
DROP INDEX IF EXISTS idx_meme_contests_type;
DROP INDEX IF EXISTS idx_meme_contests_status;
DROP INDEX IF EXISTS idx_vote_reactions_user_id;
DROP INDEX IF EXISTS idx_vote_reactions_vote_id;
DROP INDEX IF EXISTS idx_votes_message_id;
DROP INDEX IF EXISTS idx_votes_target_user;
DROP INDEX IF EXISTS idx_votes_completed_created;
