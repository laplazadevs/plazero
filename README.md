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
| 3+ votes  | 5 minutes       | Light Warning  |
| 5+ votes  | 30 minutes      | Moderate Sanction |
| 8+ votes  | 2 hours         | Serious Violation |
| 12+ votes | 24 hours        | Severe Misconduct |

### Protection Mechanisms
- **Role Requirement**: Only "One Of Us" role members can initiate votes
- **Admin Protection**: Cannot vote against administrators
- **Cooldown System**: 1-hour cooldown between votes per user
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

4. **Register slash commands**
   ```bash
   npm run start
   ```

### Required Discord Setup

#### Channels
- **Meme Channel**: Main channel where memes are posted (set in `MEME_CHANNEL_ID`)
- **#moderacion**: Channel for voting messages (create this channel in your server)

#### Roles
- **"One Of Us"**: Role required to initiate timeout votes
- **Administrator**: Protected from timeout votes, can cancel any vote

#### Bot Permissions
The bot needs the following permissions:
- `Send Messages`
- `Add Reactions`
- `Read Message History`
- `Manage Messages`
- `Timeout Members`
- `Use Slash Commands`

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

## 🕐 Automated Schedule

The bot automatically runs the weekly competition every **Friday at 11:40 AM (Bogota timezone)**.

### Timezone Configuration
- Default timezone: `America/Bogota`
- Weekly period: Friday 12:00 PM to Friday 12:00 PM
- Automatic winner announcements

## 🔧 Development

### Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Register commands and start the bot
- `npm run start:bot` - Start the bot without registering commands
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Project Structure
```
src/
├── index.ts              # Main bot logic and voting system
└── register-commands.ts  # Slash command registration
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