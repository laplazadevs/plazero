import { ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, TextChannel } from 'discord.js';
import { VoteManager } from '../services/vote-manager.js';
import { VoteData } from '../types/vote.js';
import { 
  REQUIRED_ROLE_NAME, 
  MODERACION_CHANNEL_NAME, 
  COOLDOWN_DURATION_MS,
  VOTE_DURATION_MS 
} from '../config/constants.js';
import { generateVoteId } from '../utils/vote-utils.js';
import { createVoteEmbed, createCancellationEmbed } from '../services/vote-embed.js';
import { completeVote } from './vote-completion.js';

export async function handleVoteTimeoutCommand(
  interaction: ChatInputCommandInteraction, 
  voteManager: VoteManager
): Promise<void> {
  // Defer the reply immediately to avoid timeout
  await interaction.deferReply({ ephemeral: true });
  
  const targetUser = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const initiator = interaction.user;
  
  // Check if initiator has required role
  const member = interaction.member as GuildMember;
  if (!member.roles.cache.some(role => role.name === REQUIRED_ROLE_NAME)) {
    await interaction.editReply({ content: `❌ Solo usuarios con el rol "${REQUIRED_ROLE_NAME}" pueden iniciar votaciones.` });
    return;
  }
  
  // Check if target is admin (protect admins)
  const targetMember = await interaction.guild?.members.fetch(targetUser.id);
  if (targetMember?.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ content: '❌ No puedes iniciar una votación contra un administrador.' });
    return;
  }
  
  // Check cooldown
  const now = new Date();
  const cooldownCheck = voteManager.isOnCooldown(initiator.id, COOLDOWN_DURATION_MS);
  if (cooldownCheck.onCooldown) {
    await interaction.editReply({ content: `❌ Debes esperar ${cooldownCheck.remainingTime} minutos antes de iniciar otra votación.` });
    return;
  }
  
  // Check if there's already an active vote for this user
  if (voteManager.hasActiveVoteAgainst(targetUser.id)) {
    await interaction.editReply({ content: '❌ Ya hay una votación activa para este usuario.' });
    return;
  }
  
  // Get moderation channel
  const moderacionChannel = interaction.guild?.channels.cache.find(
    channel => channel.name === MODERACION_CHANNEL_NAME && channel.isTextBased()
  ) as TextChannel;
  
  if (!moderacionChannel) {
    await interaction.editReply({ content: `❌ No se encontró el canal #${MODERACION_CHANNEL_NAME}.` });
    return;
  }
  
  // Create vote
  const voteId = generateVoteId();
  const voteData: VoteData = {
    id: voteId,
    targetUser,
    initiator,
    reason,
    startTime: now,
    upVotes: new Map(),
    downVotes: new Map(),
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
  await voteMessage.react('⬜');
  
  // Update vote data with message ID
  voteData.messageId = voteMessage.id;
  voteManager.addVote(voteData);
  
  // Set cooldown for initiator
  voteManager.setCooldown(initiator.id, now);
  
  // Schedule vote completion
  setTimeout(() => {
    completeVote(voteId, voteManager);
  }, VOTE_DURATION_MS);
  
  // Notify target user
  try {
    await targetUser.send(`⚠️ Se ha iniciado una votación de timeout en tu contra en el servidor **${interaction.guild?.name}**.\n**Razón:** ${reason}\n**Iniciado por:** ${initiator.username}\n\nLa votación durará 5 minutos.`);
  } catch {
    // User might have DMs disabled
  }
  
  await interaction.editReply({ content: `✅ Votación iniciada contra ${targetUser.username} en #${MODERACION_CHANNEL_NAME}. ID: \`${voteId}\`` });
}

export async function handleCancelVoteCommand(
  interaction: ChatInputCommandInteraction, 
  voteManager: VoteManager
): Promise<void> {
  // Defer the reply immediately to avoid timeout
  await interaction.deferReply({ ephemeral: true });
  
  // Check if user is admin
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ content: '❌ Solo los administradores pueden cancelar votaciones.' });
    return;
  }
  
  const voteId = interaction.options.getString('vote-id', true);
  const vote = voteManager.getVote(voteId);
  
  if (!vote) {
    await interaction.editReply({ content: '❌ No se encontró una votación con ese ID.' });
    return;
  }
  
  if (vote.completed) {
    await interaction.editReply({ content: '❌ Esta votación ya ha sido completada.' });
    return;
  }
  
  // Mark as completed to prevent further processing
  voteManager.completeVote(voteId);
  
  // Update the vote message to show cancellation
  const channel = interaction.client.channels.cache.get(vote.channelId) as TextChannel;
  if (channel) {
    const message = await channel.messages.fetch(vote.messageId);
    const cancelEmbed = createCancellationEmbed(vote, interaction.user.username);
    await message.edit({ embeds: [cancelEmbed] });
  }
  
  // Notify target user
  try {
    await vote.targetUser.send(`✅ La votación de timeout en tu contra ha sido cancelada por un administrador en **${interaction.guild?.name}**.`);
  } catch {
    // User might have DMs disabled
  }
  
  await interaction.editReply({ content: `✅ Votación \`${voteId}\` cancelada exitosamente.` });
}
