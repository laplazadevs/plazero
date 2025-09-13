import { Message, TextChannel } from 'discord.js';

import { WELCOME_CHANNEL_NAME } from '../config/constants.js';
import { createWelcomeButtonRow, createWelcomeEmbed } from '../services/welcome-embed.js';
import { WelcomeManager } from '../services/welcome-manager.js';

interface ParsedWelcomeInfo {
    linkedinUrl?: string;
    presentation?: string;
    invitedBy?: string;
}

function parseWelcomeMessage(messageContent: string): ParsedWelcomeInfo {
    const result: ParsedWelcomeInfo = {};
    const content = messageContent.toLowerCase();
    
    // Parse LinkedIn URL - more flexible patterns
    const linkedinPatterns = [
        /https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?/gi,
        /linkedin\.com\/in\/[a-zA-Z0-9-]+/gi,
        /linked\.in\/[a-zA-Z0-9-]+/gi
    ];
    
    for (const pattern of linkedinPatterns) {
        const match = messageContent.match(pattern);
        if (match) {
            result.linkedinUrl = match[0];
            break;
        }
    }
    
    // Parse presentation - handle various formats
    if (content.includes('soy') || content.includes('me llamo') || content.includes('mi nombre') || 
        content.includes('trabajo') || content.includes('estudio') || content.includes('experiencia') ||
        content.includes('presentación') || content.includes('hola, soy') || content.includes('hola soy') ||
        content.includes('soy de') || content.includes('vivo en') || content.includes('tengo') ||
        content.includes('me dedico') || content.includes('estoy estudiando') || content.includes('estoy trabajando')) {
        
        let presentationText = messageContent;
        
        // Handle structured formats (bullet points, numbered lists, etc.)
        if (content.includes('•') || content.includes('-') || content.includes('*') || /\d+\./.test(messageContent)) {
            const lines = messageContent.split('\n');
            const presentationLines = lines.filter(line => {
                const lowerLine = line.toLowerCase();
                return lowerLine.includes('presentación') || 
                       lowerLine.includes('soy') || 
                       lowerLine.includes('me llamo') ||
                       lowerLine.includes('mi nombre') ||
                       lowerLine.includes('trabajo') ||
                       lowerLine.includes('estudio') ||
                       lowerLine.includes('experiencia') ||
                       lowerLine.includes('soy de') ||
                       lowerLine.includes('vivo en') ||
                       lowerLine.includes('tengo') ||
                       lowerLine.includes('me dedico') ||
                       lowerLine.includes('estoy estudiando') ||
                       lowerLine.includes('estoy trabajando');
            });
            
            if (presentationLines.length > 0) {
                presentationText = presentationLines.map(line => {
                    // Extract text after bullet point/number and colon
                    const match = line.match(/[•\-*]\s*[^:]*:\s*(.+)/) || line.match(/\d+\.\s*[^:]*:\s*(.+)/);
                    if (match) {
                        return match[1].trim();
                    }
                    // Remove bullet points/numbers from the beginning
                    return line.replace(/^[•\-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                }).join(' ').trim();
            }
        } else {
            // For unstructured messages, try to extract the most relevant part
            // Look for sentences that contain introduction keywords
            const sentences = messageContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const relevantSentences = sentences.filter(sentence => {
                const lowerSentence = sentence.toLowerCase();
                return lowerSentence.includes('soy') || 
                       lowerSentence.includes('me llamo') ||
                       lowerSentence.includes('mi nombre') ||
                       lowerSentence.includes('trabajo') ||
                       lowerSentence.includes('estudio') ||
                       lowerSentence.includes('experiencia') ||
                       lowerSentence.includes('soy de') ||
                       lowerSentence.includes('vivo en') ||
                       lowerSentence.includes('tengo') ||
                       lowerSentence.includes('me dedico') ||
                       lowerSentence.includes('estoy estudiando') ||
                       lowerSentence.includes('estoy trabajando');
            });
            
            if (relevantSentences.length > 0) {
                presentationText = relevantSentences.join('. ').trim();
            }
        }
        
        // Only set if we have substantial content (more than 20 characters)
        if (presentationText.length > 20) {
            result.presentation = presentationText;
        }
    }
    
    // Parse invitation information - handle various formats
    if (content.includes('invit') || content.includes('trajo') || content.includes('me trajo') ||
        content.includes('me invitó') || content.includes('invitado por') || content.includes('quien te invitó') ||
        content.includes('me trajo') || content.includes('me recomendó') || content.includes('conocí por') ||
        content.includes('vine por') || content.includes('me uní por')) {
        
        let invitationText = messageContent;
        
        // Handle structured formats
        if (content.includes('•') || content.includes('-') || content.includes('*') || /\d+\./.test(messageContent)) {
            const lines = messageContent.split('\n');
            const invitationLines = lines.filter(line => {
                const lowerLine = line.toLowerCase();
                return lowerLine.includes('invit') || 
                       lowerLine.includes('trajo') ||
                       lowerLine.includes('quien te invitó') ||
                       lowerLine.includes('me recomendó') ||
                       lowerLine.includes('conocí por') ||
                       lowerLine.includes('vine por') ||
                       lowerLine.includes('me uní por');
            });
            
            if (invitationLines.length > 0) {
                invitationText = invitationLines.map(line => {
                    const match = line.match(/[•\-*]\s*[^:]*:\s*(.+)/) || line.match(/\d+\.\s*[^:]*:\s*(.+)/);
                    if (match) {
                        return match[1].trim();
                    }
                    return line.replace(/^[•\-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                }).join(' ').trim();
            }
        } else {
            // For unstructured messages, look for sentences with invitation keywords
            const sentences = messageContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const relevantSentences = sentences.filter(sentence => {
                const lowerSentence = sentence.toLowerCase();
                return lowerSentence.includes('invit') || 
                       lowerSentence.includes('trajo') ||
                       lowerSentence.includes('me recomendó') ||
                       lowerSentence.includes('conocí por') ||
                       lowerSentence.includes('vine por') ||
                       lowerSentence.includes('me uní por');
            });
            
            if (relevantSentences.length > 0) {
                invitationText = relevantSentences.join('. ').trim();
            }
        }
        
        result.invitedBy = invitationText;
    }
    
    return result;
}

export async function handleWelcomeMessage(
    message: Message,
    welcomeManager: WelcomeManager
): Promise<void> {
    // Only process messages in the welcome channel
    if (
        !message.channel.isTextBased() ||
        (message.channel as TextChannel).name !== WELCOME_CHANNEL_NAME ||
        message.author.bot
    ) {
        return;
    }

    try {
        // Find the welcome request for this user
        const welcomeRequests = await welcomeManager.getAllPendingRequests();
        const userWelcomeRequest = welcomeRequests.find(
            request => request.user.id === message.author.id && !request.approved
        );

        if (!userWelcomeRequest) {
            return; // No pending welcome request for this user
        }

        // Parse the message for different types of information
        const parsedInfo = parseWelcomeMessage(message.content);
        let updated = false;
        
        // Update LinkedIn URL if found and not already set
        if (parsedInfo.linkedinUrl && !userWelcomeRequest.linkedinUrl) {
            await welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                linkedinUrl: parsedInfo.linkedinUrl,
            });
            updated = true;
        }

        // Update presentation if found and not already set
        if (parsedInfo.presentation && !userWelcomeRequest.presentation) {
            await welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                presentation: parsedInfo.presentation,
            });
            updated = true;
        }

        // Update invitation info if found and not already set
        if (parsedInfo.invitedBy && !userWelcomeRequest.invitedBy) {
            await welcomeManager.updateWelcomeRequest(userWelcomeRequest.id, {
                invitedBy: parsedInfo.invitedBy,
            });
            updated = true;
        }

        // If any information was updated, refresh the embed
        if (updated) {
            console.log(`🔧 Information was updated, refreshing embed for request:`, userWelcomeRequest.id);
            
            const updatedRequest = await welcomeManager.getWelcomeRequest(userWelcomeRequest.id);
            if (updatedRequest) {
                console.log(`🔧 Retrieved updated request messageId:`, updatedRequest.messageId);
                console.log(`🔧 Retrieved updated request channelId:`, updatedRequest.channelId);
                console.log(`🔧 Message channel ID:`, message.channel.id);
                
                const embed = createWelcomeEmbed(updatedRequest);
                const buttonRow = createWelcomeButtonRow(updatedRequest);

                // Find the original welcome message and update it
                const channel = message.channel;
                try {
                    console.log(`🔧 Attempting to fetch message with ID:`, updatedRequest.messageId);
                    const originalMessage = await channel.messages.fetch(updatedRequest.messageId);
                    console.log(`🔧 Fetched message:`, originalMessage ? 'SUCCESS' : 'FAILED');
                    console.log(`🔧 Message has edit function:`, typeof originalMessage?.edit === 'function');
                    
                    if (originalMessage && typeof originalMessage.edit === 'function') {
                        await originalMessage.edit({
                            embeds: [embed],
                            components: [buttonRow],
                        });
                        console.log(`🔧 Successfully updated welcome message:`, updatedRequest.messageId);
                    } else {
                        console.warn(`🔧 Original message not found or cannot be edited:`, updatedRequest.messageId);
                        console.warn(`🔧 Message object:`, originalMessage);
                    }
                } catch (error) {
                    console.error(`🔧 Error updating welcome message:`, error);
                    console.error(`🔧 Error details:`, {
                        messageId: updatedRequest.messageId,
                        channelId: updatedRequest.channelId,
                        currentChannelId: message.channel.id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            } else {
                console.warn(`🔧 Could not retrieve updated welcome request:`, userWelcomeRequest.id);
            }
        }
    } catch (error) {
        console.error('Error handling welcome message:', error);
    }
}
