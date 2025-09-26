# Turno Notifications Feature

## Overview

Automatic notification system for corabastos agenda items that sends reminders when their scheduled turno time arrives.

## Features

### ✅ **Pre-Session Agenda Notification**

-   **10 minutes before start** (11:50 AM Colombia time)
-   **Complete agenda preview** showing all scheduled topics by turno
-   **No @everyone** - friendly announcement without notification spam
-   **Full day overview** helps participants plan their time
-   **Empty agenda encouragement** - motivates participation when no topics scheduled

### ✅ **Channel Notifications**

-   **@everyone announcement** in general channel when turno time arrives
-   **Beautiful embeds** showing all agenda items for the current turno
-   **Voice channel reminder** to join corabastos channel

### ✅ **DM Notifications**

-   **Personal reminders** sent to agenda item submitters
-   **Detailed information** about their scheduled topic
-   **Direct link** to voice channel

### ✅ **Smart Scheduling**

-   **Precise timing**: Notifications sent exactly at turno time (12 PM, 1 PM, 2 PM, etc.)
-   **Colombia timezone**: All times calculated in America/Bogota
-   **Duplicate prevention**: Only one notification per turno per day
-   **Database tracking**: Persistent across bot restarts

## How It Works

### Timing

-   **Turno 0**: 12:00 PM (noon)
-   **Turno 1**: 1:00 PM
-   **Turno 2**: 2:00 PM
-   **...up to Turno 10**: 10:00 PM

### Cron Job

-   **Frequency**: Every minute (`* * * * *`)
-   **Timezone**: Colombia time (`America/Bogota`)
-   **Scope**: Only active scheduled sessions
-   **Pre-session check**: 11:50 AM for agenda preview
-   **Turno checks**: Every hour at minute 0 (12:00, 1:00, 2:00 PM, etc.)

### Process Flow

#### Pre-Session (11:50 AM)

1. **Check for agenda items** in the current session
2. **If items exist**: Send complete agenda preview
3. **If no items**: Send encouragement notification to add topics
4. **Mark pre-session notification as sent** (turno -1)

#### Hourly Turno Notifications (12 PM - 10 PM)

1. **Check current time** (Colombia timezone)
2. **Calculate current turno** (hour - 12)
3. **Find agenda items** for current turno with `confirmed` status
4. **Check if already notified** (database tracking)
5. **Send notifications** (channel + DMs)
6. **Mark as sent** (prevent duplicates)

## Database Schema

### New Table: `turno_notifications`

```sql
CREATE TABLE turno_notifications (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES corabastos_sessions(id),
    turno INTEGER NOT NULL,
    notification_date DATE NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, turno, notification_date)
);
```

## Configuration

### Constants Used

-   `GENERAL_CHANNEL_NAME`: Target channel for announcements
-   `CORABASTOS_VOICE_CHANNEL_NAME`: Voice channel reference
-   Colombia timezone: `America/Bogota`

### Cleanup

-   **Notification records**: Deleted after 7 days
-   **Runs**: Every 30 minutes with other corabastos cleanup

## Example Notifications

### Pre-Session Agenda Notification (11:50 AM)

```
📅 Agenda del Corabastos de Hoy

¡El corabastos comienza en 10 minutos! Aquí está la agenda completa del día:

🕐 Turno 0 (12:00 PM)
1. **Bienvenida y anuncios generales**

🕐 Turno 2 (2:00 PM)
1. **Consejos para iniciar entrevistas, fases, rangos...** - Descripción detallada

🕐 Turno 5 (5:00 PM)
1. **Revisión de proyectos pendientes**
2. **Planificación del próximo sprint**

📍 Ubicación: Canal de voz corabastos
⏰ Inicio: En 10 minutos (12:00 PM)
```

### Empty Agenda Encouragement (11:50 AM)

```
📝 ¡Agenda Vacía para el Corabastos de Hoy!

¡El corabastos comienza en 10 minutos pero aún no hay temas en la agenda!

🚀 ¡Es una oportunidad perfecta para participar!

💡 ¿Qué puedes hacer?
• Agregar un tema con /corabastos-agenda agregar
• Compartir una pregunta o consulta
• Proponer una discusión interesante
• ¡Cualquier tema es bienvenido!

⏰ ¿Cuándo?                    🎯 Beneficios
• Turno 0: 12:00 PM           • Recibirás notificación DM a tu hora
• Turno 1: 1:00 PM            • Tu tema aparecerá en @everyone
• Turno 2: 2:00 PM            • ¡La comunidad te ayudará!
• Y así hasta las 10:00 PM

📍 Recordatorio
Canal de voz: corabastos
Inicio: En 10 minutos (12:00 PM)
Duración: ¡Los turnos que necesites!

¡Los temas se pueden agregar incluso durante el corabastos!
```

### Channel Notification

```
@everyone
🔔 Turno 2 - 2:00 PM

Es hora del Turno 2 del corabastos. Los siguientes temas están programados:

📝 Tema 1
**Consejos para iniciar entrevistas, fases, rangos...**

📍 Ubicación
Únanse al canal de voz corabastos para participar
```

### DM Notification

```
⏰ Recordatorio de Corabastos - Turno 2

¡Es hora de tu tema en el corabastos!

Tu tema: Consejos para iniciar entrevistas, fases, rangos...
Turno: 2 (2:00 PM)
Ubicación: Canal de voz corabastos

💡 Recordatorio
Únete al canal de voz corabastos para presentar tu tema.
```

## Error Handling

### Graceful Failures

-   **DM failures**: Continue with other notifications if one user's DM fails
-   **Channel failures**: Log error but don't crash the system
-   **Network issues**: Retry logic handled by Discord.js

### Logging

-   **Success**: `Sent turno X notifications for Y agenda items`
-   **Errors**: Detailed error logging for debugging
-   **Cleanup**: Notification cleanup results

## Future Enhancements

### Potential Additions

-   **15-minute early warnings** for agenda submitters
-   **Voice channel activity detection** to skip notifications if already active
-   **Custom notification preferences** per user
-   **Session status integration** (auto-mark session as active)
-   **Attendance tracking** when users join voice channel

### Advanced Features

-   **Webhook integration** for external calendar systems
-   **Mobile push notifications** via Discord mobile
-   **Turno completion tracking** and statistics
-   **Custom embed themes** per server

## Testing

### Manual Testing

1. Create agenda item for current/next hour
2. Wait for turno time to arrive
3. Verify channel and DM notifications sent
4. Check database for notification record
5. Verify no duplicate notifications

### Edge Cases

-   **Bot restart**: Notifications resume correctly
-   **No agenda items**: No notifications sent
-   **Session not scheduled**: No processing
-   **Invalid turno times**: Outside 12 PM - 10 PM ignored
-   **DM permissions**: Graceful failure if user blocks DMs

This feature significantly improves the corabastos experience by ensuring participants never miss their scheduled discussion topics!
