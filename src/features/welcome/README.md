# Welcome Onboarding

## How It Works

1. **Automatic Trigger**: When a new user joins the server, the bot automatically sends a welcome message
2. **Information Collection**: Users provide required information through natural conversation
3. **Smart Detection**: Bot automatically detects and tracks provided information
4. **Moderator Review**: Moderators review and approve requests using the "Bienvenido" button
5. **Role Assignment**: Approved users automatically receive the "One Of Us" role

## Required Information

Users must provide three pieces of information:

-   **LinkedIn Profile**: Full LinkedIn URL (e.g., `https://linkedin.com/in/username`)
-   **Self-Presentation**: Brief introduction about themselves and experience
-   **Invitation Source**: Who invited them to the server

## Smart Information Detection

The bot uses intelligent pattern matching to detect information:

### LinkedIn Detection

-   Recognizes LinkedIn URLs automatically
-   Supports various formats: `linkedin.com/in/`, `www.linkedin.com/in/`
-   Example: "Mi LinkedIn es https://linkedin.com/in/juan-perez"

### Presentation Detection

-   Detects self-introduction keywords: "soy", "me llamo", "mi nombre"
-   Recognizes experience-related terms: "trabajo", "estudio", "experiencia"
-   Example: "Hola, soy María y trabajo en marketing digital"

### Invitation Detection

-   Identifies invitation-related phrases: "invit", "trajo", "me invitó"
-   Example: "Me invitó Carlos al servidor"

## User Experience

-   **Natural Conversation**: No specific format required - users can provide information naturally
-   **Multiple Messages**: Information can be provided across multiple messages
-   **Real-time Updates**: Welcome embed updates automatically as information is provided
-   **Progress Tracking**: Visual indicators show what information is still needed

## Moderator Controls

-   **Permission-Based**: Only moderators and administrators can see the approval button
-   **Security**: Regular members cannot interact with approval buttons
-   **Validation**: Bot ensures all required information is provided before allowing approval
-   **Audit Trail**: All approvals are logged with moderator and timestamp information

## Example Welcome Flow

```
1. User joins server
   ↓
2. Bot sends welcome message with information request
   ↓
3. User: "Hola, soy Juan y trabajo en desarrollo"
   → Bot detects: ✅ Presentation provided
   ↓
4. User: "Mi LinkedIn: https://linkedin.com/in/juan-dev"
   → Bot detects: ✅ LinkedIn provided
   ↓
5. User: "Me invitó María al servidor"
   → Bot detects: ✅ Invitation info provided
   ↓
6. Moderator clicks "Bienvenido" button
   ↓
7. Bot assigns "One Of Us" role to user
```
