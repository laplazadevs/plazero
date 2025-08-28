# 🤖 Plazero bot

A Discord bot designed for meme communities that automatically tracks meme competitions and provides community-driven moderation through timeout voting.

## 🎯 Features

### 📊 Meme competition system
- **Automatic weekly competition**: Tracks memes from Friday to Friday using laugh reactions.
- **Bone competition**: Parallel competition using bone emoji (🦴).
- **Year-end summary**: Annual meme compilation for the best content of the year.
- **Scheduled announcements**: Automatic winner announcements every Friday at 11:40 a.m. (Bogota time).

### ⚖️ Community timeout voting system
- **Democratic moderation**: Community members can vote to timeout problematic users.
- **Escalating sanctions**: Multiple timeout levels based on vote count.
- **Admin override**: Administrators can cancel votes when needed.
- **Real-time voting**: Live vote tracking with Discord reactions.
- **User notifications**: Automatic DM notifications for all parties involved.

## 🚀 Commands

### Core commands
- `/gettop` - Manually announce weekly meme winners.
- `/memeoftheyear` - Get the most reacted meme of 2024.
- `/vote-timeout @user [reason]` - Initiate a community timeout vote.
- `/cancel-vote [vote-id]` - Cancel an active vote (admins only).

## ⚖️ Voting system details

### How it works
1. **Initiation**: Users with the "One Of Us" role can start votes against problematic behavior.
2. **Voting period**: 5-minute voting window using 👍/👎 reactions.
3. **Real-time updates**: Vote embed updates live as reactions are added/removed.
4. **Automatic execution**: Timeouts are applied automatically when thresholds are met.

### Vote thresholds & sanctions
| Net votes | Timeout duration | Severity level    |
|-----------|------------------|-------------------|
| 5+ votes  | 5 minutes        | Light warning     |
| 8+ votes  | 30 minutes       | Moderate sanction |
| 12+ votes | 2 hours          | Serious violation |
| 15+ votes | 24 hours         | Severe misconduct |

### Protection mechanisms
- **Role requirement**: Only "One Of Us" role members can initiate votes.
- **Admin protection**: Cannot vote against administrators.
- **Cooldown system**: 15-minute cooldown between votes per user.
- **Duplicate prevention**: One active vote per target user maximum.
- **Admin override**: Administrators can cancel any vote at any time.

### Usage examples
```
/vote-timeout @problematic_user Spamming inappropriate content.
/vote-timeout @rule_breaker Using offensive language repeatedly.
/cancel-vote vote_1703123456_abc123
```

## 🛠️ Setup & installation

### Prerequisites
- Node.js (v16 or higher).
- Discord bot token.
- Discord server with appropriate permissions.

### Environment variables
Create a `.env` file in the project root:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_application_id
GUILD_ID=your_discord_server_id
MEME_CHANNEL_ID=your_meme_channel_id
```

### Installation steps
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
   - Copy `.env.example` to `.env` (if available).
   - Fill in your Discord bot credentials and channel IDs.

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

#### ES modules requirements
- All imports must include `.js` extensions for ES modules.
- dayjs plugins require explicit `.js` extensions.
- Node.js v16+ recommended for full ES modules support.

### Required discord setup

#### Channels
- **Meme channel**: Main channel where memes are posted (set in `MEME_CHANNEL_ID`).
- **#moderacion**: Channel for voting messages (create this channel in your server).

#### Roles
- **"One Of Us"**: Role required to initiate timeout votes.
- **"Server Booster"**: Users with this role get double vote weight (2x instead of 1x).
- **Administrator**: Protected from timeout votes, can cancel any vote, immune to "tibio" timeouts.

#### Bot permissions

##### Essential permissions
- **`Send Messages`** - Post meme winners, voting messages, and responses.
- **`Use Slash Commands`** - Handle `/gettop`, `/memeoftheyear`, `/vote-timeout`, `/cancel-vote`.
- **`Add Reactions`** - Add 👍/👎 reactions to voting messages.
- **`Read Message History`** - Fetch messages for meme competitions.
- **`View Channels`** - Access channels to read and send messages.
- **`Embed Links`** - Send rich embed messages for voting interface.

##### Moderation permissions
- **`Timeout members`** - Apply timeouts based on voting results ⚠️.
- **`Manage messages`** - Edit voting messages with live updates.

##### Advanced permissions
- **`Read messages/view Channels`** - Access message content and reactions.
- **`Use external emojis`** - Track custom server emojis for meme competitions.

##### Gateway intents required
The bot uses these gateway intents (configured automatically):
- `Guilds` - Access server information.
- `GuildMessages` - Read and send messages.
- `MessageContent` - Access message content for competitions.
- `GuildMessageReactions` - Track reactions for voting and competitions.

##### Quick setup
**Permission integer:** `1512880948288`.

⚠️ **Security note:** The `Timeout Members` permission is sensitive - only grant to trusted bots. The bot includes admin protection to prevent misuse.

## 📈 Reaction system

### Meme competition emojis
The bot tracks these reactions for meme competitions:
- 🤣 (Rolling on floor laughing).
- 😂 (Joy/tears of joy).
- 🥇 (First place medal).
- Custom server emojis (pepehardlaugh, doggokek, kekw, pepelaugh).

### Voting reactions
- 👍 **Approve** - Vote to apply timeout.
- 👎 **Reject** - Vote against timeout.
- ⬜ **Tibio (Lukewarm)** - Results in immediate 1-minute timeout for the voter.

### Weighted voting system
- **Regular members**: Each vote counts as 1 point.
- **Server boosters**: Each vote counts as 2 points (double weight).
- **Vote cleaning**: Only approved reactions (👍👎⬜) are allowed; others are automatically removed.

### Anti-tibio system
The bot punishes indecisive "lukewarm" voting:
- **⬜ Reaction**: Immediately applies 1-minute timeout to the voter.
- **Public shame**: Posts "{user} recibió un timeout por votar como tibio" in moderation channel.
- **Admin immunity**: Administrators are immune to tibio timeouts.
- **Auto-removal**: Tibio reactions are automatically removed after punishment.

## 🕐 Automated schedule

The bot automatically runs the weekly competition every **Friday at 11:40 a.m. (Bogota timezone)**.

### Timezone configuration
- Default timezone: `America/Bogota`.
- Weekly period: Friday 12:00 PM to Friday 12:00 p.m.
- Automatic winner announcements.

## 🔧 Development

### Scripts

#### Production
- `npm run start` - Build, register commands, and start the bot (production).
- `npm run start:production` - Same as start (alias for deployment).
- `npm run build` - Compile TypeScript to JavaScript.
- `npm run register-commands` - Register Discord slash commands (from compiled JS).
- `npm run start:bot` - Start the bot only (no command registration).

#### Development
- `npm run dev` - Register commands and start bot using ts-node (development).
- `npm run dev:register` - Register commands only using ts-node (development).

#### Code Quality
- `npm run lint` - Run ESLint.
- `npm run format` - Format code with Prettier.

### Modular architecture benefits
- **🏗️ Separation of concerns**: Each module has a single responsibility.
- **🧪 Easy testing**: Components can be tested independently.
- **🔧 Simple maintenance**: Changes isolated to specific modules.
- **📈 Scalability**: Easy to add new features without breaking existing code.
- **🛡️ Memory safety**: Automatic cleanup and proper resource management.
- **🎯 Type safety**: Strong TypeScript interfaces throughout.

### Project structure
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

### Common issues

**Bot not responding to commands:**
- Ensure bot has proper permissions in your server.
- Check that slash commands are registered (`npm run start`).
- Verify environment variables are set correctly.

**Voting not working:**
- Ensure #moderacion channel exists.
- Check that users have "One Of Us" role.
- Verify bot can manage timeouts.

**Weekly announcements not working:**
- Check `MEME_CHANNEL_ID` environment variable.
- Ensure bot has permissions in the meme channel.
- Verify timezone configuration.

### Error logs
Check console output for detailed error messages. Common issues include:
- Missing environment variables.
- Insufficient bot permissions.
- Network connectivity issues.

## 📝 Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Discord.js](https://discord.js.org/).
- Scheduling powered by [node-cron](https://github.com/kelektiv/node-cron).
- Date handling with [Day.js](https://day.js.org/).

---

*For support or questions, please open an issue in the repository or contact the bot administrators.*