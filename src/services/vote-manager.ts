import { VoteData } from '../types/vote.js';

export class VoteManager {
  private activeVotes = new Map<string, VoteData>();
  private userCooldowns = new Map<string, Date>();

  // Get active vote by ID
  getVote(voteId: string): VoteData | undefined {
    return this.activeVotes.get(voteId);
  }

  // Get vote by message ID
  getVoteByMessageId(messageId: string): VoteData | undefined {
    return Array.from(this.activeVotes.values()).find(vote => vote.messageId === messageId);
  }

  // Add new vote
  addVote(vote: VoteData): void {
    this.activeVotes.set(vote.id, vote);
  }

  // Remove vote (cleanup)
  removeVote(voteId: string): boolean {
    return this.activeVotes.delete(voteId);
  }

  // Mark vote as completed and schedule cleanup
  completeVote(voteId: string): void {
    const vote = this.activeVotes.get(voteId);
    if (vote) {
      vote.completed = true;
      // Schedule cleanup after 30 seconds to allow for final message updates
      setTimeout(() => {
        this.removeVote(voteId);
        console.log(`Cleaned up completed vote: ${voteId}`);
      }, 30000);
    }
  }

  // Check if user has an active vote against them
  hasActiveVoteAgainst(userId: string): boolean {
    return Array.from(this.activeVotes.values()).some(vote => 
      vote.targetUser.id === userId && !vote.completed
    );
  }

  // Get all active votes
  getAllActiveVotes(): VoteData[] {
    return Array.from(this.activeVotes.values()).filter(vote => !vote.completed);
  }

  // Cooldown management
  setCooldown(userId: string, time: Date): void {
    this.userCooldowns.set(userId, time);
  }

  getCooldown(userId: string): Date | undefined {
    return this.userCooldowns.get(userId);
  }

  // Check if user is on cooldown
  isOnCooldown(userId: string, cooldownDuration: number): { onCooldown: boolean; remainingTime?: number } {
    const lastVoteTime = this.userCooldowns.get(userId);
    if (!lastVoteTime) return { onCooldown: false };

    const now = Date.now();
    const timePassed = now - lastVoteTime.getTime();
    
    if (timePassed < cooldownDuration) {
      const remainingTime = Math.ceil((cooldownDuration - timePassed) / 60000);
      return { onCooldown: true, remainingTime };
    }
    
    return { onCooldown: false };
  }

  // Clean up expired cooldowns (optional maintenance)
  cleanupExpiredCooldowns(cooldownDuration: number): void {
    const now = Date.now();
    for (const [userId, time] of this.userCooldowns.entries()) {
      if (now - time.getTime() >= cooldownDuration) {
        this.userCooldowns.delete(userId);
      }
    }
  }

  // Get statistics
  getStats() {
    return {
      activeVotes: this.activeVotes.size,
      completedVotes: Array.from(this.activeVotes.values()).filter(vote => vote.completed).length,
      ongoingVotes: Array.from(this.activeVotes.values()).filter(vote => !vote.completed).length,
      userCooldowns: this.userCooldowns.size
    };
  }
}
