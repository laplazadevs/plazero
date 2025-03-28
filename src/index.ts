import { CronJob } from 'cron';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BaseMessageOptions, Client, CommandInteraction, Events, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Bogota');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const LAUGH_EMOJIS = [
  '🤣', // :rofl:
  '😂', // :joy:
  '🥇', // :first_place:
  '956966036354265180', // :pepehardlaugh:
  '974777892418519081', // :doggokek:
  '954075635310035024', // :kekw:
  '956966037063106580', // :pepelaugh:
  // Ensure all emoji IDs are valid strings
];

const BONE_EMOJI = ['🦴'];

const SCRAP_MESSAGES_COMMAND = 'gettop';
const MEME_OF_THE_YEAR_COMMAND = 'memeoftheyear';

// Discord Bot Login
client
  .login(process.env.DISCORD_BOT_TOKEN)
  .then(() => {
    console.log('Bot logged in!');
  })
  .catch((err) => {
    console.error('Failed to log in:', err);
  });

client.once('ready', () => {
  console.log('Bot is ready!');
  
  // Schedule the command to run every Friday at 11:40 AM Bogota time
  const job = new CronJob(
    '40 11 * * 5', // cronTime
    async () => {  // onTick
      console.log('Running scheduled gettop command...');
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const channel = guild.channels.cache.get(process.env.MEME_CHANNEL_ID as string) as TextChannel;
      if (!channel) return;

      try {
        const fakeInteraction = {
          reply: async (msg: string) => {
            await channel.send(msg);
          },
          followUp: async (msg: string | BaseMessageOptions) => {
            await channel.send(msg);
          },
          deferred: false,
          replied: false,
          editReply: async (msg: string) => {
            await channel.send(msg);
          },
          isCommand: () => true,
          commandName: SCRAP_MESSAGES_COMMAND,
        } as unknown as CommandInteraction;

        await processMessages(fakeInteraction);
      } catch (error) {
        console.error('Error in scheduled command:', error);
      }
    },
    null, // onComplete
    true,  // start
    'America/Bogota' // timeZone
  );

  job.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  try {
    if (interaction.commandName === SCRAP_MESSAGES_COMMAND) {
      await processMessages(interaction);
    } else if (interaction.commandName === MEME_OF_THE_YEAR_COMMAND) {
      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;
      
      const startDate = dayjs.tz('2024-01-01', 'America/Bogota').startOf('day');
      const endDate = dayjs.tz('2024-12-31', 'America/Bogota').endOf('day');
      
      const messages = await fetchMessagesInRange(channel, startDate, endDate);
      const winners = await getTopMessages(messages, LAUGH_EMOJIS);
      
      await announceYearWinners(interaction, winners);
    }
  } catch (error) {
    console.error('Error processing command:', error);
    const errorMessage = 'There was an error processing your command.';
    
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else if (!interaction.replied) {
      await interaction.reply(errorMessage);
    }
  }
});

async function processMessages(interaction: CommandInteraction): Promise<void> {
  const channelId = process.env.MEME_CHANNEL_ID;

  if (!channelId) {
    await interaction.followUp('Channel ID is not set in the environment variables.');
    return;
  }

  const channel = client.channels.cache.get(channelId) as TextChannel;

  if (!channel) {
    await interaction.followUp('Channel not found.');
    return;
  }

  const now = dayjs().tz('America/Bogota');
  const lastFriday = getLastFridayAtNoon();
  const thisFriday = lastFriday.add(7, 'day');
  const endDate = now.isBefore(thisFriday) ? now : thisFriday;

  console.log(`Fetching messages from ${lastFriday.format()} to ${endDate.format()}`);

  const allMessages = await fetchMessagesInRange(channel, lastFriday, endDate);

  if (allMessages.length === 0) {
    await interaction.followUp('No messages found in the specified date range.');
    return;
  }

  const topMemes = await getTopMessages(allMessages, LAUGH_EMOJIS);
  const topBones = await getTopMessages(allMessages, BONE_EMOJI);

  await announceWinners(interaction, topMemes, 'meme');
  await announceWinners(interaction, topBones, 'bone');

  await interaction.followUp('Ganadores anunciados!');
}

function getLastFridayAtNoon(): dayjs.Dayjs {
  const now = dayjs().tz('America/Bogota');
  let lastFriday = now.day(5).hour(12).minute(0).second(0).millisecond(0); // 5 represents Friday

  if (now.isBefore(lastFriday)) {
    lastFriday = lastFriday.subtract(1, 'week');
  }

  return lastFriday;
}

async function fetchMessagesInRange(
  channel: TextChannel,
  startDate: dayjs.Dayjs,
  endDate: dayjs.Dayjs
): Promise<Message[]> {
  let messages: Message[] = [];
  let lastMessageId: string | undefined;
  let hasMoreMessages = true;
  let iteration = 0;

  while (hasMoreMessages) {
    console.log(`Fetching messages, iteration ${iteration}`);
    const options: { limit: number; before?: string } = { limit: 100 };
    if (lastMessageId) options.before = lastMessageId;

    const fetchedMessages = await channel.messages.fetch(options);
    console.log(`Fetched ${fetchedMessages.size} messages`);

    if (fetchedMessages.size === 0) {
      hasMoreMessages = false;
      break;
    }

    const filteredMessages = fetchedMessages.filter((msg) => {
      const msgDate = dayjs(msg.createdAt);
      return msgDate.isBetween(startDate, endDate, null, '[)');
    });

    console.log(`Filtered ${filteredMessages.size} messages in date range`);

    messages.push(...filteredMessages.values());
    lastMessageId = fetchedMessages.last()?.id;

    const oldestMessageDate = dayjs(fetchedMessages.last()?.createdAt);
    if (oldestMessageDate.isBefore(startDate)) {
      console.log('Oldest message is before start date, breaking loop');
      break;
    }

    iteration++;
  }

  console.log(`Total messages collected: ${messages.length}`);
  return messages;
}

async function getTopMessages(
  messages: Message[],
  reactionEmojis: string[]
): Promise<{ message: Message; count: number; }[]> {
  const messageReactionCounts = await Promise.all(messages.map(async (message) => {
    const userIdSet = new Set<string>();
    const fetchPromises = [];
    let count = 0;
    for (const reaction of message.reactions.cache.values()) {
      if (reactionEmojis.includes(reaction.emoji.name ?? '') || reactionEmojis.includes(reaction.emoji.id ?? '')) {
        fetchPromises.push(reaction.users.fetch());
}}
  const userLists = await Promise.all(fetchPromises);
  for (const users of userLists) {
    for (const user of users) {
      if (!userIdSet.has(user[0])) {
        count += 1;
      }
      userIdSet.add(user[0]);
    }
}
    return { message, count };
  }));

  const messagesWithReactions = messageReactionCounts.filter((item) => item.count > 0);

  messagesWithReactions.sort((a, b) => b.count - a.count);

  return messagesWithReactions.slice(0, 3);
}

async function announceWinners(
  interaction: CommandInteraction,
  winners: { message: Message; count: number }[],
  contestType: string
): Promise<void> {
  if (winners.length === 0) {
    await interaction.followUp(`No winners found for ${contestType}.`);
    return;
  }

  const emoji = contestType === 'meme' ? '🎉' : '🦴';
  const contestName = contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana';

  let messageContent = `${emoji} **Ganadores del "${contestName}"** ${emoji}\n\n`;
  const attachments: { attachment: string; name: string }[] = [];

  for (const [index, winnerData] of winners.entries()) {
    const { message, count } = winnerData;
    const winnerLink = message.url;
    const line = `**#${index + 1}** - Felicitaciones, ${message.author}! Tu post ha ganado con ${count} reacciones. [Ver mensaje](${winnerLink})`;
    messageContent += line + '\n';

    const attachment = message.attachments.first();
    if (attachment) {
      attachments.push({ attachment: attachment.url, name: attachment.name });
    }
  }

  const messageOptions: BaseMessageOptions = { content: messageContent };
  if (attachments.length > 0) {
    messageOptions.files = attachments.map((a) => a.attachment);
  }

  await interaction.followUp(messageOptions);
}

async function announceYearWinners(
  interaction: CommandInteraction,
  winners: { message: Message; count: number }[]
): Promise<void> {
  if (winners.length === 0) {
    await interaction.followUp('No se encontraron memes para el año 2024 😢');
    return;
  }

  let messageContent = `🏆 **LOS MEJORES MEMES DEL 2024** 🏆\n\n`;

  for (const [index, winnerData] of winners.entries()) {
    const { message, count } = winnerData;
    const medal = index === 0 ? '👑' : index === 1 ? '🥈' : '🥉';
    const winnerLink = message.url;
    const line = `${medal} **${index + 1}° Lugar** - ¡Felicitaciones ${message.author}! Tu meme alcanzó ${count} reacciones\n${winnerLink}\n`;
    messageContent += line + '\n';
  }

  messageContent += '¡Gracias a todos por otro año lleno de risas! 🎉';

  const messageOptions: BaseMessageOptions = { content: messageContent };
  await interaction.followUp(messageOptions);
}