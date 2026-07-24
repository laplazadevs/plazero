# Departure Notification Feature

## Overview

The departure notification feature automatically notifies the administration channel when a member leaves the server. It sends a message in Spanish saying "el socio [user] cogió la curva" (the member [user] took the curve). No database storage is used since the channel history serves as the record.

## Features

-   **Automatic notifications**: Sends notification to the 🐵︱administración channel when members leave
-   **Rich embed**: Shows user info, join date, roles, and departure time
-   **Lightweight**: No database storage, relies on Discord's channel history for records

## Components

### Handler

-   `departure-handler.ts` - Handles the `Events.GuildMemberRemove` event

### Service Layer

-   `departure-embed.ts` - Creates Discord embeds for departure notifications

## Usage

The feature is automatically active once deployed. When a member leaves:

1. Event is triggered (`Events.GuildMemberRemove`)
2. Departure notification is sent to administration channel with embed containing:
    - User information (username, avatar)
    - Join date (when they originally joined)
    - Departure time (when they left)
    - Roles they had at time of departure

## Configuration

-   Administration channel: `🐵︱administración` (configured in `constants.ts`)
-   Message format: "el socio [user] cogió la curva"
-   Embed color: Gray (0x808080)

## Error Handling

-   If administration channel is not found, error is logged
-   If notification sending fails, error is logged
-   Handles partial member data by fetching full member information

## Design Decision

This feature intentionally does not store departure data in the database, as:

-   Channel history serves as a permanent record
-   Reduces database storage requirements
-   Maintains simplicity while providing the needed functionality
