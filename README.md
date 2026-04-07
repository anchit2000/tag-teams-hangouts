# Plan: Google Chat AI-Team Mention Bot

## Context
Build a Google Apps Script bot for Google Chat. When someone @mentions the bot and types `ai-team`, it @mentions all AI team members. Admins can manage the team list with commands. No server needed — runs free on Google's infrastructure. Team list persists via PropertiesService.

## Files to Create

| File | Purpose |
|------|---------|
| `Code.gs` | Entry point — receives all events from Google Chat |
| `Teams.gs` | Read/write team members to PropertiesService |
| `Messages.gs` | Build response text (the @mention strings) |
| `appsscript.json` | Manifest — OAuth scopes, marks this as a Chat bot |
| `.clasp.json` | (Optional) clasp CLI config for pushing from local machine |

## Commands the Bot Supports
- `ai-team` / `design-team` / `<name>-team` → mentions all members of that team
- `!create-team <name>` → creates a new team (e.g. `!create-team design`)
- `!delete-team <name>` → deletes a team
- `!list-teams` → shows all existing teams
- `!add-member <team-name> @user` → adds a user to a team
- `!remove-member <team-name> @user` → removes a user from a team
- `!list-members <team-name>` → shows members of a specific team

## Data Format (PropertiesService)
Two kinds of keys:
- `teams_index` → JSON array of team names, e.g. `["ai","design","backend"]`
- `team_ai`, `team_design`, etc. → JSON array of members per team, e.g. `[{"id":"users/123","displayName":"Alice"}]`

## Implementation Steps

1. **Create `Teams.gs`** — getTeamsIndex, createTeam, deleteTeam, getTeam, addMember, removeMember (all with LockService for safe concurrent writes)

2. **Create `Messages.gs`** — buildMentionAll, buildMemberList, buildTeamList, simple text responses

3. **Create `Code.gs`** — doPost(e) entry point → handleMessage() → dispatch:
   - If text ends with `-team` → mentionAll for that team
   - If text starts with `!` → route to the right command handler

4. **Create `appsscript.json`** — include `chat.bot` scope and `"chat": {}` key

5. **Create `.clasp.json`** — empty template with placeholder scriptId

## Key Technical Notes
- Use `event.message.argumentText` (not `.text`) — it strips the bot @mention prefix
- To @mention a user in response: `<users/USER_ID>` in the text string
- Filter bot's own mention from annotations: bot names start with `bots/`, human users start with `users/`
- Every code change needs a **new deployment** in Apps Script to go live

## Setup After Writing Code
1. Go to script.google.com → new project → paste the files
2. Enable Google Chat API in Google Cloud Console
3. Deploy as Web App (Execute as: Me, Access: Anyone)
4. Register the Web App URL in Google Chat API > Configuration
