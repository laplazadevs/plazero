import * as PgClient from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';

import { databasePoolConfig } from '../config/env.js';

export const PgLive = PgClient.layerFrom(
    Effect.flatMap(databasePoolConfig, PgClient.make).pipe(
        Effect.tap(() => Effect.logInfo('Database connected')),
        Effect.tapCause(cause => Effect.logError('Database connection failed', cause))
    )
);
