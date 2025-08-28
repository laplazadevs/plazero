# 🤖 Plazero Bot

A Discord bot designed for meme communities that automatically tracks meme competitions and provides community-driven moderation through timeout voting.

## 🎯 Features

### 📊 Meme Competition System
- **Automatic Weekly Competition**: Tracks memes from Friday to Friday using laugh reactions
- **Bone Competition**: Parallel competition using bone emoji (🦴)
- **Year-End Summary**: Annual meme compilation for the best content of the year
- **Scheduled Announcements**: Automatic winner announcements every Friday at 11:40 AM (Bogota time)

### ⚖️ Community Timeout Voting System
- **Democratic Moderation**: Community members can vote to timeout problematic users
- **Escalating Sanctions**: Multiple timeout levels based on vote count
- **Admin Override**: Administrators can cancel votes when needed
- **Real-time Voting**: Live vote tracking with Discord reactions
- **User Notifications**: Automatic DM notifications for all parties involved

## 🚀 Commands

### Core Commands
- `/gettop` - Manually announce weekly meme winners
- `/memeoftheyear` - Get the most reacted meme of 2024
- `/vote-timeout @user [reason]` - Initiate a community timeout vote
- `/cancel-vote [vote-id]` - Cancel an active vote (admins only)

## ⚖️ Voting System Details

### How It Works
1. **Initiation**: Users with the "One Of Us" role can start votes against problematic behavior
2. **Voting Period**: 5-minute voting window using 👍/👎 reactions
3. **Real-time Updates**: Vote embed updates live as reactions are added/removed
4. **Automatic Execution**: Timeouts are applied automatically when thresholds are met

### Vote Thresholds & Sanctions
| Net Votes | Timeout Duration | Severity Level |
|-----------|------------------|----------------|
| 5+ votes  | 5 minutes       | Light Warning  |
| 8+ votes  | 30 minutes      | Moderate Sanction |
| 12+ votes | 2 hours         | Serious Violation |
| 15+ votes | 24 hours        | Severe Misconduct |

### Protection Mechanisms
- **Role Requirement**: Only "One Of Us" role members can initiate votes
- **Admin Protection**: Cannot vote against administrators
- **Cooldown System**: 15-minute cooldown between votes per user
- **Duplicate Prevention**: One active vote per target user maximum
- **Admin Override**: Administrators can cancel any vote at any time

### Usage Examples
```
/vote-timeout @problematic_user Spamming inappropriate content
/vote-timeout @rule_breaker Using offensive language repeatedly
/cancel-vote vote_1703123456_abc123
```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v16 or higher)
- Discord Bot Token
- Discord Server with appropriate permissions

### Environment Variables
Create a `.env` file in the project root:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_application_id
GUILD_ID=your_discord_server_id
MEME_CHANNEL_ID=your_meme_channel_id
```

### Installation Steps
1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd memeoftheweekbot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env` (if available)
   - Fill in your Discord bot credentials and channel IDs

4. **Register slash commands and start the bot**
   ```bash
   npm run start
   ```

### Deployment

For production deployment:

1. **Ensure environment variables are set**
   ```env
   DISCORD_BOT_TOKEN=your_bot_token
   CLIENT_ID=your_bot_client_id
   GUILD_ID=your_server_id
   MEME_CHANNEL_ID=your_meme_channel_id
   ```

2. **Deploy using production script**
   ```bash
   npm run start
   ```

**Note**: The bot uses ES modules and requires the compiled JavaScript files in the `dist/` directory. The `start` script automatically builds the project, registers commands, and starts the bot.

#### ES Module Requirements
- All imports must include `.js` extensions for ES modules
- dayjs plugins require explicit `.js` extensions
- Node.js v16+ recommended for full ES module support

### Required Discord Setup

#### Channels
- **Meme Channel**: Main channel where memes are posted (set in `MEME_CHANNEL_ID`)
- **#moderacion**: Channel for voting messages (create this channel in your server)

#### Roles
- **"One Of Us"**: Role required to initiate timeout votes
- **"Server Booster"**: Users with this role get double vote weight (2x instead of 1x)
- **Administrator**: Protected from timeout votes, can cancel any vote, immune to "tibio" timeouts

#### Bot Permissions

##### Essential Permissions
- **`Send Messages`** - Post meme winners, voting messages, and responses
- **`Use Slash Commands`** - Handle `/gettop`, `/memeoftheyear`, `/vote-timeout`, `/cancel-vote`
- **`Add Reactions`** - Add 👍/👎 reactions to voting messages
- **`Read Message History`** - Fetch messages for meme competitions
- **`View Channels`** - Access channels to read and send messages
- **`Embed Links`** - Send rich embed messages for voting interface

##### Moderation Permissions
- **`Timeout Members`** - Apply timeouts based on voting results ⚠️
- **`Manage Messages`** - Edit voting messages with live updates

##### Advanced Permissions
- **`Read Messages/View Channels`** - Access message content and reactions
- **`Use External Emojis`** - Track custom server emojis for meme competitions

##### Gateway Intents Required
The bot uses these Gateway Intents (configured automatically):
- `Guilds` - Access server information
- `GuildMessages` - Read and send messages
- `MessageContent` - Access message content for competitions
- `GuildMessageReactions` - Track reactions for voting and competitions

##### Quick Setup
**Permission Integer:** `1512880948288`

⚠️ **Security Note:** The `Timeout Members` permission is sensitive - only grant to trusted bots. The bot includes admin protection to prevent misuse.

## 📈 Reaction System

### Meme Competition Emojis
The bot tracks these reactions for meme competitions:
- 🤣 (Rolling on floor laughing)
- 😂 (Joy/tears of joy)
- 🥇 (First place medal)
- Custom server emojis (pepehardlaugh, doggokek, kekw, pepelaugh)

### Voting Reactions
- 👍 **Approve** - Vote to apply timeout
- 👎 **Reject** - Vote against timeout  
- ⬜ **Tibio (Lukewarm)** - Results in immediate 1-minute timeout for the voter

### Weighted Voting System
- **Regular Members**: Each vote counts as 1 point
- **Server Boosters**: Each vote counts as 2 points (double weight)
- **Vote Cleaning**: Only approved reactions (👍👎⬜) are allowed; others are automatically removed

### Anti-Tibio System
The bot punishes indecisive "lukewarm" voting:
- **⬜ Reaction**: Immediately applies 1-minute timeout to the voter
- **Public Shame**: Posts "{user} recibió un timeout por votar como tibio" in moderation channel
- **Admin Immunity**: Administrators are immune to tibio timeouts
- **Auto-Removal**: Tibio reactions are automatically removed after punishment

## 🕐 Automated Schedule

The bot automatically runs the weekly competition every **Friday at 11:40 AM (Bogota timezone)**.

### Timezone Configuration
- Default timezone: `America/Bogota`
- Weekly period: Friday 12:00 PM to Friday 12:00 PM
- Automatic winner announcements

## 🔧 Development

### Scripts

#### Production
- `npm run start` - Build, register commands, and start the bot (production)
- `npm run start:production` - Same as start (alias for deployment)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run register-commands` - Register Discord slash commands (from compiled JS)
- `npm run start:bot` - Start the bot only (no command registration)

#### Development
- `npm run dev` - Register commands and start bot using ts-node (development)
- `npm run dev:register` - Register commands only using ts-node (development)

#### Code Quality
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Modular Architecture Benefits
- **🏗️ Separation of Concerns**: Each module has a single responsibility
- **🧪 Easy Testing**: Components can be tested independently
- **🔧 Simple Maintenance**: Changes isolated to specific modules
- **📈 Scalability**: Easy to add new features without breaking existing code
- **🛡️ Memory Safety**: Automatic cleanup and proper resource management
- **🎯 Type Safety**: Strong TypeScript interfaces throughout

### Project Structure
```
src/
├── index.ts              # Main entry point and bot initialization
├── register-commands.ts  # Slash command registration
├── config/
│   └── constants.ts      # Bot configuration and constants
├── types/
│   └── vote.ts          # TypeScript interfaces
├── services/
│   ├── vote-manager.ts   # Vote state management
│   ├── vote-embed.ts     # Vote embed creation
│   └── meme-service.ts   # Meme competition logic
├── handlers/
│   ├── vote-commands.ts  # Slash command handlers
│   ├── vote-reactions.ts # Reaction event handlers
│   ├── vote-completion.ts# Vote completion logic
│   └── vote-updates.ts   # Real-time vote updates
└── utils/
    └── vote-utils.ts     # Utility functions
```

## 🚨 Troubleshooting

### Common Issues

**Bot not responding to commands:**
- Ensure bot has proper permissions in your server
- Check that slash commands are registered (`npm run start`)
- Verify environment variables are set correctly

**Voting not working:**
- Ensure #moderacion channel exists
- Check that users have "One Of Us" role
- Verify bot can manage timeouts

**Weekly announcements not working:**
- Check `MEME_CHANNEL_ID` environment variable
- Ensure bot has permissions in the meme channel
- Verify timezone configuration

### Error Logs
Check console output for detailed error messages. Common issues include:
- Missing environment variables
- Insufficient bot permissions
- Network connectivity issues

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Scheduling powered by [node-cron](https://github.com/kelektiv/node-cron)
- Date handling with [Day.js](https://day.js.org/)

---

*For support or questions, please open an issue in the repository or contact the bot administrators.*