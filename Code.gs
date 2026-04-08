// Code.gs
// Google Chat Apps Script entry points.
// These handlers are referenced directly from the Chat API configuration.

function onMessage(event) {
  return handleMessage(event);
}

function onAddedToSpace(event) {
  return textResponse("Hi! I'm the Team Mention Bot.\nType !help to see what I can do.");
}

function onRemovedFromSpace(event) {
  return {};
}

function onAppCommand(event) {
  return handleMessage(event);
}


// ─── Route the message to the right handler ───────────────────────────────────

function handleMessage(event) {
  // argumentText is the message with the bot @mention stripped off
  var text = (event.message.argumentText || '').trim().toLowerCase();

  // "ai-team", "design-team", "backend-team" etc. → mention that whole team
  if (text.endsWith('-team')) {
    var teamName = text.slice(0, -5); // remove the "-team" suffix
    return handleMentionTeam(teamName);
  }

  // Admin commands starting with !
  if (text === '!help')                          return buildHelp();
  if (text === '!list-teams')                    return handleListTeams();
  if (text.startsWith('!create-team '))          return handleCreateTeam(text);
  if (text.startsWith('!delete-team '))          return handleDeleteTeam(text);
  if (text.startsWith('!list-members '))         return handleListMembers(text);
  if (text.startsWith('!add-member '))           return handleAddMember(text, event);
  if (text.startsWith('!remove-member '))        return handleRemoveMember(text, event);

  // Unknown input
  return textResponse("I didn't understand that. Type !help to see available commands.");
}

// ─── Mention all members of a team ───────────────────────────────────────────

function handleMentionTeam(teamName) {
  var members = getTeam(teamName);
  if (members === null) {
    return textResponse('Team "' + teamName + '" does not exist.\nCreate it with: !create-team ' + teamName);
  }
  return buildMentionAll(teamName, members);
}

// ─── Team management commands ─────────────────────────────────────────────────

function handleListTeams() {
  return buildTeamList(getTeamsIndex());
}

function handleCreateTeam(text) {
  var teamName = text.replace('!create-team ', '').trim();
  if (!teamName) return textResponse('Please provide a team name. Example: !create-team design');

  var result = createTeam(teamName);
  if (!result.created) return textResponse(result.reason);
  return textResponse('Team "' + teamName + '" created! Add members with: !add-member ' + teamName + ' @user');
}

function handleDeleteTeam(text) {
  var teamName = text.replace('!delete-team ', '').trim();
  if (!teamName) return textResponse('Please provide a team name. Example: !delete-team design');

  var result = deleteTeam(teamName);
  if (!result.deleted) return textResponse(result.reason);
  return textResponse('Team "' + teamName + '" has been deleted.');
}

// ─── Member management commands ───────────────────────────────────────────────

function handleListMembers(text) {
  var teamName = text.replace('!list-members ', '').trim();
  if (!teamName) return textResponse('Please provide a team name. Example: !list-members ai');

  var members = getTeam(teamName);
  if (members === null) return textResponse('Team "' + teamName + '" does not exist.');
  return buildMemberList(teamName, members);
}

function handleAddMember(text, event) {
  var teamName = text.replace('!add-member ', '').split(' ')[0].trim();
  if (!teamName) return textResponse('Usage: !add-member <team> @user');

  var target = getFirstMentionedUser(event);
  if (!target) return textResponse('Please @mention the user you want to add. Example: !add-member ' + teamName + ' @Alice');

  var result = addMember(teamName, target.name, target.displayName);
  if (!result.added) return textResponse(result.reason);
  return textResponse('Added ' + target.displayName + ' to the ' + teamName + ' team.');
}

function handleRemoveMember(text, event) {
  var teamName = text.replace('!remove-member ', '').split(' ')[0].trim();
  if (!teamName) return textResponse('Usage: !remove-member <team> @user');

  var target = getFirstMentionedUser(event);
  if (!target) return textResponse('Please @mention the user you want to remove. Example: !remove-member ' + teamName + ' @Alice');

  var result = removeMember(teamName, target.name);
  if (!result.removed) return textResponse(result.reason);
  return textResponse('Removed ' + result.displayName + ' from the ' + teamName + ' team.');
}

// ─── Helper: extract the first @mentioned human user from the message ─────────
// Google Chat includes the bot's own mention in annotations too.
// Human users have IDs like "users/123", bots have "bots/123" — so we filter by prefix.

function getFirstMentionedUser(event) {
  var annotations = event.message.annotations || [];
  for (var i = 0; i < annotations.length; i++) {
    var a = annotations[i];
    if (a.type === 'USER_MENTION' && a.userMention.user.name.indexOf('users/') === 0) {
      return a.userMention.user; // has .name (e.g. "users/123") and .displayName
    }
  }
  return null;
}

