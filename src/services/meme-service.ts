import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { ChatInputCommandInteraction, Message, TextChannel } from 'discord.js';
import { LAUGH_EMOJIS, BONE_EMOJI } from '../config/constants.js';

// Extend dayjs with plugins
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);

export async function processMessages(interaction: ChatInputCommandInteraction): Promise<void> {
  // Defer if not already deferred (for scheduled runs, it won't be a real interaction)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  const channelId = process.env.MEME_CHANNEL_ID;

  if (!channelId) {
    await interaction.followUp('Channel ID is not set in the environment variables.');
    return;
  }

  const channel = interaction.client.channels.cache.get(channelId) as TextChannel;

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

export async function fetchMessagesInRange(
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

export async function getTopMessages(
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
      }
    }
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
  interaction: ChatInputCommandInteraction,
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

  const messageOptions: any = { content: messageContent };
  if (attachments.length > 0) {
    messageOptions.files = attachments.map((a) => a.attachment);
  }

  await interaction.followUp(messageOptions);
}

export async function announceYearWinners(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();
  const channel = interaction.channel as TextChannel;
  
  const startDate = dayjs.tz('2024-01-01', 'America/Bogota').startOf('day');
  const endDate = dayjs.tz('2024-12-31', 'America/Bogota').endOf('day');
  
  const messages = await fetchMessagesInRange(channel, startDate, endDate);
  const winners = await getTopMessages(messages, LAUGH_EMOJIS);

  if (winners.length === 0) {
    await interaction.editReply('No se encontraron memes para el año 2024 😢');
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

  const messageOptions: any = { content: messageContent };
  await interaction.editReply(messageOptions);
}
