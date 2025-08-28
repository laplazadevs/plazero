import { MessageReaction, PartialMessageReaction, User, PartialUser, PermissionFlagsBits, TextChannel } from 'discord.js';
import { VoteManager } from '../services/vote-manager.js';
import { MODERACION_CHANNEL_NAME } from '../config/constants.js';
import { getVoteWeight, isVoteRelatedMessage } from '../utils/vote-utils.js';
import { updateVoteMessage } from './vote-updates.js';

export async function handleVoteReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  voteManager: VoteManager
): Promise<void> {
  if (user.bot) return;
  
  // Fetch partial data if needed
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the reaction:', error);
      return;
    }
  }
  
  if (user.partial) {
    try {
      user = await user.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the user:', error);
      return;
    }
  }
  
  const message = reaction.message;
  const emojiName = reaction.emoji.name;
  
  // Check if this is a vote message (either active or completed)
  const vote = voteManager.getVoteByMessageId(message.id);
  const isVoteMessage = vote !== undefined;
  
  // Also check if message is in moderation channel and has vote-like embeds (for completed votes)
  const isModChannelVoteMessage = !isVoteMessage && isVoteRelatedMessage(message, MODERACION_CHANNEL_NAME);
  
  // If this is any type of vote message, manage the reactions
  if (isVoteMessage || isModChannelVoteMessage) {
    // Only allow the three voting emojis
    if (emojiName !== '👍' && emojiName !== '👎' && emojiName !== '⬜') {
      // Remove any other emojis that aren't allowed
      try {
        await reaction.users.remove(user.id);
      } catch (error) {
        console.error('Error removing invalid reaction:', error);
      }
      return;
    }
    
    // Handle ⬜ (tibio) punishment for any vote message
    if (emojiName === '⬜') {
      await handleTibioReaction(reaction, user);
      return;
    }
    
    // If vote is not active or completed, don't count the vote
    if (!vote || vote.completed) {
      // For completed/non-active votes, remove the reaction to prevent confusion
      try {
        await reaction.users.remove(user.id);
      } catch (error) {
        console.error('Error removing reaction from completed vote:', error);
      }
      return;
    }
    
    // Process active vote reactions
    if (emojiName === '👍') {
      const weight = await getVoteWeight(message.guild!, user.id);
      vote.upVotes.set(user.id, weight);
      vote.downVotes.delete(user.id);
    } else if (emojiName === '👎') {
      const weight = await getVoteWeight(message.guild!, user.id);
      vote.downVotes.set(user.id, weight);
      vote.upVotes.delete(user.id);
    }
    
    await updateVoteMessage(vote);
  }
}

export async function handleVoteReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  voteManager: VoteManager
): Promise<void> {
  if (user.bot) return;
  
  // Fetch partial data if needed
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the reaction:', error);
      return;
    }
  }
  
  if (user.partial) {
    try {
      user = await user.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the user:', error);
      return;
    }
  }
  
  const message = reaction.message;
  const activeVote = voteManager.getVoteByMessageId(message.id);
  
  // Only process removal for active votes
  if (!activeVote || activeVote.completed) return;
  
  const emojiName = reaction.emoji.name;
  
  if (emojiName === '👍') {
    activeVote.upVotes.delete(user.id);
    await updateVoteMessage(activeVote);
  } else if (emojiName === '👎') {
    activeVote.downVotes.delete(user.id);
    await updateVoteMessage(activeVote);
  }
  // Note: ⬜ reactions are already removed automatically, so no need to handle removal
}

async function handleTibioReaction(reaction: MessageReaction, user: User): Promise<void> {
  try {
    const guild = reaction.message.guild;
    if (guild) {
      const member = await guild.members.fetch(user.id);
      
      // Don't timeout admins
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await member.timeout(60000, 'Votó como tibio'); // 1 minute timeout
        
        // Send punishment message to moderation channel
        const moderacionChannel = guild.channels.cache.find(
          channel => channel.name === MODERACION_CHANNEL_NAME && channel.isTextBased()
        ) as TextChannel;
        
        if (moderacionChannel) {
          await moderacionChannel.send(`${user} recibió un timeout por votar como tibio.`);
        }
      }
    }
  } catch (error) {
    console.error('Error applying tibio timeout:', error);
  }
  
  // Always remove the tibio reaction
  try {
    await reaction.users.remove(user.id);
  } catch (error) {
    console.error('Error removing tibio reaction:', error);
  }
}
