// Teams.gs
// Handles all reading and writing of team data using PropertiesService.
// Each team is stored as a separate key: "team_ai", "team_design", etc.
// The list of all team names is stored under "teams_index".

// ─── Read the list of all team names ─────────────────────────────────────────

function getTeamsIndex() {
  var raw = PropertiesService.getScriptProperties().getProperty('teams_index');
  return raw ? JSON.parse(raw) : [];
}

function saveTeamsIndex(index) {
  PropertiesService.getScriptProperties().setProperty('teams_index', JSON.stringify(index));
}

// ─── Create / Delete teams ────────────────────────────────────────────────────

function createTeam(teamName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var index = getTeamsIndex();
    if (index.indexOf(teamName) !== -1) {
      return { created: false, reason: 'Team "' + teamName + '" already exists.' };
    }
    index.push(teamName);
    saveTeamsIndex(index);
    // Create an empty member list for this team
    PropertiesService.getScriptProperties().setProperty('team_' + teamName, '[]');
    return { created: true };
  } finally {
    lock.releaseLock();
  }
}

function deleteTeam(teamName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var index = getTeamsIndex();
    var pos = index.indexOf(teamName);
    if (pos === -1) {
      return { deleted: false, reason: 'Team "' + teamName + '" does not exist.' };
    }
    index.splice(pos, 1);
    saveTeamsIndex(index);
    PropertiesService.getScriptProperties().deleteProperty('team_' + teamName);
    return { deleted: true };
  } finally {
    lock.releaseLock();
  }
}

// ─── Read members of a team ───────────────────────────────────────────────────

function getTeam(teamName) {
  var raw = PropertiesService.getScriptProperties().getProperty('team_' + teamName);
  return raw ? JSON.parse(raw) : null; // null means team doesn't exist
}

function saveTeam(teamName, members) {
  PropertiesService.getScriptProperties().setProperty('team_' + teamName, JSON.stringify(members));
}

// ─── Add / Remove members ─────────────────────────────────────────────────────

function addMember(teamName, userId, displayName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var members = getTeam(teamName);
    if (members === null) {
      return { added: false, reason: 'Team "' + teamName + '" does not exist. Create it first with !create-team ' + teamName };
    }
    // Don't add duplicates
    var alreadyIn = members.some(function(m) { return m.id === userId; });
    if (alreadyIn) {
      return { added: false, reason: displayName + ' is already in the ' + teamName + ' team.' };
    }
    members.push({ id: userId, displayName: displayName });
    saveTeam(teamName, members);
    return { added: true };
  } finally {
    lock.releaseLock();
  }
}

function removeMember(teamName, userId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var members = getTeam(teamName);
    if (members === null) {
      return { removed: false, reason: 'Team "' + teamName + '" does not exist.' };
    }
    var target = members.filter(function(m) { return m.id === userId; })[0];
    if (!target) {
      return { removed: false, reason: 'That user is not in the ' + teamName + ' team.' };
    }
    members = members.filter(function(m) { return m.id !== userId; });
    saveTeam(teamName, members);
    return { removed: true, displayName: target.displayName };
  } finally {
    lock.releaseLock();
  }
}
