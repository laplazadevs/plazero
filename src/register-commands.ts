import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import * as dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
    console.error('Error: DISCORD_BOT_TOKEN not found in environment variables.');
    process.exit(1);
}

if (!clientId) {
    console.error('Error: CLIENT_ID not found in environment variables.');
    process.exit(1);
}

if (!guildId) {
    console.error('Error: GUILD_ID not found in environment variables.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('gettop')
        .setDescription('Anuncia el ganador scrapeando los mensajes con más reacciones.'),
    new SlashCommandBuilder()
        .setName('memeoftheyear')
        .setDescription('Get the most reacted meme of the year 2024 (Jan 1st - Dec 31st).'),
    new SlashCommandBuilder()
        .setName('vote-timeout')
        .setDescription('Inicia una votación para aplicar timeout a un usuario.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Usuario que recibirá el timeout.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Razón del timeout.')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('cancel-vote')
        .setDescription('Cancela una votación activa (solo admins).')
        .addStringOption(option =>
            option.setName('vote-id')
                .setDescription('ID de la votación a cancelar.')
                .setRequired(true)),
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing slash commands.');

        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
        });

        console.log('Successfully reloaded slash commands.');
    } catch (error) {
        console.error(error);
    }
})();
