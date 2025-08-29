import { TextChannel, Client } from 'discord.js';
import { VoteManager } from '../services/vote-manager.js';
import { VOTE_THRESHOLDS } from '../config/constants.js';
import { calculateVoteCounts } from '../utils/vote-utils.js';
import { createCompletionEmbed } from '../services/vote-embed.js';

let discordClient: Client | null = null;

export function setDiscordClientForCompletion(client: Client): void {
  discordClient = client;
}

export async function completeVote(voteId: string, voteManager: VoteManager): Promise<void> {
  const vote = voteManager.getVote(voteId);
  if (!vote || vote.completed || !discordClient) return;
  
  // Mark as completed first to prevent race conditions
  voteManager.completeVote(voteId);
  
  const { upVoteCount, downVoteCount, netVotes } = calculateVoteCounts(vote.upVotes, vote.downVotes);
  
  const channel = discordClient.channels.cache.get(vote.channelId) as TextChannel;
  if (!channel) return;
  
  console.log(`Completing vote ${voteId}: ${netVotes} net votes.`);
  
  let timeoutApplied = false;
  let timeoutDuration = 0;
  let timeoutLabel = '';
  let error = false;
  
  if (netVotes >= 5) {
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
      await targetMember.timeout(timeoutDuration, `Votación comunitaria: ${vote.reason}.`);
      timeoutApplied = true;
      console.log(`Applied ${timeoutLabel} timeout to ${vote.targetUser.username}.`);
    } catch (timeoutError) {
      console.error('Error applying timeout:', timeoutError);
      error = true;
    }
  }
  
  // Create result embed
  const resultEmbed = createCompletionEmbed(
    vote, 
    netVotes, 
    upVoteCount, 
    downVoteCount, 
    timeoutApplied, 
    timeoutLabel, 
    error
  );
  
  // Update the vote message
  try {
    const message = await channel.messages.fetch(vote.messageId);
    await message.edit({ embeds: [resultEmbed] });
  } catch (messageError) {
    console.error('Error updating final vote message:', messageError);
  }
  
  // Notify target user
  try {
    if (timeoutApplied) {
      const timeoutMinutes = Math.floor(timeoutDuration / 60000);
      const timeoutHours = Math.floor(timeoutMinutes / 60);
      let durationText = '';
      
      if (timeoutHours > 0) {
        durationText = `${timeoutHours} hora(s).`;
      } else {
        durationText = `${timeoutMinutes} minuto(s).`;
      }
      
      await vote.targetUser.send(
        `⚠️ Se te ha aplicado un timeout de **${durationText}** en **${channel.guild.name}**.\n` +
        `**Razón:** ${vote.reason}.\n` +
        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos.)`
      );
    } else {
      await vote.targetUser.send(
        `✅ La votación de timeout en tu contra ha sido rechazada en **${channel.guild.name}**.\n` +
        `**Votos:** 👍 ${upVoteCount} | 👎 ${downVoteCount} (${netVotes} netos.)`
      );
    }
  } catch {
    // User might have DMs disabled
  }
  
  console.log(`Vote ${voteId} completed. Result: ${timeoutApplied ? 'Timeout applied' : 'Rejected'}`);
}
