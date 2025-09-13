# Database Setup Guide

## Environment Variables

Set the following environment variables in your system:

```bash
# Discord Bot Configuration
export DISCORD_BOT_TOKEN=your_discord_bot_token_here
export CLIENT_ID=your_bot_application_id_here
export GUILD_ID=your_discord_server_id_here

# Database Configuration (Option 1: Use DATABASE_URL)
export DATABASE_URL=postgresql://user:password@localhost:5432/plazero_bot

# Database Configuration (Option 2: Use individual variables)
export PGDATABASE=plazero_bot
export PGUSER=postgres
export POSTGRES_PASSWORD=your_database_password_here
```

**Note:** You can use either `DATABASE_URL` (recommended) or the individual database variables (`PGDATABASE`, `PGUSER`, `POSTGRES_PASSWORD`). If `DATABASE_URL` is provided, it will be used instead of the individual variables.

## Quick Setup

The easiest way to set up the entire bot is using the automated setup script:

```bash
./setup.sh
```

This will:

1. Check prerequisites (Node.js, npm, PostgreSQL)
2. Verify required environment variables are set
3. Install dependencies
4. Build the project
5. Create the database if it doesn't exist
6. Run all migrations to set up the schema
7. Create indexes and cleanup functions
8. Register Discord commands

**Note:** Make sure to set your environment variables before running the setup script.

## PostgreSQL Installation

### macOS (using Homebrew)

```bash
brew install postgresql
brew services start postgresql
```

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Windows

Download and install from: https://www.postgresql.org/download/windows/

## Manual Database Setup (Alternative)

If you prefer to set up the database manually:

1. **Create database and user:**

```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create database
CREATE DATABASE plazero_bot;

-- Create user (optional, you can use the default postgres user)
CREATE USER plazero_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE plazero_bot TO plazero_user;

-- Exit
\q
```

2. **Install dependencies:**

```bash
npm install
```

3. **Run migrations:**

```bash
npm run migrate:up
```

4. **Start the bot:**

```bash
npm run start
```

## Migration Commands

The bot includes a comprehensive migration system:

```bash
# Run all pending migrations
npm run migrate:up

# Check migration status
npm run migrate:status

# Create database if it doesn't exist
npm run migrate:create-db

# Rollback a specific migration
npm run migrate:rollback <version>

# Full setup (create DB + run migrations)
npm run setup
```

The bot will automatically:

-   Test the database connection
-   Run migrations to set up the schema
-   Create indexes and cleanup functions
-   Start the Discord bot

## Database Schema

The migration system creates the following tables:

-   `users` - Discord user information
-   `votes` - Voting data (with automatic cleanup)
-   `vote_reactions` - Individual vote reactions
-   `user_cooldowns` - User cooldown tracking
-   `meme_contests` - Meme contest information
-   `meme_winners` - Only winning memes (optimized storage)
-   `user_stats` - Aggregated user statistics
-   `welcome_requests` - Welcome system data
-   `migrations` - Migration tracking table

## Migration System

The bot uses a versioned migration system:

1. **001_initial_schema.sql** - Creates all base tables
2. **002_cleanup_functions.sql** - Creates automatic cleanup functions
3. **003_indexes.sql** - Creates performance indexes

Each migration includes:

-   **UP migration**: Changes to apply
-   **DOWN migration**: How to rollback the changes
-   **Version tracking**: Automatic tracking of applied migrations

## Automatic Cleanup

The database includes automatic cleanup functions that run:

-   **Votes**: Completed votes older than 1 hour are removed
-   **Cooldowns**: Expired cooldowns are cleaned up every 15 minutes
-   **Welcome Requests**: Pending requests older than 7 days are removed

## Monitoring

The bot logs database operations and cleanup activities. Check the console output for:

-   Database connection status
-   Schema initialization
-   Cleanup operations
-   Error messages

## Troubleshooting

### Connection Issues

-   Verify PostgreSQL is running: `sudo systemctl status postgresql`
-   Check database credentials in `.env`
-   Ensure database exists: `psql -U postgres -l`

### Permission Issues

-   Grant proper permissions to your database user
-   Check firewall settings if using remote database

### Performance

-   The database is optimized for Discord bot usage
-   Only essential data is stored (winners, not all memes)
-   Automatic cleanup prevents database bloat
