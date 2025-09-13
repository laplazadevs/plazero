# 🤖 Plazero Bot

A Discord bot designed for meme communities that automatically tracks meme competitions and provides community-driven moderation through timeout voting.

**Meme Competition**

-   **Automatic Weekly Competition**: Tracks memes from Friday to Friday using laugh reactions
-   **Bone Competition**: Parallel competition using bone emoji (🦴)
-   **Year-End Summary**: Annual meme compilation for the best content of the year
-   **Scheduled Announcements**: Automatic winner announcements every Friday at 11:40 AM (Bogota time)
-   **Custom Contests**: Create flexible contests with custom durations and types
-   **Comprehensive Statistics**: Track meme performance, user contributions, and contest history
-   **Interactive Management**: Rich embeds with buttons for contest control and statistics

**Community Timeout Voting**

-   **Democratic Moderation**: Community members can vote to timeout problematic users
-   **Escalating Sanctions**: Multiple timeout levels based on vote count
-   **Admin Override**: Administrators can cancel votes when needed
-   **Real-time Voting**: Live vote tracking with Discord reactions
-   **User Notifications**: Automatic DM notifications for all parties involved

**Welcome Messaging**

-   **Automatic Greeting**: New members receive welcome messages upon joining
-   **Information Collection**: Smart detection of LinkedIn, presentation, and invitation details
-   **Moderator Approval**: Secure approval process with role-based permissions
-   **Real-time Updates**: Welcome embeds update automatically as information is provided
-   **Role Assignment**: Automatic role assignment upon approval

## Commands

-   `/gettop` - Manually announce weekly meme winners
-   `/memeoftheyear` - Get the most reacted meme of 2024
-   `/meme-stats` - View comprehensive meme statistics and leaderboards
-   `/meme-contest [type] [duration]` - Create custom meme contests (moderators only)
-   `/vote-timeout @user [reason]` - Initiate a community timeout vote
-   `/cancel-vote [vote-id]` - Cancel an active vote (admins only)

## Setup & Installation

### Prerequisites

-   Node.js (v16 or higher)
-   PostgreSQL (v12 or higher)
-   Discord Bot Token
-   Discord Server with appropriate permissions

### Environment Variables

The following variables must be available in the host:

```env
export DISCORD_BOT_TOKEN=your_bot_token
export CLIENT_ID=your_client_id
export GUILD_ID=your_guild_id
export DATABASE_URL=postgresql://user:password@localhost:5432/plazero_bot
# OR use individual variables:
export PGDATABASE=plazero_bot
export PGUSER=postgres
export POSTGRES_PASSWORD=your_password
```

### Database Setup

The bot uses PostgreSQL with an automated migration system:

```bash
# Create database and run all migrations
npm run setup

# Check migration status
npm run migrate:status

# Run pending migrations
npm run migrate:up

# Rollback a migration
npm run migrate:rollback <version>
```

For detailed database setup instructions, see [Database Setup](src/migrations/DB_SETUP.md).

### Deployment

For production deployment:

1. **Ensure environment variables are set**

    ```env
    DISCORD_BOT_TOKEN=your_bot_token
    CLIENT_ID=your_bot_client_id
    GUILD_ID=your_server_id
    ```

2. **Deploy using production script**
    ```bash
    npm run start
    ```

**Note**: The bot uses ES modules and requires the compiled JavaScript files in the `dist/` directory. The `start` script automatically builds the project, registers commands, and starts the bot.

## Required Discord Setup

**Channels:**

-   **🤣︱memes**: Main channel where memes are posted and competitions are tracked
-   **🧑‍⚖️︱moderación**: Channel for voting messages (create this channel in your server)
-   **👋︱nuevos**: Channel for welcome messages and new member onboarding

**Roles:**

-   **"One Of Us"**: Role required to initiate timeout votes
-   **"Server Booster"**: Users with this role get double vote weight (2x instead of 1x)
-   **Administrator**: Protected from timeout votes, can cancel any vote, immune to "tibio" timeouts

**Bot Permissions:**

-   **`Send Messages`** - Post meme winners, voting messages, and responses
-   **`Use Slash Commands`** - Handle `/gettop`, `/memeoftheyear`, `/vote-timeout`, `/cancel-vote`
-   **`Add Reactions`** - Add 👍/👎 reactions to voting messages
-   **`Read Message History`** - Fetch messages for meme competitions
-   **`View Channels`** - Access channels to read and send messages
-   **`Embed Links`** - Send rich embed messages for voting interface
-   **`Timeout Members`** - Apply timeouts based on voting results ⚠️
-   **`Manage Messages`** - Edit voting messages with live updates
-   **`Read Messages/View Channels`** - Access message content and reactions
-   **`Use External Emojis`** - Track custom server emojis for meme competitions

**Gateway Intents (configured automatically):**

-   `Guilds` - Access server information
-   `GuildMessages` - Read and send messages
-   `MessageContent` - Access message content for competitions
-   `GuildMessageReactions` - Track reactions for voting and competitions
-   `GuildMembers` - Access member information for welcome system

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
