-- UP MIGRATION
-- Cleanup functions for automatic data retention

-- Cleanup old votes function
CREATE OR REPLACE FUNCTION cleanup_old_votes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM votes 
    WHERE completed = TRUE 
    AND created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired cooldowns function
CREATE OR REPLACE FUNCTION cleanup_expired_cooldowns()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_cooldowns 
    WHERE last_vote_time < NOW() - INTERVAL '15 minutes';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old pending welcome requests function
CREATE OR REPLACE FUNCTION cleanup_old_pending_welcome_requests()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM welcome_requests 
    WHERE approved = FALSE 
    AND created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Combined cleanup function
CREATE OR REPLACE FUNCTION run_all_cleanup()
RETURNS TABLE(
    votes_cleaned INTEGER,
    cooldowns_cleaned INTEGER,
    welcome_requests_cleaned INTEGER
) AS $$
DECLARE
    votes_count INTEGER;
    cooldowns_count INTEGER;
    welcome_count INTEGER;
BEGIN
    SELECT cleanup_old_votes() INTO votes_count;
    SELECT cleanup_expired_cooldowns() INTO cooldowns_count;
    SELECT cleanup_old_pending_welcome_requests() INTO welcome_count;
    
    RETURN QUERY SELECT votes_count, cooldowns_count, welcome_count;
END;
$$ LANGUAGE plpgsql;

-- DOWN MIGRATION
DROP FUNCTION IF EXISTS run_all_cleanup();
DROP FUNCTION IF EXISTS cleanup_old_pending_welcome_requests();
DROP FUNCTION IF EXISTS cleanup_expired_cooldowns();
DROP FUNCTION IF EXISTS cleanup_old_votes();
