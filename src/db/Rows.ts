import { Schema } from 'effect';

// Shared aggregate row shapes. COUNT(*)/SUM(...) aggregates come back from the
// `pg` driver as strings (bigint), which is why FiniteFromString is used.
export class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.FiniteFromString,
}) {}
