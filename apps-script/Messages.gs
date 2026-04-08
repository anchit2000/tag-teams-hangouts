// Messages.gs
// Builds the response objects that the bot sends back to Google Chat.
// Since this is a Workspace add-on, responses must use the hostAppDataAction format.

// ─── Helper: wrap any text into the required add-on response format ───────────

function textResponse(text) {
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: { text: text }
        }
      }
    }
  };
}

// ─── Mention everyone in a team ───────────────────────────────────────────────

function buildMentionAll(teamName, members) {
  if (members.length === 0) {
    return textResponse(
      'The ' + teamName + ' team has no members yet.\n' +
      'Add someone with: !add-member ' + teamName + ' @user'
    );
  }
  var mentions = members.map(function(m) {
    return '<' + m.id + '>';  // e.g. <users/12345>
  }).join(' ');
  return textResponse('Hey ' + teamName + ' team! ' + mentions);
}

// ─── List all members of a team ───────────────────────────────────────────────

function buildMemberList(teamName, members) {
  if (members.length === 0) {
    return textResponse('The ' + teamName + ' team has no members yet.');
  }
  var lines = members.map(function(m, i) {
    return (i + 1) + '. ' + m.displayName;
  });
  return textResponse(teamName + ' team members:\n' + lines.join('\n'));
}

// ─── List all teams ───────────────────────────────────────────────────────────

function buildTeamList(teams) {
  if (teams.length === 0) {
    return textResponse('No teams yet. Use !create-team <name> to make one.');
  }
  var lines = teams.map(function(t, i) {
    return (i + 1) + '. ' + t + '-team';
  });
  return textResponse('Available teams:\n' + lines.join('\n'));
}

// ─── Help message ─────────────────────────────────────────────────────────────

function buildHelp() {
  return textResponse([
    '*Team Bot Commands:*',
    '',
    '*Mention a team:*',
    '  ai-team  /  design-team  (team name + -team)',
    '',
    '*Manage teams:*',
    '  !create-team <name>',
    '  !delete-team <name>',
    '  !list-teams',
    '',
    '*Manage members:*',
    '  !add-member <team> @user',
    '  !remove-member <team> @user',
    '  !list-members <team>'
  ].join('\n'));
}
