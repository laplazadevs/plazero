import { Context, Effect, Layer, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { PlazeroUser } from './User.js';

// Row schema for the shared `users` table. The `pg` driver already converts
// TIMESTAMP columns to `Date` instances.
export class UserRow extends Schema.Class<UserRow>('UserRow')({
    id: Schema.String,
    username: Schema.String,
    discriminator: Schema.NullOr(Schema.String),
    avatar_url: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

const decodeUserRows = Schema.decodeUnknownEffect(Schema.Array(UserRow));
const noUsers: ReadonlyArray<UserRow> = [];

export class UserRepository extends Context.Service<UserRepository>()('plazero/UserRepository', {
    make: Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        const upsertUser = Effect.fn('UserRepository.upsertUser')(function* (user: PlazeroUser) {
            const rows = yield* sql`
                INSERT INTO users (id, username, discriminator, avatar_url, updated_at)
                VALUES (
                    ${user.id},
                    ${user.username},
                    ${user.discriminator ?? null},
                    ${user.displayAvatarURL?.() ?? null},
                    NOW()
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    username = EXCLUDED.username,
                    discriminator = EXCLUDED.discriminator,
                    avatar_url = EXCLUDED.avatar_url,
                    updated_at = NOW()
                RETURNING *
            `;
            const users = yield* decodeUserRows(rows);
            return users[0];
        });

        // Minimal row used when only a Discord id is known (winner backfill).
        const ensureUserId = Effect.fn('UserRepository.ensureUserId')(function* (userId: string) {
            yield* sql`
                INSERT INTO users (id, username, updated_at)
                VALUES (${userId}, 'Unknown', NOW())
                ON CONFLICT (id) DO NOTHING
            `;
        });

        const getUser = Effect.fn('UserRepository.getUser')(function* (userId: string) {
            const rows = yield* sql`SELECT * FROM users WHERE id = ${userId}`;
            const users = yield* decodeUserRows(rows);
            return users.length > 0 ? users[0] : null;
        });

        const getUsers = Effect.fn('UserRepository.getUsers')(function* (
            userIds: ReadonlyArray<string>
        ) {
            if (userIds.length === 0) {
                return noUsers;
            }
            const rows = yield* sql`SELECT * FROM users WHERE id IN ${sql.in(userIds)}`;
            return yield* decodeUserRows(rows);
        });

        return { upsertUser, ensureUserId, getUser, getUsers } as const;
    }),
}) {
    static readonly layer = Layer.effect(UserRepository)(UserRepository.make);
}
