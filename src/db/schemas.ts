import { Schema } from 'effect';

// Row schemas for every table the bot reads. The `pg` driver already converts
// TIMESTAMP columns to `Date` instances and INTEGER columns to numbers, while
// COUNT(*)/SUM(...) aggregates come back as strings (bigint), which is why the
// aggregate schemas below use FiniteFromString.

export class UserRow extends Schema.Class<UserRow>('UserRow')({
    id: Schema.String,
    username: Schema.String,
    discriminator: Schema.NullOr(Schema.String),
    avatar_url: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class VoteRow extends Schema.Class<VoteRow>('VoteRow')({
    id: Schema.String,
    target_user_id: Schema.String,
    initiator_id: Schema.String,
    reason: Schema.String,
    start_time: Schema.Date,
    end_time: Schema.NullOr(Schema.Date),
    message_id: Schema.String,
    channel_id: Schema.String,
    completed: Schema.Boolean,
    timeout_applied: Schema.Boolean,
    final_up_votes: Schema.Number,
    final_down_votes: Schema.Number,
    final_net_votes: Schema.Number,
    created_at: Schema.Date,
}) {}

export class VoteReactionRow extends Schema.Class<VoteReactionRow>('VoteReactionRow')({
    id: Schema.Number,
    vote_id: Schema.String,
    user_id: Schema.String,
    reaction_type: Schema.Literals(['up', 'down', 'white']),
    weight: Schema.Number,
    created_at: Schema.Date,
}) {}

export class UserCooldownRow extends Schema.Class<UserCooldownRow>('UserCooldownRow')({
    user_id: Schema.String,
    last_vote_time: Schema.Date,
    created_at: Schema.Date,
}) {}

export class WelcomeRequestRow extends Schema.Class<WelcomeRequestRow>('WelcomeRequestRow')({
    id: Schema.String,
    user_id: Schema.String,
    join_time: Schema.Date,
    message_id: Schema.String,
    channel_id: Schema.String,
    linkedin_url: Schema.NullOr(Schema.String),
    presentation: Schema.NullOr(Schema.String),
    invited_by: Schema.NullOr(Schema.String),
    approved: Schema.Boolean,
    approved_by_id: Schema.NullOr(Schema.String),
    approved_at: Schema.NullOr(Schema.Date),
    created_at: Schema.Date,
}) {}

export class MemeContestRow extends Schema.Class<MemeContestRow>('MemeContestRow')({
    id: Schema.String,
    type: Schema.Literals(['weekly', 'yearly']),
    start_date: Schema.Date,
    end_date: Schema.Date,
    status: Schema.Literals(['active', 'completed', 'cancelled']),
    channel_id: Schema.String,
    message_id: Schema.NullOr(Schema.String),
    created_by_id: Schema.String,
    created_at: Schema.Date,
}) {}

export class MemeWinnerRow extends Schema.Class<MemeWinnerRow>('MemeWinnerRow')({
    id: Schema.String,
    contest_id: Schema.String,
    message_id: Schema.String,
    author_id: Schema.String,
    reaction_count: Schema.Number,
    contest_type: Schema.Literals(['meme', 'bone']),
    rank: Schema.Number,
    week_start: Schema.NullOr(Schema.Date),
    week_end: Schema.NullOr(Schema.Date),
    submitted_at: Schema.Date,
}) {}

export class UserStatsRow extends Schema.Class<UserStatsRow>('UserStatsRow')({
    user_id: Schema.String,
    total_meme_wins: Schema.Number,
    total_bone_wins: Schema.Number,
    total_contests_participated: Schema.Number,
    updated_at: Schema.Date,
}) {}

export class TopContributorRow extends Schema.Class<TopContributorRow>('TopContributorRow')({
    user_id: Schema.String,
    total_wins: Schema.Number,
    meme_wins: Schema.Number,
    bone_wins: Schema.Number,
}) {}

export class CorabastosSessionRow extends Schema.Class<CorabastosSessionRow>(
    'CorabastosSessionRow'
)({
    id: Schema.String,
    week_start: Schema.Date,
    week_end: Schema.Date,
    scheduled_time: Schema.NullOr(Schema.Date),
    status: Schema.Literals(['scheduled', 'active', 'completed', 'cancelled']),
    type: Schema.Literals(['regular', 'emergency']),
    channel_id: Schema.NullOr(Schema.String),
    announcement_message_id: Schema.NullOr(Schema.String),
    announcement_channel_id: Schema.NullOr(Schema.String),
    created_by_id: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class CorabastosAgendaRow extends Schema.Class<CorabastosAgendaRow>('CorabastosAgendaRow')({
    id: Schema.String,
    session_id: Schema.String,
    user_id: Schema.String,
    turno: Schema.Number,
    topic: Schema.String,
    description: Schema.NullOr(Schema.String),
    status: Schema.Literals(['pending', 'confirmed', 'completed', 'cancelled']),
    confirmation_message_id: Schema.NullOr(Schema.String),
    order_index: Schema.Number,
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class CorabastosEmergencyRequestRow extends Schema.Class<CorabastosEmergencyRequestRow>(
    'CorabastosEmergencyRequestRow'
)({
    id: Schema.String,
    requested_by_id: Schema.String,
    reason: Schema.String,
    paciente_id: Schema.String,
    status: Schema.Literals(['pending', 'approved', 'rejected', 'cancelled']),
    confirmation_message_id: Schema.NullOr(Schema.String),
    confirmations_needed: Schema.Number,
    confirmations_received: Schema.Number,
    expires_at: Schema.NullOr(Schema.Date),
    approved_at: Schema.NullOr(Schema.Date),
    session_id: Schema.NullOr(Schema.String),
    created_at: Schema.Date,
    updated_at: Schema.Date,
}) {}

export class CorabastosEmergencyConfirmationRow extends Schema.Class<CorabastosEmergencyConfirmationRow>(
    'CorabastosEmergencyConfirmationRow'
)({
    id: Schema.Number,
    request_id: Schema.String,
    user_id: Schema.String,
    confirmed_at: Schema.Date,
}) {}

// Aggregate query shapes
export class CountRow extends Schema.Class<CountRow>('CountRow')({
    count: Schema.FiniteFromString,
}) {}

export class MemeTotalsRow extends Schema.Class<MemeTotalsRow>('MemeTotalsRow')({
    total_memes: Schema.NullOr(Schema.FiniteFromString),
    total_bones: Schema.NullOr(Schema.FiniteFromString),
}) {}
