# 🤖 Plazero Bot

A Discord bot designed for meme communities that automatically tracks meme competitions, provides community-driven moderation through timeout voting, welcomes new members, and organizes the weekly "corabastos" hangout.

**Meme Competition**

-   **Automatic Weekly Competition**: Tracks memes from Friday to Friday using laugh reactions
-   **Bone Competition**: Parallel competition using bone emoji (🦴)
-   **Year-End Summary**: Annual meme compilation for the best content of the year
-   **Scheduled Announcements**: Automatic winner announcements every Friday (Bogota time)
-   **Custom Contests**: Create flexible contests with custom durations and types
-   **Comprehensive Statistics**: Track meme performance, user contributions, and contest history

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
-   **Role Assignment**: Automatic role assignment upon approval

**Corabastos Sessions**

-   **Weekly Sessions**: A session is scheduled automatically every week (Fridays)
-   **Agenda Management**: Members book a turno (time slot) and topic via slash commands
-   **Emergency Sessions**: Community-confirmed emergency corabastos requests
-   **Turno Notifications**: Channel and DM reminders when a turno starts

## Commands

-   `/meme-of-the-year` - Top 3 most voted memes of the current year
-   `/meme-stats` - View comprehensive meme statistics and leaderboards
-   `/meme-contest <type> [duration]` - Create a meme contest (moderators only)
-   `/meme-complete-contest <contest-id>` - Force-finish a contest (admins only)
-   `/vote-timeout <user> <reason>` - Initiate a community timeout vote
-   `/cancel-vote <vote-id>` - Cancel an active vote (admins only)
-   `/corabastos-agenda agregar <turno> <tema> [descripcion]` - Add a topic to this week's agenda
-   `/corabastos-agenda ver` - Show this week's agenda
-   `/corabastos-emergencia <razon> <paciente>` - Request an emergency corabastos
-   `/corabastos-estado` - Show the current corabastos status
-   `/corabastos-crear-sesion` - Manually create a session (admins only)

## Project Structure

The bot is an [Effect](https://effect.website) application organized by feature:

```
src/
  main.ts                 Entrypoint: layer composition + runtime
  register-commands.ts    Registers each feature's slash commands with Discord
  config/                 ConfigProvider + environment configs
  db/                     Postgres layer, migration runner, shared row schemas
  discord/                Discord client service + gateway event dispatch
  domain/                 Models shared across features (User) + UserRepository
  features/
    vote/                 Timeout voting: domain, manager, repository, handlers, embeds
    meme/                 Meme contests
    welcome/              Member onboarding
    corabastos/           Weekly sessions, agenda, emergencies
    departure/            Member departure notices
  jobs/                   Recurring background jobs (sweeps, crons)
  migrations/             SQL migrations
```

Each feature folder is a vertical slice: its domain model and constants (`*Domain.ts`), its services (`*Manager.ts`, `*Repository.ts` with `static layer`), its gateway handlers, its embeds, and a `<Feature>.ts` facade exporting the composed feature layer consumed by `main.ts`.

## Setup & Installation

### Prerequisites

-   Node.js v22 or higher
-   PostgreSQL (v12 or higher)
-   Discord Bot Token
-   Discord Server with appropriate permissions

### Environment Variables

The following variables must be available in the host:

```env
export DISCORD_BOT_TOKEN=your_bot_token
export CLIENT_ID=your_client_id
export GUILD_ID=your_server_id
export DATABASE_URL=postgresql://user:password@localhost:5432/plazero_bot
# OR use individual variables:
export PGDATABASE=plazero_bot
export PGUSER=postgres
export POSTGRES_PASSWORD=your_password
```

### Development

```bash
npm install          # also vendors the Effect repo for reference (scripts/prepare-effect.sh)
npm run setup        # create database and run all migrations
npm run dev          # migrate, register commands, and start the bot with tsx

npm run lint         # biome check (lint + format + import order)
npm run lint:fix     # apply fixes
```

### Database Setup

The bot uses PostgreSQL with an automated migration system:

```bash
npm run setup                     # Create database and run all migrations
npm run migrate:status            # Check migration status
npm run migrate:up                # Run pending migrations
npm run migrate:rollback <version> # Rollback a migration
```

For detailed database setup instructions, see [Database Setup](src/migrations/DB_SETUP.md).

### Deployment

For production deployment, ensure the environment variables are set and run:

```bash
npm run start
```

The `start` script builds the project, runs migrations, registers commands, and starts the bot from `dist/`.

## Required Discord Setup

**Channels:**

-   **🤣︱memes**: Main channel where memes are posted and competitions are tracked
-   **🧑‍⚖️︱moderación**: Channel for voting messages
-   **👋︱nuevos**: Channel for welcome messages and new member onboarding
-   **🗿︱general**: Channel for corabastos announcements and notifications
-   **🇨🇴︱corabastos**: Voice channel for the sessions
-   **🐵︱administración**: Channel for member departure notices

**Roles:**

-   **"One Of Us"**: Role required to initiate timeout votes; assigned on welcome approval
-   **"Server Booster"**: Users with this role get double vote weight (2x instead of 1x)
-   **Administrator**: Protected from timeout votes, can cancel any vote, immune to "tibio" timeouts

**Bot Permissions:**

-   **`Send Messages`** - Post meme winners, voting messages, and responses
-   **`Use Slash Commands`** - Handle the commands listed above
-   **`Add Reactions`** - Add 👍/👎 reactions to voting messages
-   **`Read Message History`** - Fetch messages for meme competitions
-   **`View Channels`** - Access channels to read and send messages
-   **`Embed Links`** - Send rich embed messages
-   **`Timeout Members`** - Apply timeouts based on voting results ⚠️
-   **`Manage Messages`** - Edit voting messages with live updates
-   **`Use External Emojis`** - Track custom server emojis for meme competitions

**Gateway Intents (configured automatically):**

-   `Guilds` - Access server information
-   `GuildMessages` - Read and send messages
-   `MessageContent` - Access message content for competitions
-   `GuildMessageReactions` - Track reactions for voting and competitions
-   `GuildMembers` - Access member information for welcome system

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
