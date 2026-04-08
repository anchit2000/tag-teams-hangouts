/**
 * Chat Team Mention — popup script
 * Manages teams and members stored in chrome.storage.sync
 * Displays auto-captured workspace members from chrome.storage.local
 */

let teams      = {};  // { teamName: [{ displayName, email, userId, memberId }] }
let knownUsers = {};  // { email: { displayName, email, userId, memberId, lastSeen } }
let currentTeam = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const syncData  = await storageGet('sync',  'teams');
  const localData = await storageGet('local', 'knownUsers');

  teams      = syncData.teams       || {};
  knownUsers = localData.knownUsers || {};

  renderTeamSelector();
  renderKnownUsers();
  bindActions();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderTeamSelector() {
  const sel = document.getElementById('team-select');
  sel.innerHTML = '';

  const names = Object.keys(teams).sort();

  if (names.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '— no teams yet —';
    opt.disabled = true;
    sel.appendChild(opt);
    currentTeam = null;
  } else {
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `!!${name}!!`;
      sel.appendChild(opt);
    }
    currentTeam = (currentTeam && teams[currentTeam]) ? currentTeam : names[0];
    sel.value = currentTeam;
  }

  renderMemberList();
}

function renderMemberList() {
  const list    = document.getElementById('member-list');
  const empty   = document.getElementById('no-members');
  const label   = document.getElementById('members-label');
  const members = currentTeam ? (teams[currentTeam] || []) : [];

  label.textContent = currentTeam ? `Members of !!${currentTeam}!!` : 'Members';
  list.innerHTML = '';

  if (members.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  list.style.display = 'block';
  empty.style.display = 'none';

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <div class="member-info">
        <span class="member-name">@${escHtml(m.displayName)}</span>
        <span class="member-email">${escHtml(m.email)}</span>
      </div>
      <button class="remove-btn" data-index="${i}" title="Remove member">✕</button>
    `;
    list.appendChild(row);
  }
}

function renderKnownUsers() {
  const list  = document.getElementById('known-list');
  const empty = document.getElementById('no-known');

  list.innerHTML = '';

  const users = Object.values(knownUsers)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 100);

  if (users.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  list.style.display = 'block';
  empty.style.display = 'none';

  const teamNames = Object.keys(teams).sort();
  const teamOptions = teamNames.length > 0
    ? teamNames.map(n => `<option value="${escHtml(n)}"${n === currentTeam ? ' selected' : ''}>${escHtml(n)}</option>`).join('')
    : '<option disabled>no teams</option>';

  for (const user of users) {
    const row = document.createElement('div');
    row.className = 'known-row';
    row.innerHTML = `
      <div class="known-info">
        <span class="member-name">@${escHtml(user.displayName)}</span>
        <span class="member-email">${escHtml(user.email)}</span>
      </div>
      <div class="known-actions">
        <select class="team-picker" data-email="${escHtml(user.email)}">${teamOptions}</select>
        <button class="add-known-btn btn-small"
                data-email="${escHtml(user.email)}"
                data-name="${escHtml(user.displayName)}"
                data-userid="${escHtml(user.userId || '')}"
                data-memberid="${escHtml(user.memberId || '')}">
          Add
        </button>
        <button class="delete-known-btn btn-icon-danger"
                data-email="${escHtml(user.email)}"
                title="Remove from recently seen">✕</button>
      </div>
    `;
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function bindActions() {
  // Team selector change
  document.getElementById('team-select').addEventListener('change', (e) => {
    currentTeam = e.target.value;
    renderMemberList();
  });

  // Create new team
  document.getElementById('new-team-btn').addEventListener('click', async () => {
    const name = prompt('Team name (lowercase letters, numbers, hyphens):');
    if (!name) return;
    const clean = name.trim().toLowerCase();

    if (!/^[a-z0-9-]+$/.test(clean)) {
      showStatus('Team name can only contain lowercase letters, numbers, and hyphens.', 'error');
      return;
    }
    if (teams[clean]) {
      showStatus(`Team "${clean}" already exists.`, 'error');
      return;
    }

    teams[clean] = [];
    currentTeam = clean;
    await saveTeams();
    renderTeamSelector();
    renderKnownUsers(); // refresh team pickers inside recently seen rows
    showStatus(`Team "${clean}" created.`);
  });

  // Delete team
  document.getElementById('delete-team-btn').addEventListener('click', async () => {
    if (!currentTeam) return;
    if (!confirm(`Delete team "${currentTeam}" and all its members?`)) return;

    delete teams[currentTeam];
    currentTeam = null;
    await saveTeams();
    renderTeamSelector();
    renderKnownUsers();
    showStatus('Team deleted.');
  });

  // Remove member from team (delegated)
  document.getElementById('member-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-btn');
    if (!btn || !currentTeam) return;

    const idx = parseInt(btn.dataset.index, 10);
    teams[currentTeam].splice(idx, 1);
    await saveTeams();
    renderMemberList();
  });

  // Known list actions (delegated)
  document.getElementById('known-list').addEventListener('click', async (e) => {
    // Add to team
    const addBtn = e.target.closest('.add-known-btn');
    if (addBtn) {
      const row      = addBtn.closest('.known-row');
      const picker   = row.querySelector('.team-picker');
      const teamName = picker?.value;

      if (!teamName || !teams[teamName]) {
        showStatus('Please create a team first.', 'error');
        return;
      }

      const member = {
        displayName: addBtn.dataset.name,
        email:       addBtn.dataset.email,
        userId:      addBtn.dataset.userid,
        memberId:    addBtn.dataset.memberid,
      };

      if (teams[teamName].some(m => m.email === member.email)) {
        showStatus(`${member.displayName} is already in "${teamName}".`, 'error');
        return;
      }

      teams[teamName].push(member);
      await saveTeams();

      // Switch to the team the user just added to, so they see the update
      currentTeam = teamName;
      document.getElementById('team-select').value = teamName;
      renderMemberList();
      showStatus(`Added ${member.displayName} to "${teamName}".`);
      return;
    }

    // Delete from recently seen
    const delBtn = e.target.closest('.delete-known-btn');
    if (delBtn) {
      const email = delBtn.dataset.email;
      delete knownUsers[email];
      await new Promise(resolve => chrome.storage.local.set({ knownUsers }, resolve));
      renderKnownUsers();
      showStatus('Removed from recently seen.');
    }
  });
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function saveTeams() {
  return new Promise((resolve) => chrome.storage.sync.set({ teams }, resolve));
}

function storageGet(area, key) {
  return new Promise((resolve) => chrome.storage[area].get(key, resolve));
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showStatus(msg, type = 'success') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
