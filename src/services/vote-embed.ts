import { EmbedBuilder } from 'discord.js';
import { VoteData } from '../types/vote.js';
import { VOTE_THRESHOLDS, VOTE_DURATION_MS } from '../config/constants.js';
import { calculateVoteCounts } from '../utils/vote-utils.js';

export function createVoteEmbed(vote: VoteData): EmbedBuilder {
  const { upVoteCount, downVoteCount, netVotes } = calculateVoteCounts(vote.upVotes, vote.downVotes);
  
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
    .setColor(netVotes >= 5 ? 0xff4444 : 0xffaa00)
    .setTimestamp(vote.startTime)
    .setFooter({ text: 'Reacciona con 👍 para aprobar, 👎 para rechazar, o ⬜ para ser tibio (y recibir 1 min de timeout)' });
  
  return embed;
}

export function createCompletionEmbed(vote: VoteData, netVotes: number, upVoteCount: number, downVoteCount: number, timeoutApplied: boolean, timeoutLabel?: string, error?: boolean): EmbedBuilder {
  if (error) {
    return new EmbedBuilder()
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

  if (timeoutApplied) {
    return new EmbedBuilder()
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
  }

  return new EmbedBuilder()
    .setTitle('❌ Votación Rechazada')
    .setDescription(
      `**Usuario:** ${vote.targetUser.username}\n` +
      `**Razón:** ${vote.reason}\n` +
      `**Votos finales:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos)\n` +
      `**Resultado:** No se alcanzaron los votos necesarios (mínimo 5)`
    )
    .setColor(0x808080)
    .setTimestamp();
}

export function createCancellationEmbed(vote: VoteData, cancelledBy: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🛑 Votación Cancelada por Administrador')
    .setDescription(
      `**Usuario:** ${vote.targetUser.username}\n` +
      `**Razón:** ${vote.reason}\n` +
      `**Iniciado por:** ${vote.initiator.username}\n` +
      `**Cancelado por:** ${cancelledBy}`
    )
    .setColor(0x808080)
    .setTimestamp();
}
