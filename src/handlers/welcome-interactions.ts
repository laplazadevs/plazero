import { ButtonInteraction, InteractionResponse, PermissionFlagsBits } from 'discord.js';
import { Effect } from 'effect';

import { WELCOME_ROLE_NAME } from '../config/constants.js';
import { discordCall } from '../discord/DiscordClient.js';
import { DiscordError } from '../domain/errors.js';
import { createWelcomeApprovalEmbed } from '../services/welcome-embed.js';
import { WelcomeManager } from '../services/welcome-manager.js';

export const handleWelcomeButtonInteraction = Effect.fn('handleWelcomeButtonInteraction')(
    function* (interaction: ButtonInteraction) {
        if (!interaction.customId.startsWith('welcome_approve_')) {
            return;
        }

        const welcomeManager = yield* WelcomeManager;

        const reply = (content: string): Effect.Effect<InteractionResponse, DiscordError> =>
            discordCall('interaction.reply', () => interaction.reply({ content, ephemeral: true }));

        yield* Effect.gen(function* () {
            // Check if user has moderator or admin permissions
            const member = interaction.member;
            if (!member || typeof member.permissions === 'string') {
                yield* reply('❌ No tienes permisos para realizar esta acción.');
                return;
            }

            const hasPermission = member.permissions.has([
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.Administrator,
            ]);

            if (!hasPermission) {
                yield* reply(
                    '❌ Solo los moderadores y administradores pueden aprobar solicitudes de bienvenida.'
                );
                return;
            }

            // Extract welcome request ID from custom ID
            const welcomeId = interaction.customId.replace('welcome_approve_', '');
            const welcomeData = yield* welcomeManager.getWelcomeRequest(welcomeId);

            if (!welcomeData) {
                yield* reply('❌ Solicitud de bienvenida no encontrada.');
                return;
            }

            if (welcomeData.approved) {
                yield* reply('❌ Esta solicitud ya ha sido aprobada.');
                return;
            }

            // Check if user has provided all required information
            if (!welcomeData.linkedinUrl || !welcomeData.presentation || !welcomeData.invitedBy) {
                yield* reply(
                    '❌ El usuario aún no ha proporcionado toda la información requerida.'
                );
                return;
            }

            // Approve the welcome request
            const success = yield* welcomeManager.approveWelcomeRequest(
                welcomeId,
                interaction.user
            );
            if (!success) {
                yield* reply('❌ Error al aprobar la solicitud.');
                return;
            }

            const guild = interaction.guild;
            if (!guild) {
                yield* reply('❌ No se pudo acceder al servidor.');
                return;
            }

            const targetMember = yield* discordCall('guild.members.fetch', () =>
                guild.members.fetch(welcomeData.user.id)
            );
            if (!targetMember) {
                yield* reply('❌ No se pudo encontrar al usuario en el servidor.');
                return;
            }

            const welcomeRole = guild.roles.cache.find(role => role.name === WELCOME_ROLE_NAME);
            if (!welcomeRole) {
                yield* reply(`❌ No se encontró el rol "${WELCOME_ROLE_NAME}".`);
                return;
            }

            const roleAssigned = yield* discordCall('member.roles.add', () =>
                targetMember.roles.add(welcomeRole)
            ).pipe(
                Effect.as(true),
                Effect.catch(error =>
                    Effect.logError('Error assigning role:', error).pipe(Effect.as(false))
                )
            );

            if (!roleAssigned) {
                yield* reply('❌ Error al asignar el rol al usuario.');
                return;
            }

            // Get the updated welcome data with approval timestamp
            const updatedWelcomeData = yield* welcomeManager.getWelcomeRequest(welcomeId);
            if (!updatedWelcomeData) {
                yield* reply('❌ No se pudo obtener los datos actualizados de la solicitud.');
                return;
            }

            // Update the embed to show approval
            const approvalEmbed = createWelcomeApprovalEmbed(updatedWelcomeData);

            yield* discordCall('interaction.update', () =>
                interaction.update({ embeds: [approvalEmbed], components: [] })
            );

            yield* discordCall('interaction.followUp', () =>
                interaction.followUp({
                    content: `✅ Solicitud de bienvenida aprobada para ${updatedWelcomeData.user.username}. El rol "${WELCOME_ROLE_NAME}" ha sido asignado.`,
                    ephemeral: true,
                })
            );

            yield* Effect.logInfo(
                `Welcome request approved for user ${updatedWelcomeData.user.username} by ${interaction.user.username}`
            );
        }).pipe(
            Effect.catchCause(cause =>
                Effect.gen(function* () {
                    yield* Effect.logError('Error handling welcome button interaction:', cause);

                    if (!interaction.replied && !interaction.deferred) {
                        yield* discordCall('interaction.reply', () =>
                            interaction.reply({
                                content: '❌ Ocurrió un error al procesar la solicitud.',
                                ephemeral: true,
                            })
                        ).pipe(Effect.ignore);
                    }
                })
            )
        );
    }
);
