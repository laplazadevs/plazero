import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Routes } from 'discord-api-types/v9';
import { Effect, Redacted } from 'effect';

import { DotEnvConfigProviderLive } from './config/AppConfigProvider.js';
import { discordBotToken, discordClientId, discordGuildId } from './config/env.js';
import { discordCall } from './discord/DiscordClient.js';

const commands = [
    new SlashCommandBuilder()
        .setName('meme-of-the-year')
        .setDescription('Muestra los 3 memes más votados del año actual hasta la fecha'),
    new SlashCommandBuilder()
        .setName('meme-stats')
        .setDescription('Muestra estadísticas de memes y concursos'),
    new SlashCommandBuilder()
        .setName('meme-contest')
        .setDescription('Crea un nuevo concurso de memes')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Tipo de concurso')
                .setRequired(true)
                .addChoices(
                    { name: 'Semanal', value: 'weekly' },
                    { name: 'Anual', value: 'yearly' }
                )
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Duración del concurso (ej: 7d, 30d, 1y)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('vote-timeout')
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
        .setName('cancel-vote')
        .setDescription('Cancela una votación activa (solo admins)')
        .addStringOption(option =>
            option
                .setName('vote-id')
                .setDescription('ID de la votación a cancelar')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('corabastos-agenda')
        .setDescription('Gestiona la agenda del corabastos')
        .addSubcommand(subcommand =>
            subcommand
                .setName('agregar')
                .setDescription('Agrega un tema a la agenda del corabastos')
                .addIntegerOption(option =>
                    option
                        .setName('turno')
                        .setDescription('Turno (0=12pm, 1=1pm, 2=2pm, etc.)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(8)
                )
                .addStringOption(option =>
                    option
                        .setName('tema')
                        .setDescription('Tema a discutir')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addStringOption(option =>
                    option
                        .setName('descripcion')
                        .setDescription('Descripción opcional del tema')
                        .setRequired(false)
                        .setMaxLength(500)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('ver').setDescription('Ve la agenda del corabastos de esta semana')
        ),
    new SlashCommandBuilder()
        .setName('corabastos-emergencia')
        .setDescription('Solicita un corabastos de emergencia')
        .addStringOption(option =>
            option
                .setName('razon')
                .setDescription('Razón de la emergencia')
                .setRequired(true)
                .setMaxLength(300)
        )
        .addUserOption(option =>
            option
                .setName('paciente')
                .setDescription('Usuario que va a liderar el tema de la emergencia')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('corabastos-estado')
        .setDescription('Muestra el estado actual del corabastos'),
    new SlashCommandBuilder()
        .setName('corabastos-crear-sesion')
        .setDescription('Crea manualmente una sesión de corabastos (solo administradores)'),
    new SlashCommandBuilder()
        .setName('meme-complete-contest')
        .setDescription('Fuerza la finalización manual de un concurso de memes (admin only)')
        .addStringOption(option =>
            option
                .setName('contest-id')
                .setDescription('ID del concurso a finalizar')
                .setRequired(true)
        ),
].map(command => command.toJSON());

const program = Effect.gen(function* () {
    const token = yield* discordBotToken;
    const clientId = yield* discordClientId;
    const guildId = yield* discordGuildId;

    const rest = new REST({ version: '9' }).setToken(Redacted.value(token));

    yield* Effect.logInfo('Started refreshing slash commands.');

    yield* discordCall('rest.put', () =>
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
    ).pipe(
        Effect.andThen(Effect.logInfo('Successfully reloaded slash commands.')),
        Effect.catchCause(cause => Effect.logError(cause))
    );
});

NodeRuntime.runMain(program.pipe(Effect.provide(DotEnvConfigProviderLive)));
