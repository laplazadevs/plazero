import { SlashCommandBuilder } from '@discordjs/builders';
import {
    type ChatInputCommandInteraction,
    GuildMember,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';
import { Effect } from 'effect';

import { discordCall } from '../../discord/DiscordClient.js';
import { completeVote } from './VoteCompletion.js';
import {
    CANCEL_VOTE_COMMAND,
    COOLDOWN_DURATION_MS,
    generateVoteId,
    MODERACION_CHANNEL_NAME,
    REQUIRED_ROLE_NAME,
    VOTE_DURATION_MS,
    VOTE_TIMEOUT_COMMAND,
    type VoteData,
} from './VoteDomain.js';
import { createCancellationEmbed, createVoteEmbed } from './VoteEmbeds.js';
import { VoteManager } from './VoteManager.js';

export const voteSlashCommands = [
    new SlashCommandBuilder()
        .setName(VOTE_TIMEOUT_COMMAND)
        .setDescription('Inicia una votación para aplicar timeout a un usuario')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Usuario que recibirá el timeout')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason').setDescription('Razón del timeout').setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName(CANCEL_VOTE_COMMAND)
        .setDescription('Cancela una votación activa (solo admins)')
        .addStringOption(option =>
            option
                .setName('vote-id')
                .setDescription('ID de la votación a cancelar')
                .setRequired(true)
        ),
];

export const handleVoteTimeoutCommand = Effect.fn('handleVoteTimeoutCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const voteManager = yield* VoteManager;

    // Defer the reply immediately to avoid timeout
    yield* discordCall('interaction.deferReply', () => interaction.deferReply({ ephemeral: true }));

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const initiator = interaction.user;

    // Check if initiator has required role
    const member = interaction.member;
    if (
        !(member instanceof GuildMember) ||
        !member.roles.cache.some(role => role.name === REQUIRED_ROLE_NAME)
    ) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: `❌ Solo usuarios con el rol "${REQUIRED_ROLE_NAME}" pueden iniciar votaciones.`,
            })
        );
        return;
    }

    // Check if target is admin (protect admins)
    const guild = interaction.guild;
    const targetMember = guild
        ? yield* discordCall('guild.members.fetch', () => guild.members.fetch(targetUser.id))
        : undefined;
    if (targetMember?.permissions.has(PermissionFlagsBits.Administrator)) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: '❌ No puedes iniciar una votación contra un administrador.',
            })
        );
        return;
    }

    // Check cooldown
    const cooldownCheck = yield* voteManager.isOnCooldown(initiator.id, COOLDOWN_DURATION_MS);
    if (cooldownCheck.onCooldown) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: `❌ Debes esperar ${cooldownCheck.remainingTime} minutos antes de iniciar otra votación.`,
            })
        );
        return;
    }

    // Check if there's already an active vote for this user
    if (yield* voteManager.hasActiveVoteAgainst(targetUser.id)) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: '❌ Ya hay una votación activa para este usuario.',
            })
        );
        return;
    }

    // Get moderation channel
    const moderacionChannel = interaction.guild?.channels.cache.find(
        (channel): channel is TextChannel =>
            channel instanceof TextChannel && channel.name === MODERACION_CHANNEL_NAME
    );

    if (!moderacionChannel) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: `❌ No se encontró el canal #${MODERACION_CHANNEL_NAME}.`,
            })
        );
        return;
    }

    // Create vote
    const now = new Date();
    const voteId = generateVoteId();
    const voteData: VoteData = {
        id: voteId,
        targetUser,
        initiator,
        reason,
        startTime: now,
        upVotes: new Map(),
        downVotes: new Map(),
        whiteVotes: new Map(),
        messageId: '',
        channelId: moderacionChannel.id,
        completed: false,
    };

    // Create embed message
    const embed = createVoteEmbed(voteData);
    const voteMessage = yield* discordCall('channel.send', () =>
        moderacionChannel.send({ embeds: [embed] })
    );

    // Add reactions
    yield* discordCall('message.react', () => voteMessage.react('👍'));
    yield* discordCall('message.react', () => voteMessage.react('👎'));
    yield* discordCall('message.react', () => voteMessage.react('⬜'));

    // Update vote data with message ID
    voteData.messageId = voteMessage.id;
    yield* voteManager.addVote(voteData);

    // Set cooldown for initiator
    yield* voteManager.setCooldown(initiator.id, now);

    // Schedule vote completion (the 30s sweep also acts as a fallback)
    yield* completeVote(voteId).pipe(
        Effect.delay(VOTE_DURATION_MS),
        Effect.catchCause(cause =>
            Effect.logError(`Error completing scheduled vote ${voteId}:`, cause)
        ),
        Effect.forkDetach
    );

    yield* Effect.logInfo(
        `Vote ${voteId} scheduled for completion in ${VOTE_DURATION_MS}ms (${
            VOTE_DURATION_MS / 60000
        } minutes)`
    );

    // Notify target user (may have DMs disabled)
    yield* discordCall('user.send', () =>
        targetUser.send(
            `⚠️ Se ha iniciado una votación de timeout en tu contra en el servidor **${interaction.guild?.name}**.\n**Razón:** ${reason}\n**Iniciado por:** ${initiator.username}\n\nLa votación durará 5 minutos.`
        )
    ).pipe(Effect.ignore);

    yield* discordCall('interaction.editReply', () =>
        interaction.editReply({
            content: `✅ Votación iniciada contra ${targetUser.username} en #${MODERACION_CHANNEL_NAME}. ID: \`${voteId}\``,
        })
    );
});

export const handleCancelVoteCommand = Effect.fn('handleCancelVoteCommand')(function* (
    interaction: ChatInputCommandInteraction
) {
    const voteManager = yield* VoteManager;

    // Defer the reply immediately to avoid timeout
    yield* discordCall('interaction.deferReply', () => interaction.deferReply({ ephemeral: true }));

    // Check if user is admin
    const member = interaction.member;
    if (
        !(member instanceof GuildMember) ||
        !member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({
                content: '❌ Solo los administradores pueden cancelar votaciones.',
            })
        );
        return;
    }

    const voteId = interaction.options.getString('vote-id', true);
    const vote = yield* voteManager.getVote(voteId);

    if (!vote) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ content: '❌ No se encontró una votación con ese ID.' })
        );
        return;
    }

    if (vote.completed) {
        yield* discordCall('interaction.editReply', () =>
            interaction.editReply({ content: '❌ Esta votación ya ha sido completada.' })
        );
        return;
    }

    // Mark as completed to prevent further processing
    yield* voteManager.completeVote(voteId);

    // Update the vote message to show cancellation
    const channel = interaction.client.channels.cache.get(vote.channelId);
    if (channel instanceof TextChannel) {
        const message = yield* discordCall('channel.messages.fetch', () =>
            channel.messages.fetch(vote.messageId)
        );
        const cancelEmbed = createCancellationEmbed(vote, interaction.user.username);
        yield* discordCall('message.edit', () => message.edit({ embeds: [cancelEmbed] }));
    }

    // Notify target user (may have DMs disabled)
    yield* discordCall('users.fetch+send', () =>
        interaction.client.users
            .fetch(vote.targetUser.id)
            .then(user =>
                user.send(
                    `✅ La votación de timeout en tu contra ha sido cancelada por un administrador en **${interaction.guild?.name}**.`
                )
            )
    ).pipe(Effect.ignore);

    yield* discordCall('interaction.editReply', () =>
        interaction.editReply({ content: `✅ Votación \`${voteId}\` cancelada exitosamente.` })
    );
});
