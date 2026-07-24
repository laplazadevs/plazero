import { Schema } from 'effect';

// Wraps any failure coming out of the Discord API / discord.js.
export class DiscordError extends Schema.TaggedErrorClass<DiscordError>()('DiscordError', {
    operation: Schema.String,
    cause: Schema.Defect(),
}) {}

// Corabastos domain failures. Handlers translate these tags into the
// user-facing Spanish messages the bot has always shown.
export class InvalidTurnoError extends Schema.TaggedErrorClass<InvalidTurnoError>()(
    'InvalidTurnoError',
    { turno: Schema.Number }
) {}

export class DuplicateAgendaTopicError extends Schema.TaggedErrorClass<DuplicateAgendaTopicError>()(
    'DuplicateAgendaTopicError',
    { turno: Schema.Number, topic: Schema.String }
) {}

export class PendingEmergencyRequestError extends Schema.TaggedErrorClass<PendingEmergencyRequestError>()(
    'PendingEmergencyRequestError',
    { userId: Schema.String }
) {}

export class EmergencyRequestNotFoundError extends Schema.TaggedErrorClass<EmergencyRequestNotFoundError>()(
    'EmergencyRequestNotFoundError',
    { requestId: Schema.String }
) {}

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
    'SessionNotFoundError',
    {}
) {}

export const corabastosErrorMessage = (
    error:
        | InvalidTurnoError
        | DuplicateAgendaTopicError
        | PendingEmergencyRequestError
        | EmergencyRequestNotFoundError
        | SessionNotFoundError
): string => {
    switch (error._tag) {
        case 'InvalidTurnoError':
            return `Turno inválido: ${error.turno}. Debe estar entre 0 y 8.`;
        case 'DuplicateAgendaTopicError':
            return 'Ya tienes un tema similar agendado para este turno.';
        case 'PendingEmergencyRequestError':
            return 'Ya tienes una solicitud de corabastos de emergencia pendiente.';
        case 'EmergencyRequestNotFoundError':
            return 'Solicitud de emergencia no encontrada.';
        case 'SessionNotFoundError':
            return 'No se encontró la sesión actual.';
    }
};
