// Lightweight user shape used across the domain types.
//
// Live discord.js `User` objects satisfy this interface structurally, and the
// repositories can build plain objects with the same shape from database rows
// without unsafe casts.
export interface PlazeroUser {
    readonly id: string;
    readonly username: string;
    readonly discriminator?: string | null;
    readonly displayName?: string;
    readonly displayAvatarURL?: () => string | null | undefined;
    readonly send?: (content: string) => Promise<unknown>;
}

export const plazeroUserFromRow = (row: {
    readonly id: string;
    readonly username: string;
    readonly discriminator: string | null;
    readonly avatar_url: string | null;
}): PlazeroUser => ({
    id: row.id,
    username: row.username,
    discriminator: row.discriminator,
    displayName: row.username,
    displayAvatarURL: () => row.avatar_url,
});

export const minimalPlazeroUser = (id: string, username = 'Unknown User'): PlazeroUser => ({
    id,
    username,
    displayName: username,
});
