import * as PgClient from '@effect/sql-pg/PgClient';
import { Effect } from 'effect';

import { databasePoolConfig } from '../config/env.js';

// Provides `PgClient` and `SqlClient` backed by a managed pg pool. The pool is
// verified with a `SELECT 1` on construction and closed when the layer scope
// ends, replacing the old DatabaseService singleton.
export const PgLive = PgClient.layerFrom(Effect.flatMap(databasePoolConfig, PgClient.make));
