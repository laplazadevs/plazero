import { User } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import { UserRepository } from '../repositories/user-repository.js';
import { WelcomeRepository } from '../repositories/welcome-repository.js';
import { WelcomeData } from '../types/welcome.js';

export class WelcomeManager {
    private welcomeRepo: WelcomeRepository;
    private userRepo: UserRepository;

    constructor() {
        this.welcomeRepo = new WelcomeRepository();
        this.userRepo = new UserRepository();
    }

    async createWelcomeRequest(
        user: User,
        messageId: string,
        channelId: string
    ): Promise<WelcomeData> {
        const requestId = uuidv4();

        const welcomeData = await this.welcomeRepo.createWelcomeRequest(
            requestId,
            user,
            messageId,
            channelId
        );

        return await this.convertToWelcomeData(welcomeData, user);
    }

    async getWelcomeRequest(id: string): Promise<WelcomeData | undefined> {
        console.log(`🔧 WelcomeManager.getWelcomeRequest called with id:`, id);
        
        const requestData = await this.welcomeRepo.getWelcomeRequest(id);
        console.log(`🔧 Retrieved requestData from repository:`, requestData);
        
        if (!requestData) {
            console.log(`🔧 No request data found for id:`, id);
            return undefined;
        }

        const userData = await this.userRepo.getUser(requestData.user_id);
        if (!userData) {
            console.log(`🔧 No user data found for user_id:`, requestData.user_id);
            return undefined;
        }

        const user = this.convertToUser(userData);
        const welcomeData = await this.convertToWelcomeData(requestData, user);
        console.log(`🔧 Converted to WelcomeData:`, welcomeData);
        return welcomeData;
    }

    async getWelcomeRequestByMessageId(messageId: string): Promise<WelcomeData | undefined> {
        const requestData = await this.welcomeRepo.getWelcomeRequestByMessageId(messageId);
        if (!requestData) return undefined;

        const userData = await this.userRepo.getUser(requestData.user_id);
        if (!userData) return undefined;

        const user = this.convertToUser(userData);
        return await this.convertToWelcomeData(requestData, user);
    }

    async updateWelcomeRequest(id: string, updates: Partial<WelcomeData>): Promise<boolean> {
        console.log(`🔧 WelcomeManager.updateWelcomeRequest called with:`, { id, updates });
        
        const dbUpdates: any = {};

        if (updates.linkedinUrl !== undefined) {
            dbUpdates.linkedin_url = updates.linkedinUrl;
        }
        if (updates.presentation !== undefined) {
            dbUpdates.presentation = updates.presentation;
        }
        if (updates.invitedBy !== undefined) {
            dbUpdates.invited_by = updates.invitedBy;
        }
        if (updates.messageId !== undefined) {
            dbUpdates.message_id = updates.messageId;
        }

        console.log(`🔧 Converted to dbUpdates:`, dbUpdates);
        const result = await this.welcomeRepo.updateWelcomeRequest(id, dbUpdates);
        console.log(`🔧 Repository update result:`, result);
        return result;
    }

    async approveWelcomeRequest(id: string, approvedBy: User): Promise<boolean> {
        const success = await this.welcomeRepo.approveWelcomeRequest(id, approvedBy);
        return success;
    }

    async getAllPendingRequests(): Promise<WelcomeData[]> {
        const pendingRequests = await this.welcomeRepo.getPendingRequests();
        const result: WelcomeData[] = [];

        for (const requestData of pendingRequests) {
            const userData = await this.userRepo.getUser(requestData.user_id);
            if (userData) {
                const user = this.convertToUser(userData);
                result.push(await this.convertToWelcomeData(requestData, user));
            }
        }

        return result;
    }

    async getAllApprovedRequests(): Promise<WelcomeData[]> {
        const approvedRequests = await this.welcomeRepo.getApprovedRequests();
        const result: WelcomeData[] = [];

        for (const requestData of approvedRequests) {
            const userData = await this.userRepo.getUser(requestData.user_id);
            if (userData) {
                const user = this.convertToUser(userData);
                result.push(await this.convertToWelcomeData(requestData, user));
            }
        }

        return result;
    }

    async removeWelcomeRequest(id: string): Promise<boolean> {
        return await this.welcomeRepo.deleteWelcomeRequest(id);
    }

    async getStats(): Promise<{ total: number; pending: number; approved: number }> {
        return await this.welcomeRepo.getWelcomeStats();
    }

    // Helper methods
    private async convertToWelcomeData(requestData: any, user: User): Promise<WelcomeData> {
        const result: WelcomeData = {
            id: requestData.id,
            user,
            joinTime: requestData.join_time,
            messageId: requestData.message_id,
            channelId: requestData.channel_id,
            approved: requestData.approved,
        };

        if (requestData.linkedin_url) {
            result.linkedinUrl = requestData.linkedin_url;
        }
        if (requestData.presentation) {
            result.presentation = requestData.presentation;
        }
        if (requestData.invited_by) {
            result.invitedBy = requestData.invited_by;
        }
        if (requestData.approved_by_id) {
            // Fetch the approver user data
            const approverData = await this.userRepo.getUser(requestData.approved_by_id);
            if (approverData) {
                result.approvedBy = this.convertToUser(approverData);
            }
        }
        if (requestData.approved_at) {
            result.approvedAt = requestData.approved_at;
        }

        return result;
    }

    private convertToUser(userData: any): User {
        return {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatarURL: () => userData.avatar_url,
        } as User;
    }
}
