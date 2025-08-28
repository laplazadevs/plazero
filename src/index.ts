import { CronJob } from 'cron';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BaseMessageOptions, Client, CommandInteraction, ChatInputCommandInteraction, Events, GatewayIntentBits, Message, TextChannel, EmbedBuilder, User, GuildMember, PermissionFlagsBits } from 'discord.js';
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
const VOTE_TIMEOUT_COMMAND = 'vote-timeout';
const CANCEL_VOTE_COMMAND = 'cancel-vote';

// Voting system configuration
const VOTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 1 hour
const REQUIRED_ROLE_NAME = 'One Of Us';
const MODERACION_CHANNEL_NAME = 'moderacion';

// Vote thresholds and corresponding timeout durations
const VOTE_THRESHOLDS = [
  { votes: 3, duration: 5 * 60 * 1000, label: 'Light Warning (5 min)' },
  { votes: 5, duration: 30 * 60 * 1000, label: 'Moderate Sanction (30 min)' },
  { votes: 8, duration: 2 * 60 * 60 * 1000, label: 'Serious Violation (2 hours)' },
  { votes: 12, duration: 24 * 60 * 60 * 1000, label: 'Severe Misconduct (24 hours)' }
];

// In-memory storage for active votes and cooldowns
interface VoteData {
  id: string;
  targetUser: User;
  initiator: User;
  reason: string;
  startTime: Date;
  upVotes: Set<string>;
  downVotes: Set<string>;
  messageId: string;
  channelId: string;
  completed: boolean;
}

const activeVotes = new Map<string, VoteData>();
const userCooldowns = new Map<string, Date>();

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
        } as unknown as ChatInputCommandInteraction;

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
  if (!interaction.isChatInputCommand()) return;

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
    } else if (interaction.commandName === VOTE_TIMEOUT_COMMAND) {
      await handleVoteTimeoutCommand(interaction);
    } else if (interaction.commandName === CANCEL_VOTE_COMMAND) {
      await handleCancelVoteCommand(interaction);
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

// Handle reactions for voting
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  
  const message = reaction.message;
  const activeVote = Array.from(activeVotes.values()).find(vote => vote.messageId === message.id);
  
  if (!activeVote || activeVote.completed) return;
  
  if (reaction.emoji.name === '👍') {
    activeVote.upVotes.add(user.id);
    activeVote.downVotes.delete(user.id);
  } else if (reaction.emoji.name === '👎') {
    activeVote.downVotes.add(user.id);
    activeVote.upVotes.delete(user.id);
  }
  
  await updateVoteMessage(activeVote);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  
  const message = reaction.message;
  const activeVote = Array.from(activeVotes.values()).find(vote => vote.messageId === message.id);
  
  if (!activeVote || activeVote.completed) return;
  
  if (reaction.emoji.name === '👍') {
    activeVote.upVotes.delete(user.id);
  } else if (reaction.emoji.name === '👎') {
    activeVote.downVotes.delete(user.id);
  }
  
  await updateVoteMessage(activeVote);
});

async function processMessages(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const messageOptions: BaseMessageOptions = { content: messageContent };
  if (attachments.length > 0) {
    messageOptions.files = attachments.map((a) => a.attachment);
  }

  await interaction.followUp(messageOptions);
}

async function announceYearWinners(
  interaction: ChatInputCommandInteraction,
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

// Voting system functions
async function handleVoteTimeoutCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const initiator = interaction.user;
  
  // Check if initiator has required role
  const member = interaction.member as GuildMember;
  if (!member.roles.cache.some(role => role.name === REQUIRED_ROLE_NAME)) {
    await interaction.reply({ content: `❌ Solo usuarios con el rol "${REQUIRED_ROLE_NAME}" pueden iniciar votaciones.`, ephemeral: true });
    return;
  }
  
  // Check if target is admin (protect admins)
  const targetMember = await interaction.guild?.members.fetch(targetUser.id);
  if (targetMember?.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ No puedes iniciar una votación contra un administrador.', ephemeral: true });
    return;
  }
  
  // Check cooldown
  const now = new Date();
  const lastVoteTime = userCooldowns.get(initiator.id);
  if (lastVoteTime && (now.getTime() - lastVoteTime.getTime()) < COOLDOWN_DURATION_MS) {
    const remainingTime = Math.ceil((COOLDOWN_DURATION_MS - (now.getTime() - lastVoteTime.getTime())) / 60000);
    await interaction.reply({ content: `❌ Debes esperar ${remainingTime} minutos antes de iniciar otra votación.`, ephemeral: true });
    return;
  }
  
  // Check if there's already an active vote for this user
  const existingVote = Array.from(activeVotes.values()).find(vote => 
    vote.targetUser.id === targetUser.id && !vote.completed
  );
  if (existingVote) {
    await interaction.reply({ content: '❌ Ya hay una votación activa para este usuario.', ephemeral: true });
    return;
  }
  
  // Get moderation channel
  const moderacionChannel = interaction.guild?.channels.cache.find(
    channel => channel.name === MODERACION_CHANNEL_NAME && channel.isTextBased()
  ) as TextChannel;
  
  if (!moderacionChannel) {
    await interaction.reply({ content: `❌ No se encontró el canal #${MODERACION_CHANNEL_NAME}.`, ephemeral: true });
    return;
  }
  
  // Create vote
  const voteId = `vote_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const voteData: VoteData = {
    id: voteId,
    targetUser,
    initiator,
    reason,
    startTime: now,
    upVotes: new Set(),
    downVotes: new Set(),
    messageId: '',
    channelId: moderacionChannel.id,
    completed: false
  };
  
  // Create embed message
  const embed = createVoteEmbed(voteData);
  const voteMessage = await moderacionChannel.send({ embeds: [embed] });
  
  // Add reactions
  await voteMessage.react('👍');
  await voteMessage.react('👎');
  
  // Update vote data with message ID
  voteData.messageId = voteMessage.id;
  activeVotes.set(voteId, voteData);
  
  // Set cooldown for initiator
  userCooldowns.set(initiator.id, now);
  
  // Schedule vote completion
  setTimeout(() => completeVote(voteId), VOTE_DURATION_MS);
  
  // Notify target user
  try {
    await targetUser.send(`⚠️ Se ha iniciado una votación de timeout en tu contra en el servidor **${interaction.guild?.name}**.\n**Razón:** ${reason}\n**Iniciado por:** ${initiator.username}\n\nLa votación durará 5 minutos.`);
  } catch {
    // User might have DMs disabled
  }
  
  await interaction.reply({ content: `✅ Votación iniciada contra ${targetUser.username} en #${MODERACION_CHANNEL_NAME}. ID: \`${voteId}\``, ephemeral: true });
}

async function handleCancelVoteCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check if user is admin
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ Solo los administradores pueden cancelar votaciones.', ephemeral: true });
    return;
  }
  
  const voteId = interaction.options.getString('vote-id', true);
  const vote = activeVotes.get(voteId);
  
  if (!vote) {
    await interaction.reply({ content: '❌ No se encontró una votación con ese ID.', ephemeral: true });
    return;
  }
  
  if (vote.completed) {
    await interaction.reply({ content: '❌ Esta votación ya ha sido completada.', ephemeral: true });
    return;
  }
  
  // Mark as completed to prevent further processing
  vote.completed = true;
  
  // Update the vote message to show cancellation
  const channel = client.channels.cache.get(vote.channelId) as TextChannel;
  if (channel) {
    const message = await channel.messages.fetch(vote.messageId);
    const cancelEmbed = new EmbedBuilder()
      .setTitle('🛑 Votación Cancelada por Administrador')
      .setDescription(`**Usuario:** ${vote.targetUser.username}\n**Razón:** ${vote.reason}\n**Iniciado por:** ${vote.initiator.username}\n**Cancelado por:** ${interaction.user.username}`)
      .setColor(0x808080)
      .setTimestamp();
    
    await message.edit({ embeds: [cancelEmbed] });
  }
  
  // Notify target user
  try {
    await vote.targetUser.send(`✅ La votación de timeout en tu contra ha sido cancelada por un administrador en **${interaction.guild?.name}**.`);
  } catch {
    // User might have DMs disabled
  }
  
  // Remove from active votes
  activeVotes.delete(voteId);
  
  await interaction.reply({ content: `✅ Votación \`${voteId}\` cancelada exitosamente.`, ephemeral: true });
}

function createVoteEmbed(vote: VoteData): EmbedBuilder {
  const upVoteCount = vote.upVotes.size;
  const downVoteCount = vote.downVotes.size;
  const netVotes = upVoteCount - downVoteCount;
  
  // Determine current threshold
  let currentThreshold = VOTE_THRESHOLDS[0];
  for (const threshold of VOTE_THRESHOLDS) {
    if (netVotes >= threshold.votes) {
      currentThreshold = threshold;
    }
  }
  
  const timeRemaining = Math.max(0, VOTE_DURATION_MS - (Date.now() - vote.startTime.getTime()));
  const minutesRemaining = Math.ceil(timeRemaining / 60000);
  
  const embed = new EmbedBuilder()
    .setTitle('⚖️ Votación de Timeout')
    .setDescription(
      `**Usuario:** ${vote.targetUser.username}\n` +
      `**Razón:** ${vote.reason}\n` +
      `**Iniciado por:** ${vote.initiator.username}\n\n` +
      `**Votos a favor:** 👍 ${upVoteCount}\n` +
      `**Votos en contra:** 👎 ${downVoteCount}\n` +
      `**Votos netos:** ${netVotes}\n\n` +
      `**Sanción actual:** ${currentThreshold.label}\n` +
      `**Tiempo restante:** ${minutesRemaining} minuto(s)\n\n` +
      `**ID de votación:** \`${vote.id}\``
    )
    .setColor(netVotes >= 3 ? 0xff4444 : 0xffaa00)
    .setTimestamp(vote.startTime)
    .setFooter({ text: 'Reacciona con 👍 para aprobar o 👎 para rechazar' });
  
  return embed;
}

async function updateVoteMessage(vote: VoteData): Promise<void> {
  if (vote.completed) return;
  
  const channel = client.channels.cache.get(vote.channelId) as TextChannel;
  if (!channel) return;
  
  try {
    const message = await channel.messages.fetch(vote.messageId);
    const embed = createVoteEmbed(vote);
    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating vote message:', error);
  }
}

async function completeVote(voteId: string): Promise<void> {
  const vote = activeVotes.get(voteId);
  if (!vote || vote.completed) return;
  
  vote.completed = true;
  
  const upVoteCount = vote.upVotes.size;
  const downVoteCount = vote.downVotes.size;
  const netVotes = upVoteCount - downVoteCount;
  
  const channel = client.channels.cache.get(vote.channelId) as TextChannel;
  if (!channel) return;
  
  let resultEmbed: EmbedBuilder;
  let timeoutApplied = false;
  let timeoutDuration = 0;
  let timeoutLabel = '';
  
  if (netVotes >= 3) {
    // Find the appropriate timeout duration
    let selectedThreshold = VOTE_THRESHOLDS[0];
    for (const threshold of VOTE_THRESHOLDS) {
      if (netVotes >= threshold.votes) {
        selectedThreshold = threshold;
      }
    }
    
    timeoutDuration = selectedThreshold.duration;
    timeoutLabel = selectedThreshold.label;
    
    // Apply timeout
    try {
      const guild = channel.guild;
      const targetMember = await guild.members.fetch(vote.targetUser.id);
      await targetMember.timeout(timeoutDuration, `Votación comunitaria: ${vote.reason}`);
      timeoutApplied = true;
      
      resultEmbed = new EmbedBuilder()
        .setTitle('✅ Timeout Aplicado')
        .setDescription(
          `**Usuario:** ${vote.targetUser.username}\n` +
          `**Razón:** ${vote.reason}\n` +
          `**Votos finales:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)\n` +
          `**Sanción:** ${timeoutLabel}\n` +
          `**Aplicado por:** Votación comunitaria`
        )
        .setColor(0x00ff00)
        .setTimestamp();
    } catch (error) {
      console.error('Error applying timeout:', error);
      resultEmbed = new EmbedBuilder()
        .setTitle('❌ Error al Aplicar Timeout')
        .setDescription(
          `**Usuario:** ${vote.targetUser.username}\n` +
          `**Razón:** ${vote.reason}\n` +
          `**Votos finales:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)\n` +
          `**Error:** No se pudo aplicar el timeout`
        )
        .setColor(0xff0000)
        .setTimestamp();
    }
  } else {
    resultEmbed = new EmbedBuilder()
      .setTitle('❌ Votación Rechazada')
      .setDescription(
        `**Usuario:** ${vote.targetUser.username}\n` +
        `**Razón:** ${vote.reason}\n` +
        `**Votos finales:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)\n` +
        `**Resultado:** No se alcanzaron los votos necesarios (mínimo 3)`
      )
      .setColor(0x808080)
      .setTimestamp();
  }
  
  // Update the vote message
  try {
    const message = await channel.messages.fetch(vote.messageId);
    await message.edit({ embeds: [resultEmbed] });
  } catch (error) {
    console.error('Error updating final vote message:', error);
  }
  
  // Notify target user
  try {
    if (timeoutApplied) {
      const timeoutMinutes = Math.floor(timeoutDuration / 60000);
      const timeoutHours = Math.floor(timeoutMinutes / 60);
      let durationText = '';
      
      if (timeoutHours > 0) {
        durationText = `${timeoutHours} hora(s)`;
      } else {
        durationText = `${timeoutMinutes} minuto(s)`;
      }
      
      await vote.targetUser.send(
        `⚠️ Se te ha aplicado un timeout de **${durationText}** en **${channel.guild.name}**.\n` +
        `**Razón:** ${vote.reason}\n` +
        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)`
      );
    } else {
      await vote.targetUser.send(
        `✅ La votación de timeout en tu contra ha sido rechazada en **${channel.guild.name}**.\n` +
        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)`
      );
    }
  } catch {
    // User might have DMs disabled
  }
  
  // Remove from active votes
  activeVotes.delete(voteId);
}