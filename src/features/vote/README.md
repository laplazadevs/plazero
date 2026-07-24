# Voting

## How It Works

1. **Initiation**: Users with the "One Of Us" role can start votes against problematic behavior
2. **Voting Period**: 5-minute voting window using 👍/👎 reactions
3. **Real-time Updates**: Vote embed updates live as reactions are added/removed
4. **Automatic Execution**: Timeouts are applied automatically when thresholds are met
5. **Anti-Abuse Measures**: Failed votes penalize the initiator, white votes have exponential penalties

## Vote Thresholds & Sanctions

| Net Votes | Timeout Duration | Severity Level    |
| --------- | ---------------- | ----------------- |
| 5+ votes  | 5 minutes        | Light Warning     |
| 8+ votes  | 30 minutes       | Moderate Sanction |
| 12+ votes | 2 hours          | Serious Violation |
| 15+ votes | 24 hours         | Severe Misconduct |

## Protection Mechanisms

-   **Role Requirement**: Only "One Of Us" role members can initiate votes
-   **Admin Protection**: Cannot vote against administrators
-   **Cooldown System**: 15-minute cooldown between votes per user
-   **Duplicate Prevention**: One active vote per target user maximum
-   **Admin Override**: Administrators can cancel any vote at any time
-   **Initiator Penalty**: Failed votes (rejected) result in 5-minute timeout for the initiator
-   **Exponential White Vote Penalty**: Consecutive white votes in same poll get exponentially longer timeouts

## Anti-Abuse Features

### Initiator Penalty System

-   **Purpose**: Prevents frivolous or spam votes
-   **Trigger**: When a vote fails to reach minimum 5 votes
-   **Penalty**: 5-minute timeout for the vote initiator
-   **Protection**: Administrators are exempt from this penalty
-   **Message**: "Votación rechazada - penalización por votación fallida"

### Exponential White Vote Penalty

-   **Purpose**: Prevents abuse of the "tibio" (lukewarm) voting option
-   **Mechanism**: Tracks consecutive white votes per poll
-   **Formula**: `timeout = 1 minute × 10^(consecutive_votes - 1)`
-   **Reset**: White vote count resets when user votes properly (👍 or 👎)
-   **Protection**: Administrators are immune to white vote penalties

## Usage Examples

```
/vote-timeout @problematic_user Spamming inappropriate content
/vote-timeout @rule_breaker Using offensive language repeatedly
/cancel-vote vote_1703123456_abc123
```
