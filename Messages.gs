// Messages.gs
// Builds the text responses that the bot sends back to Google Chat.
// To @mention someone in Google Chat, use <users/USER_ID> in the message text.

// ─── Mention everyone in a team ───────────────────────────────────────────────

function buildMentionAll(teamName, members) {
  if (members.length === 0) {
    return { text: 'The ' + teamName + ' team has no members yet.\nAdd someone with: !add-member ' + teamName + ' @user' };
  }
  var mentions = members.map(function(m) {
    return '<' + m.id + '>';  // e.g. <users/12345>
  }).join(' ');
  return { text: 'Hey ' + teamName + ' team! ' + mentions };
}

// ─── List all members of a team ───────────────────────────────────────────────

function buildMemberList(teamName, members) {
  if (members.length === 0) {
    return { text: 'The ' + teamName + ' team has no members yet.' };
  }
  var lines = members.map(function(m, i) {
    return (i + 1) + '. ' + m.displayName;
  });
  return { text: teamName + ' team members:\n' + lines.join('\n') };
}

// ─── List all teams ───────────────────────────────────────────────────────────

function buildTeamList(teams) {
  if (teams.length === 0) {
    return { text: 'No teams created yet. Use !create-team <name> to make one.' };
  }
  var lines = teams.map(function(t, i) {
    return (i + 1) + '. ' + t + '-team';
  });
  return { text: 'Available teams:\n' + lines.join('\n') };
}

// ─── Help message ─────────────────────────────────────────────────────────────

function buildHelp() {
  return {
    text: [
      '*Team Bot Commands:*',
      '',
      '*Mention a team:*',
      '  `ai-team`  or  `design-team`  (any team name + -team)',
      '',
      '*Manage teams:*',
      '  `!create-team <name>` — create a new team',
      '  `!delete-team <name>` — delete a team',
      '  `!list-teams` — show all teams',
      '',
      '*Manage members:*',
      '  `!add-member <team> @user` — add someone to a team',
      '  `!remove-member <team> @user` — remove someone from a team',
      '  `!list-members <team>` — show members of a team'
    ].join('\n')
  };
}
