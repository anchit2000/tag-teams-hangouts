# Mention Teams Hangouts

A Google Chat bot built with Google Apps Script that lets you @mention entire teams at once. Tag the bot with a team name and it notifies all members in one shot.

## How It Works

The bot is a Google Workspace Add-on deployed via Apps Script. It uses `PropertiesService` to persist team data — no database or server required.

## Commands

| Command | Description |
|---|---|
| `@bot ai-team` | Mentions all members of the `ai` team |
| `@bot design-team` | Mentions all members of the `design` team |
| `@bot !create-team <name>` | Creates a new team |
| `@bot !delete-team <name>` | Deletes a team |
| `@bot !list-teams` | Lists all teams |
| `@bot !add-member <team> @user` | Adds a user to a team |
| `@bot !remove-member <team> @user` | Removes a user from a team |
| `@bot !list-members <team>` | Lists members of a team |
| `@bot !help` | Shows all commands |

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Entry point — named trigger functions called by Google Chat |
| `Teams.gs` | Data layer — reads/writes team members via PropertiesService |
| `Messages.gs` | Response builders — constructs the add-on response format |
| `appsscript.json` | Manifest — OAuth scopes, advanced services, webapp config |
| `.clasp.json` | (Optional) clasp CLI config for pushing from local machine |

## Data Storage (PropertiesService)

All data is stored in Apps Script Script Properties:

- `teams_index` → `["ai", "design", "backend"]` — list of all team names
- `team_ai` → `[{"id":"users/123","displayName":"Alice"}]` — members per team

## Setup Guide

### 1. Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com) → New project
2. In Project Settings (⚙️) → check **"Show appsscript.json manifest file in editor"**
3. Create files: `Code.gs`, `Teams.gs`, `Messages.gs`
4. Paste the contents of each file from this repo
5. Replace `appsscript.json` with the contents from this repo
6. In Project Settings → link to your Google Cloud project (enter the GCP project number)

### 2. Enable Google Chat API

1. Go to [Google Cloud Console](https://console.cloud.google.com) → your project
2. APIs & Services → Library → enable **Google Chat API**

### 3. Deploy as Web App

1. In Apps Script → **Deploy → New deployment**
2. Type: **Web app**, Execute as: **Me**, Access: **Anyone**
3. Copy the **Deployment ID**

### 4. Configure the Chat App

1. Google Cloud Console → Google Chat API → **Configuration**
2. Fill in App name, Avatar URL, Description
3. Enable **Interactive features** → check **Join spaces and group conversations**
4. Connection settings → select **Apps Script**
5. Paste the **Deployment ID**
6. Set trigger functions:
   - App command: `onAppCommand`
   - Added to space: `onAddedToSpace`
   - Message: `onMessage`
   - Removed from space: `onRemovedFromSpace`
7. Set Visibility to your domain/specific users
8. Click **Save**

### 5. Add the Bot to a Space

1. Open Google Chat → open a space
2. Add people & apps → search for your bot name → add it
3. Type `@BotName !help` to verify it's working

## Development Notes

- **Every code change requires a new deployment** in Apps Script to go live. Update the Deployment ID in Google Cloud Console after each new deployment.
- The bot uses `event.chat.messagePayload.message` for the event structure (Workspace add-on format), with a fallback to `event.message` for compatibility.
- Responses use the `hostAppDataAction.chatDataAction.createMessageAction` format required by Workspace add-ons.
- LockService is used around all PropertiesService writes to prevent race conditions.
- Members are identified by their Google Chat user ID (`users/123456789`), captured automatically when you `!add-member @user`.
