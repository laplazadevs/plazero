import { TextChannel, Client } from 'discord.js';
import { VoteData } from '../types/vote.js';
import { createVoteEmbed } from '../services/vote-embed.js';

// We'll need to store a reference to the client for this to work
let discordClient: Client | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

export async function updateVoteMessage(vote: VoteData): Promise<void> {
  if (vote.completed || !discordClient) return;
  
  const channel = discordClient.channels.cache.get(vote.channelId) as TextChannel;
  if (!channel) return;
  
  try {
    const message = await channel.messages.fetch(vote.messageId);
    const embed = createVoteEmbed(vote);
    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating vote message:', error);
  }
}
