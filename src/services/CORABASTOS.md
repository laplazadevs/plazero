# Corabastos Feature Documentation

## Overview

The Corabastos feature is a comprehensive Discord bot system for managing weekly community discussion sessions called "corabastos". It allows server members to schedule agenda items for specific time slots (turnos) and request emergency sessions with community approval.

## Key Concepts

### Corabastos Sessions

-   **Regular Sessions**: Weekly scheduled meetings, typically on Fridays at 12 PM
-   **Emergency Sessions**: Spontaneous meetings requested by community members with approval process

### Turnos (Time Slots)

-   **Turno 0**: 12:00 PM (noon) - Starting time
-   **Turno 1**: 1:00 PM
-   **Turno 2**: 2:00 PM
-   ...and so on up to **Turno 10**: 10:00 PM

### Agenda Management

-   Users can add topics to specific turnos
-   Confirmation system prevents accidental submissions
-   Multiple topics allowed per turno
-   Topics are organized by order within each turno

### Emergency Requests

-   Any user can request an emergency corabastos
-   Requires 10 community member confirmations
-   Has expiry time (2 hours) to prevent stale requests
-   Automatically announces to @everyone when approved

## Commands

### `/corabastos-agenda agregar`

Adds a topic to the corabastos agenda for the current week.

**Parameters:**

-   `turno` (required): Time slot (0-8)
-   `tema` (required): Topic to discuss (max 200 chars)
-   `descripcion` (optional): Detailed description (max 500 chars)

**Flow:**

1. User submits command
2. Bot shows confirmation embed with details
3. User has 1 minute to confirm or cancel
4. On confirmation, topic is added to agenda
5. Warning displayed about attendance responsibility

### `/corabastos-agenda ver`

Displays the current week's agenda with all scheduled topics organized by turno.

**Features:**

-   Shows week date range
-   Groups topics by turno
-   Displays confirmation status (✅ confirmed, ⏳ pending)
-   Shows user who submitted each topic

### `/corabastos-emergencia`

Requests an emergency corabastos session.

**Parameters:**

-   `razon` (required): Emergency reason (max 300 chars)
-   `descripcion` (optional): Detailed description (max 500 chars)

**Flow:**

1. User submits emergency request
2. Bot posts message with confirmation reactions
3. Community members react with ✅ to confirm
4. When 10 confirmations reached, emergency session is approved
5. @everyone announcement sent to general channel
6. Emergency session created

### `/corabastos-estado`

Shows the current status of corabastos including:

-   Current week session info
-   Number of agenda items
-   Pending emergency requests
-   Global statistics

## Database Schema

### corabastos_sessions

Stores weekly corabastos sessions (regular and emergency).

### corabastos_agenda

Stores individual agenda items with turno assignments.

### corabastos_emergency_requests

Tracks emergency session requests and approval status.

### corabastos_emergency_confirmations

Records user confirmations for emergency requests.

### corabastos_attendance (future)

Optional attendance tracking for analytics.

## Configuration

Constants defined in `constants.ts`:

-   `CORABASTOS_FRIDAY_HOUR`: Default session time (12 PM)
-   `CORABASTOS_EMERGENCY_CONFIRMATIONS_NEEDED`: Required confirmations (10)
-   `CORABASTOS_EMERGENCY_EXPIRY_HOURS`: Request expiry time (2 hours)
-   `CORABASTOS_MAX_TURNO`: Maximum turno number (8)
-   `CORABASTOS_CONFIRMATION_TIMEOUT_MS`: Button timeout (30 seconds)

## Future Enhancements

### Attendance Tracking

-   Voice channel join/leave monitoring
-   Duration tracking per user
-   Participation statistics

### Notifications

-   Reminder system for scheduled sessions
-   DM notifications for agenda submitters
-   Pre-session agenda summaries

### Advanced Features

-   Recurring topic templates
-   Agenda item voting/prioritization
-   Integration with calendar systems
-   Multi-week agenda planning
