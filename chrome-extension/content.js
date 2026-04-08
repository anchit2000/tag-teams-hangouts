/**
 * Chat Team Mention — content script
 * Runs on https://chat.google.com/*
 *
 * Responsibilities:
 *  1. Passively capture member data from @mention chips and autocomplete dropdowns
 *  2. Watch the composer for !!team-name!! patterns
 *  3. Show a Grammarly-style suggestion popup
 *  4. On confirm, inject native Google Chat @mention spans for all team members at once
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let teamsCache = {};        // { teamName: [{ displayName, email, userId, memberId }] }
let pendingMatch = null;    // { teamName, members, range } — set when popup is shown

// ---------------------------------------------------------------------------
// 1. Load & sync team data from chrome.storage.sync
// ---------------------------------------------------------------------------

chrome.storage.sync.get('teams', ({ teams }) => {
  teamsCache = teams || {};
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.teams) {
    teamsCache = changes.teams.newValue || {};
  }
});

// ---------------------------------------------------------------------------
// 2. Passively capture member data from the page DOM
//    Sources: @mention chips in messages + autocomplete dropdown options
// ---------------------------------------------------------------------------

const memberObserver = new MutationObserver((mutations) => {
  const toCapture = [];

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      // Match any element that carries user identity data — covers:
      //   • inserted @mention chips (have data-member-id + data-user-id + data-user-email)
      //   • autocomplete dropdown items (may only have data-user-email or data-user-id)
      const candidates = [
        ...(node.matches('[data-user-email]') ? [node] : []),
        ...node.querySelectorAll('[data-user-email]'),
      ];

      for (const el of candidates) {
        const email = el.dataset.userEmail;
        if (!email || !email.includes('@')) continue;

        const userId  = el.dataset.userId  || '';
        const raw     = el.dataset.displayName || el.getAttribute('aria-label') || el.textContent.trim();
        const displayName = raw.startsWith('@') ? raw.slice(1) : raw;
        if (!displayName) continue;

        // Construct memberId from userId if available, else leave blank for now
        const memberId = el.dataset.memberId || (userId ? `user/human/${userId}` : '');

        toCapture.push({ displayName, email, userId, memberId, lastSeen: Date.now() });
      }
    }
  }

  if (toCapture.length === 0) return;

  chrome.storage.local.get('knownUsers', ({ knownUsers }) => {
    const updated = knownUsers || {};
    for (const user of toCapture) {
      // Merge: don't overwrite a complete record with a partial one
      const existing = updated[user.email];
      updated[user.email] = {
        ...existing,
        ...user,
        userId:   user.userId   || existing?.userId   || '',
        memberId: user.memberId || existing?.memberId || '',
      };
    }
    chrome.storage.local.set({ knownUsers: updated });
  });
});

memberObserver.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------------
// 3. Detect composer elements and attach listeners
//    Google Chat is a SPA — composers mount/unmount on navigation
// ---------------------------------------------------------------------------

const composerObserver = new MutationObserver(() => {
  document.querySelectorAll('[role="textbox"][contenteditable="true"]').forEach(attachToComposer);
});

composerObserver.observe(document.body, { childList: true, subtree: true });

// Also run on initial load
document.querySelectorAll('[role="textbox"][contenteditable="true"]').forEach(attachToComposer);

function attachToComposer(composer) {
  if (composer.dataset.cteAttached) return;
  composer.dataset.cteAttached = 'true';

  composer.addEventListener('input', onComposerInput);
  composer.addEventListener('keydown', onComposerKeydown);
}

// ---------------------------------------------------------------------------
// 4. Trigger detection
// ---------------------------------------------------------------------------

const TRIGGER_REGEX = /!!([a-z0-9-]+)!!/;

function onComposerInput(event) {
  const composer = event.target;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  const textNode = range.startContainer;

  // Only look at text nodes inside the composer
  if (textNode.nodeType !== Node.TEXT_NODE) {
    hideSuggestionPopup();
    return;
  }

  const text = textNode.textContent;
  const cursorPos = range.startOffset;

  // Find a match that ends at or before the cursor
  const match = TRIGGER_REGEX.exec(text);
  if (!match) {
    hideSuggestionPopup();
    return;
  }

  const matchEnd = match.index + match[0].length;
  if (matchEnd !== cursorPos) {
    hideSuggestionPopup();
    return;
  }

  const teamName = match[1];
  const members = teamsCache[teamName];

  if (!members || members.length === 0) {
    hideSuggestionPopup();
    return;
  }

  // Build a Range that covers the trigger text (for deletion on confirm)
  const triggerRange = document.createRange();
  triggerRange.setStart(textNode, match.index);
  triggerRange.setEnd(textNode, matchEnd);

  pendingMatch = { teamName, members, triggerRange };

  showSuggestionPopup(teamName, members, range);
}

function onComposerKeydown(event) {
  if (!pendingMatch) return;

  if (event.key === 'Tab' || event.key === 'Enter') {
    // Only intercept Enter if the popup is visible — otherwise let Enter send the message
    const popup = document.getElementById('cte-suggestion-popup');
    if (!popup) return;
    event.preventDefault();
    event.stopPropagation();
    confirmMentionInsertion();
  } else if (event.key === 'Escape') {
    hideSuggestionPopup();
  }
}

// ---------------------------------------------------------------------------
// 5. Suggestion popup (Grammarly-style)
// ---------------------------------------------------------------------------

function showSuggestionPopup(teamName, members, caretRange) {
  let popup = document.getElementById('cte-suggestion-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'cte-suggestion-popup';
    document.body.appendChild(popup);
  }

  const preview = members.slice(0, 3).map(m => m.displayName).join(', ');
  const more = members.length > 3 ? ` +${members.length - 3} more` : '';

  popup.innerHTML = `
    <div class="cte-popup-header">
      <span class="cte-popup-icon">@</span>
      <span class="cte-popup-title">Mention <strong>${teamName}</strong> team</span>
      <span class="cte-popup-count">${members.length} member${members.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="cte-popup-preview">${preview}${more}</div>
    <div class="cte-popup-actions">
      <button id="cte-confirm-btn" class="cte-btn-primary">Insert mentions <kbd>Tab</kbd></button>
      <button id="cte-dismiss-btn" class="cte-btn-secondary">Dismiss <kbd>Esc</kbd></button>
    </div>
  `;

  document.getElementById('cte-confirm-btn').addEventListener('click', confirmMentionInsertion);
  document.getElementById('cte-dismiss-btn').addEventListener('click', hideSuggestionPopup);

  // Position near the cursor
  positionPopup(popup, caretRange);
}

function positionPopup(popup, caretRange) {
  const rect = caretRange.getBoundingClientRect();

  // Temporarily show off-screen to measure dimensions
  popup.style.visibility = 'hidden';
  popup.style.display = 'block';
  const popupW = popup.offsetWidth;
  const popupH = popup.offsetHeight;
  popup.style.visibility = '';

  let left = rect.left;
  let top = rect.bottom + 8;

  // Prevent right overflow
  if (left + popupW > window.innerWidth - 16) {
    left = window.innerWidth - popupW - 16;
  }

  // Flip above cursor if no room below
  if (top + popupH > window.innerHeight - 16) {
    top = rect.top - popupH - 8;
  }

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

function hideSuggestionPopup() {
  const popup = document.getElementById('cte-suggestion-popup');
  if (popup) popup.remove();
  pendingMatch = null;
}

// ---------------------------------------------------------------------------
// 6. Mention injection — direct DOM injection, all members at once
// ---------------------------------------------------------------------------

function confirmMentionInsertion() {
  if (!pendingMatch) return;
  const { members, triggerRange } = pendingMatch;

  hideSuggestionPopup(); // clears pendingMatch

  // Find the composer this range belongs to
  const composer = triggerRange.startContainer.parentElement?.closest('[role="textbox"]');

  // Delete the !!team-name!! trigger text
  triggerRange.deleteContents();

  // Read the space/DM ID — prefer DOM attribute, fall back to URL parsing
  const groupId = parseGroupIdFromUrl(composer);

  // Build all mention spans + spaces into a DocumentFragment for a single insertion
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    fragment.appendChild(buildMentionSpan(member, groupId));

    // Space after each chip so cursor can land between chips and chips don't merge
    fragment.appendChild(document.createTextNode('\u00A0'));
  }

  // Insert the fragment at the (now empty) trigger position
  triggerRange.insertNode(fragment);

  // Move cursor to after the last inserted node
  const sel = window.getSelection();
  if (sel) {
    const newRange = document.createRange();
    newRange.setStartAfter(triggerRange.endContainer);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  // Notify Google Chat's internal framework that the composer content changed
  // This re-enables the Send button and updates character count
  if (composer) {
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false }));
  }
}

function buildMentionSpan(member, groupId) {
  const outer = document.createElement('span');
  outer.setAttribute('jsmodel', 'OL8Z5');
  outer.setAttribute('jscontroller', 'utCXTe');
  outer.setAttribute('jsaction', 'rcuQ6b:lLCru;SgHM0b:P9heyc; click:bEdxX;');
  outer.setAttribute('jsdata', `Zoi81;${member.memberId};$0 vhhhmf;${groupId};$1`);
  outer.setAttribute('data-member-id', member.memberId);
  outer.setAttribute('data-group-id', groupId);
  outer.setAttribute('contenteditable', 'false');
  outer.setAttribute('data-ahc', 'false');
  outer.setAttribute('data-user-id', member.userId);
  outer.setAttribute('data-user-type', '0');
  outer.setAttribute('data-user-mention-type', '6');
  outer.setAttribute('data-user-email', member.email);
  outer.setAttribute('data-display-name', `@${member.displayName}`);
  outer.className = 'fWwrkf';

  const anchor = document.createElement('a');
  anchor.className = 'uuB9Nd sKzzbd a21Vic';
  anchor.setAttribute('contenteditable', 'false');
  anchor.setAttribute('tabindex', '0');
  anchor.setAttribute('role', 'button');

  const atSign = document.createElement('span');
  atSign.className = 'UB6fne';
  atSign.textContent = '@';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'MsqITd';
  nameSpan.textContent = member.displayName;

  anchor.appendChild(atSign);
  anchor.appendChild(nameSpan);
  outer.appendChild(anchor);

  return outer;
}

function parseGroupIdFromUrl(composer) {
  // Best source: data-group-id on the nearest ancestor that has it
  // (present on c-wiz and the composer container in Google Chat's DOM)
  const fromDom = composer?.closest('[data-group-id]')?.dataset?.groupId
    || document.querySelector('[data-group-id]')?.dataset?.groupId;
  if (fromDom) return fromDom;

  // Fallback: parse from URL
  const path = window.location.pathname;

  // /app/chat/ID or /app/dm/ID
  const appMatch = path.match(/\/app\/(?:chat|dm|room)\/([^/]+)/);
  if (appMatch) return `dm/${appMatch[1]}`;

  // /room/SPACE_ID/...
  const roomMatch = path.match(/\/room\/([^/]+)/);
  if (roomMatch) return `space/${roomMatch[1]}`;

  // /dm/DM_ID/...
  const dmMatch = path.match(/\/dm\/([^/]+)/);
  if (dmMatch) return `dm/${dmMatch[1]}`;

  return 'dm/unknown';
}
