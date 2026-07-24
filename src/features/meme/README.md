# Meme Competition

The meme competition system has been completely modernized with a modular architecture that matches the voting and welcome systems:

## Contest Management

-   **Flexible Contest Creation**: Create weekly, yearly, or custom-duration contests
-   **Interactive Controls**: Rich embeds with buttons for contest management
-   **Real-time Statistics**: Live tracking of contest performance and user contributions
-   **Automatic Cleanup**: Built-in maintenance and data cleanup for optimal performance

## Commands

**`/meme-stats`** - Comprehensive Statistics

-   View total memes and bones posted
-   See weekly and yearly winner counts
-   Check top contributors leaderboard
-   Access detailed contest history

**`/meme-contest [type] [duration]`** - Custom Contest Creation

-   **Types**: `weekly` (Friday to Friday) or `yearly` (full year)
-   **Custom Duration**: Use formats like `7d`, `30d`, `1y` for flexible periods
-   **Moderator Only**: Requires moderator or admin permissions
-   **Interactive Management**: Buttons to end contests and view statistics

## Contest Types

**Weekly Contests**

-   Default: Friday 12:00 PM to Friday 12:00 PM (Bogota time)
-   Automatic winner announcements
-   Tracks both meme and bone categories

**Yearly Contests**

-   Full year coverage (January 1st to December 31st)
-   Comprehensive annual rankings
-   Special year-end celebration embeds

**Custom Contests**

-   Flexible duration: days (`7d`), months (`1m`), or years (`1y`)
-   Perfect for special events or themed competitions
-   Full moderator control over timing and scope

## Interactive Features

**Contest Embeds**

-   Rich visual displays with contest information
-   Real-time status updates (active/completed/cancelled)
-   Time remaining until contest ends
-   Creator and creation timestamp tracking

**Management Buttons**

-   **End Contest**: Moderators can manually end active contests
-   **View Statistics**: Access detailed contest-specific statistics
-   **Permission-Based**: Only moderators and admins see management buttons

## Data Management

**Automatic Tracking**

-   User contribution statistics
-   Contest performance metrics
-   Winner history and rankings
-   Reaction count analysis

**Smart Cleanup**

-   Automatic removal of old completed contests
-   Configurable retention periods
-   Memory-efficient data management
-   Performance optimization

## Usage Examples

```
/meme-stats                    # View overall statistics
/meme-contest weekly           # Create weekly contest
/meme-contest yearly           # Create yearly contest
/meme-contest weekly 14d       # Create 2-week contest
/meme-contest yearly 6m        # Create 6-month contest
```

## Automated Processing

The bot automatically processes expired contests **every hour** and announces winners when contests end.

### Automatic Contest Completion

-   **Hourly Check**: Every hour at minute 0, the bot checks for expired contests
-   **Winner Processing**: Automatically finds top 3 memes and top 3 bones for expired contests
-   **Announcements**: Posts winner announcements in the contest channel
-   **Database Updates**: Updates user statistics and contest records

### Timezone Configuration

-   Default timezone: `America/Bogota`
-   Contest periods are flexible (you define start/end dates)
-   Winners announced automatically when contests expire
