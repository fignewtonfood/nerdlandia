// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Admin UI Logic
//  js/admin-ui.js
// ─────────────────────────────────────────────────────────────

const PLACEHOLDER_AVATAR = 'https://placehold.co/42x42/EEEDFE/3C3489?text=?';
let _allUsers        = [];
let _allTeams        = [];
let _allEvents       = [];
let _allAchievements = [];
let _eventTypes      = [];
let _levelCount      = 0;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await requireAdmin();
  loadUsers();
  loadEventTypes(); // preload so event form is ready
});

// ── TABS ─────────────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  btn.classList.add('active');
  if (tab === 'users'        && !_allUsers.length)        loadUsers();
  if (tab === 'teams'        && !_allTeams.length)        loadTeams();
  if (tab === 'events'       && !_allEvents.length)       loadEvents();
  if (tab === 'achievements' && !_allAchievements.length) loadAchievements();
  if (tab === 'nouns'        && !_allNouns.length)        loadNouns();
}

// ── NOUN LIST ─────────────────────────────────────────────────
let _allNouns = [];

async function loadNouns() {
  const { count } = await sb
    .from('noun_list')
    .select('*', { count: 'exact', head: true });
  const countEl = document.getElementById('nounCount');
  if (countEl) countEl.textContent = `${(count || 0).toLocaleString()} nouns in the list`;
  const grid = document.getElementById('nounGrid');
  if (grid) grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">Use the search box to find specific nouns, or add new ones above.</p>';
}

function filterNouns() {
  const q = document.getElementById('nounSearch').value.trim();
  if (!q) { document.getElementById('nounGrid').innerHTML = ''; return; }
  sb.from('noun_list').select('word').ilike('word', `%${q}%`).order('word').limit(50)
    .then(({ data }) => {
      const el = document.getElementById('nounGrid');
      if (!data || !data.length) { el.innerHTML = '<p class="loading-msg">No nouns found.</p>'; return; }
      el.innerHTML = data.map(r => `<span class="noun-pill">${r.word}</span>`).join('');
    });
}

function renderNouns() {}

async function addNouns() {
  const raw = document.getElementById('nounInput').value;
  const msg = document.getElementById('nounAddMsg');
  msg.style.display = 'none';

  const words = [...new Set(
    raw.split(/[\n,]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  )];

  if (!words.length) {
    msg.textContent = 'Please enter at least one noun.';
    msg.className = 'form-msg error'; msg.style.display = 'block'; return;
  }

  const results = [];
  for (const word of words) {
    const { error } = await sb.from('noun_list').insert({ word });
    if (error && error.code === '23505') {
      results.push(`"${word}" — already on the list`);
    } else if (error) {
      results.push(`"${word}" — ❌ error: ${error.message}`);
    } else {
      results.push(`"${word}" — ✅ added!`);
    }
  }

  msg.innerHTML = results.join('<br>');
  msg.className = 'form-msg success';
  msg.style.display = 'block';
  document.getElementById('nounInput').value = '';
  if (typeof _nounCache !== 'undefined') _nounCache = null;
}

async function deleteNoun(word) {
  if (!confirm(`Remove "${word}" from the noun list?`)) return;
  const { error } = await sb.from('noun_list').delete().eq('word', word);
  if (error) { alert(error.message); return; }
  if (typeof _nounCache !== 'undefined') _nounCache = null;
  _allNouns = [];
  await loadNouns();
}


// ── MODAL HELPERS ─────────────────────────────────────────────
function closeModal(id)  { document.getElementById(id).style.display = 'none'; }
function openModal(id)   { document.getElementById(id).style.display = 'flex'; }
function closeModalIfOutside(e, id) { if (e.target.id === id) closeModal(id); }

// ── FORMAT HELPERS ────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
}

// ── USERS ────────────────────────────────────────────────────
async function loadUsers() {
  const { data } = await getAllUsers();
  _allUsers = data || [];
  renderUsers(_allUsers);
}

function filterUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  renderUsers(_allUsers.filter(u =>
    (u.username || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.full_name || '').toLowerCase().includes(q)
  ));
}

function renderUsers(users) {
  const el = document.getElementById('usersList');
  if (!users.length) { el.innerHTML = '<p class="loading-msg">No users found.</p>'; return; }
  el.innerHTML = users.map(u => `
    <div class="admin-row">
      <img src="${u.photo_url || PLACEHOLDER_AVATAR}" class="admin-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'" />
      <div class="admin-row-info">
        <strong>${u.username || '(no username)'}</strong>
        <span>${u.email}</span>
        <span>${u.full_name || ''} · <em>${u.role}</em>${u.teams ? ` · Team: ${u.teams.name}` : ''}</span>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-sm btn-ghost" onclick="openEditUser('${u.id}')">Edit</button>
        ${u.role !== 'admin'
          ? `<button class="btn btn-sm btn-outline" onclick="grantAdmin('${u.id}')">Make Admin</button>`
          : `<button class="btn btn-sm btn-ghost" onclick="revokeAdmin('${u.id}')">Revoke Admin</button>`}
      </div>
    </div>
  `).join('');
}

function openEditUser(userId) {
  const u = _allUsers.find(u => u.id === userId);
  if (!u) return;
  const nameParts = (u.full_name || '').split(' ');
  document.getElementById('editUserId').value = u.id;
  document.getElementById('editUserUsername').value = u.username || '';
  document.getElementById('editUserFname').value = nameParts[0] || '';
  document.getElementById('editUserLname').value = nameParts.slice(1).join(' ') || '';
  document.getElementById('editUserBio').value = u.bio || '';
  document.getElementById('editUserRole').value = u.role;
  document.getElementById('editUserError').style.display = 'none';
  openModal('editUserModal');
}

async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const errEl = document.getElementById('editUserError');
  errEl.style.display = 'none';
  const { error } = await adminUpdateUser(id, {
    username:  document.getElementById('editUserUsername').value.trim() || null,
    full_name: [document.getElementById('editUserFname').value.trim(), document.getElementById('editUserLname').value.trim()].filter(Boolean).join(' ') || null,
    bio:       document.getElementById('editUserBio').value.trim() || null,
    role:      document.getElementById('editUserRole').value,
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('editUserModal');
  _allUsers = []; loadUsers();
}

async function grantAdmin(userId) {
  if (!confirm('Grant admin privileges to this user?')) return;
  const { error } = await adminGrantAdmin(userId);
  if (error) alert(error.message);
  else { _allUsers = []; loadUsers(); }
}

async function revokeAdmin(userId) {
  if (!confirm('Revoke admin privileges from this user?')) return;
  const { error } = await adminRevokeAdmin(userId);
  if (error) alert(error.message);
  else { _allUsers = []; loadUsers(); }
}

// ── TEAMS ─────────────────────────────────────────────────────
async function loadTeams() {
  const { data } = await getAllTeams();
  _allTeams = data || [];
  renderTeams(_allTeams);
}

function filterTeams() {
  const q = document.getElementById('teamSearch').value.toLowerCase();
  renderTeams(_allTeams.filter(t => t.name.toLowerCase().includes(q)));
}

function renderTeams(teams) {
  const el = document.getElementById('teamsList');
  if (!teams.length) { el.innerHTML = '<p class="loading-msg">No teams found.</p>'; return; }
  el.innerHTML = teams.map(t => {
    const members = t.profiles || [];
    return `
      <div class="admin-row">
        <img src="${t.photo_url || PLACEHOLDER_AVATAR}" class="admin-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'" />
        <div class="admin-row-info">
          <strong>${t.name}</strong>
          <span>${members.length} member${members.length !== 1 ? 's' : ''}: ${members.map(m => m.username || m.email).join(', ') || 'none'}</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditTeam('${t.id}')">Edit</button>
          <a href="team.html?id=${t.id}" class="btn btn-sm btn-ghost" target="_blank">View</a>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteTeam('${t.id}','${t.name.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function openEditTeam(teamId) {
  const t = _allTeams.find(t => t.id === teamId);
  if (!t) return;
  document.getElementById('editTeamId').value = t.id;
  document.getElementById('editTeamName').value = t.name;
  document.getElementById('editTeamDesc').value = t.description || '';
  document.getElementById('editTeamError').style.display = 'none';
  document.getElementById('editTeamNameMsg').style.display = 'none';
  openModal('editTeamModal');
}

async function saveTeamAdmin() {
  const id = document.getElementById('editTeamId').value;
  const name = document.getElementById('editTeamName').value.trim();
  const desc = document.getElementById('editTeamDesc').value.trim();
  const photo = document.getElementById('editTeamPhoto').files[0];
  const errEl = document.getElementById('editTeamError');
  errEl.style.display = 'none';
  const fields = { description: desc || null };
  const original = _allTeams.find(t => t.id === id);
  if (name && name !== original?.name) {
    const nameCheck = await validateTeamName(name);
    if (!nameCheck.valid) { errEl.textContent = nameCheck.error; errEl.style.display = 'block'; return; }
    fields.name = name;
  }
  const { error } = await adminUpdateTeam(id, fields, photo);
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('editTeamModal');
  _allTeams = []; loadTeams();
}

async function deleteTeam(teamId, teamName) {
  if (!confirm(`Delete team "${teamName}"? All members will be removed. This cannot be undone.`)) return;
  const { error } = await adminDeleteTeam(teamId);
  if (error) alert(error.message);
  else { _allTeams = []; loadTeams(); }
}

// ── EVENT TYPES ───────────────────────────────────────────────
async function loadEventTypes() {
  const { data } = await getEventTypes();
  _eventTypes = data || [];
  populateEventTypeSelect();
}

function populateEventTypeSelect() {
  const sel = document.getElementById('eventTypeSelect');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">Select type…</option>' +
    _eventTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('') +
    '<option value="__custom__">+ Add custom type…</option>';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('eventTypeSelect')?.addEventListener('change', function() {
    const wrap = document.getElementById('customTypeWrap');
    wrap.style.display = this.value === '__custom__' ? 'block' : 'none';
    if (this.value !== '__custom__') document.getElementById('customTypeMsg').style.display = 'none';
  });
});

async function saveCustomType() {
  const name = document.getElementById('customTypeName').value.trim();
  const msg  = document.getElementById('customTypeMsg');
  msg.style.display = 'none';
  if (!name) return;
  const { data, error } = await adminCreateEventType(name);
  if (error) {
    msg.textContent = error.message.includes('unique') ? 'That type already exists.' : error.message;
    msg.style.color = 'var(--coral)'; msg.style.display = 'block'; return;
  }
  _eventTypes.push(data);
  populateEventTypeSelect();
  document.getElementById('eventTypeSelect').value = data.id;
  document.getElementById('customTypeWrap').style.display = 'none';
  document.getElementById('customTypeName').value = '';
}

// ── EVENTS ───────────────────────────────────────────────────
async function loadEvents() {
  const { data } = await getAllEvents();
  _allEvents = data || [];
  renderEvents(_allEvents);
}

function renderEvents(events) {
  const el = document.getElementById('eventsList');
  if (!events.length) { el.innerHTML = '<p class="loading-msg">No events yet. Create one!</p>'; return; }

  el.innerHTML = events.map(ev => {
    const status = deriveEventStatus(ev.start_date, ev.end_date);
    const regs   = ev.event_registrations || [];
    const typeLabel = ev.event_types?.name || '—';
    const statusColors = { upcoming: 'blue', active: 'green', completed: 'gray' };
    const color = statusColors[status] || 'gray';

    const dateStr = ev.start_date === ev.end_date
      ? `${fmtDate(ev.start_date)}${ev.start_time ? ' · ' + fmtTime(ev.start_time) : ''} – ${ev.end_time ? fmtTime(ev.end_time) : ''}`
      : `${fmtDate(ev.start_date)}${ev.start_time ? ' ' + fmtTime(ev.start_time) : ''} – ${fmtDate(ev.end_date)}${ev.end_time ? ' ' + fmtTime(ev.end_time) : ''}`;

    return `
      <div class="admin-row" style="align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div class="admin-row-info" style="flex:1;min-width:200px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <strong>${ev.title}</strong>
            <span class="status-pill ${color}">${status}</span>
            <span class="status-pill gray">${typeLabel}</span>
          </div>
          <span>${dateStr}</span>
          <span>${ev.location || 'No location'} · ${regs.length} team${regs.length !== 1 ? 's' : ''}${ev.max_teams ? ` / ${ev.max_teams} max` : ''}</span>
        </div>
        <div class="admin-row-actions" style="flex-shrink:0;">
          <button class="btn btn-sm btn-ghost" onclick="openEventModal('${ev.id}')">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="openEventTeams('${ev.id}')">Teams &amp; Points</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteEvent('${ev.id}','${ev.title.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

async function openEventModal(eventId) {
  if (!_eventTypes.length) await loadEventTypes();
  populateEventTypeSelect();

  document.getElementById('eventId').value = eventId || '';
  document.getElementById('eventError').style.display = 'none';
  document.getElementById('customTypeWrap').style.display = 'none';

  if (eventId) {
    const ev = _allEvents.find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('eventModalTitle').textContent = 'Edit Event';
    document.getElementById('eventTitle').value       = ev.title;
    document.getElementById('eventDesc').value        = ev.description || '';
    document.getElementById('eventTypeSelect').value  = ev.event_type_id || '';
    document.getElementById('eventLocation').value    = ev.location || '';
    document.getElementById('eventStartDate').value   = ev.start_date || '';
    document.getElementById('eventStartTime').value   = ev.start_time || '';
    document.getElementById('eventEndDate').value     = ev.end_date || '';
    document.getElementById('eventEndTime').value     = ev.end_time || '';
    document.getElementById('eventMaxTeams').value    = ev.max_teams || '';
  } else {
    document.getElementById('eventModalTitle').textContent = 'New Event';
    document.getElementById('eventTitle').value       = '';
    document.getElementById('eventDesc').value        = '';
    document.getElementById('eventTypeSelect').value  = '';
    document.getElementById('eventLocation').value    = '';
    document.getElementById('eventStartDate').value   = '';
    document.getElementById('eventStartTime').value   = '';
    document.getElementById('eventEndDate').value     = '';
    document.getElementById('eventEndTime').value     = '';
    document.getElementById('eventMaxTeams').value    = '';
  }
  openModal('eventModal');
}

async function saveEvent() {
  const id    = document.getElementById('eventId').value;
  const errEl = document.getElementById('eventError');
  errEl.style.display = 'none';

  const title      = document.getElementById('eventTitle').value.trim();
  const startDate  = document.getElementById('eventStartDate').value;
  const endDate    = document.getElementById('eventEndDate').value;
  const typeVal    = document.getElementById('eventTypeSelect').value;

  if (!title)     { errEl.textContent = 'Title is required.';        errEl.style.display = 'block'; return; }
  if (!startDate) { errEl.textContent = 'Start date is required.';   errEl.style.display = 'block'; return; }
  if (!endDate)   { errEl.textContent = 'End date is required.';     errEl.style.display = 'block'; return; }
  if (endDate < startDate) { errEl.textContent = 'End date must be on or after start date.'; errEl.style.display = 'block'; return; }
  if (!typeVal || typeVal === '__custom__') { errEl.textContent = 'Please select an event type.'; errEl.style.display = 'block'; return; }

  const fields = {
    title,
    description:    document.getElementById('eventDesc').value.trim() || null,
    event_type_id:  typeVal || null,
    location:       document.getElementById('eventLocation').value.trim() || null,
    start_date:     startDate,
    start_time:     document.getElementById('eventStartTime').value || null,
    end_date:       endDate,
    end_time:       document.getElementById('eventEndTime').value || null,
    max_teams:      document.getElementById('eventMaxTeams').value ? parseInt(document.getElementById('eventMaxTeams').value) : null,
  };

  const { error } = id ? await adminUpdateEvent(id, fields) : await adminCreateEvent(fields);
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('eventModal');
  _allEvents = []; loadEvents();
}

async function deleteEvent(eventId, title) {
  if (!confirm(`Delete "${title}"? All team registrations and scores will also be removed.`)) return;
  const { error } = await adminDeleteEvent(eventId);
  if (error) alert(error.message);
  else { _allEvents = []; loadEvents(); }
}

// ── EVENT TEAMS ───────────────────────────────────────────────
async function openEventTeams(eventId) {
  document.getElementById('eventTeamsEventId').value = eventId;
  document.getElementById('addTeamMsg').style.display = 'none';

  if (!_allTeams.length) { const { data } = await getAllTeams(); _allTeams = data || []; }

  const ev = _allEvents.find(e => e.id === eventId);
  document.getElementById('eventTeamsTitle').textContent = ev?.title || 'Teams & Points';

  renderEventTeamsList(ev);
  refreshAddTeamSelector(ev);
  openModal('eventTeamsModal');
}

function renderEventTeamsList(ev) {
  const regs = ev?.event_registrations || [];
  const el   = document.getElementById('eventTeamsList');
  if (!regs.length) { el.innerHTML = '<p class="loading-msg">No teams registered yet.</p>'; return; }
  el.innerHTML = regs.map(r => `
    <div class="admin-row" style="flex-wrap:wrap;gap:8px;">
      <div class="admin-row-info" style="flex:1;">
        <strong>${r.teams?.name || 'Unknown team'}</strong>
        <span>Points: <strong>${r.points}</strong> · Placement: ${r.placement ? `#${r.placement}` : '—'}</span>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-sm btn-outline" onclick="openPointsModal('${ev.id}','${r.team_id}',${r.points},${r.placement || ''},${JSON.stringify(r.teams?.name || '').replace(/"/g,"'")})">Edit Points</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="removeFromEvent('${ev.id}','${r.team_id}')">Remove</button>
      </div>
    </div>`).join('');
}

function refreshAddTeamSelector(ev) {
  const registeredIds = new Set((ev?.event_registrations || []).map(r => r.team_id));
  const unregistered  = _allTeams.filter(t => !registeredIds.has(t.id));
  const sel = document.getElementById('addTeamSelect');
  sel.innerHTML = unregistered.length
    ? unregistered.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
    : '<option value="">All teams registered</option>';
  sel.disabled = !unregistered.length;
}

async function addTeamToEvent() {
  const eventId = document.getElementById('eventTeamsEventId').value;
  const teamId  = document.getElementById('addTeamSelect').value;
  const msg     = document.getElementById('addTeamMsg');
  msg.style.display = 'none';
  if (!teamId) return;

  // Check team limit
  const ev = _allEvents.find(e => e.id === eventId);
  if (ev?.max_teams && (ev.event_registrations || []).length >= ev.max_teams) {
    msg.textContent = `This event is full (max ${ev.max_teams} teams).`;
    msg.className = 'form-msg error'; msg.style.display = 'block'; return;
  }

  const { error } = await adminRegisterTeam(eventId, teamId);
  if (error) {
    msg.textContent = '❌ ' + error.message;
    msg.className = 'form-msg error'; msg.style.display = 'block'; return;
  }
  msg.textContent = '✅ Team added!';
  msg.className = 'form-msg success'; msg.style.display = 'block';
  _allEvents = []; await loadEvents();
  const updated = _allEvents.find(e => e.id === eventId);
  renderEventTeamsList(updated);
  refreshAddTeamSelector(updated);
}

function openPointsModal(eventId, teamId, points, placement, teamName) {
  document.getElementById('pointsEventId').value   = eventId;
  document.getElementById('pointsTeamId').value    = teamId;
  document.getElementById('pointsValue').value     = points;
  document.getElementById('placementValue').value  = placement || '';
  document.getElementById('pointsTeamName').textContent = teamName || 'Team';
  document.getElementById('pointsError').style.display = 'none';
  openModal('pointsModal');
}

async function savePoints() {
  const eventId   = document.getElementById('pointsEventId').value;
  const teamId    = document.getElementById('pointsTeamId').value;
  const points    = parseInt(document.getElementById('pointsValue').value) || 0;
  const placement = document.getElementById('placementValue').value ? parseInt(document.getElementById('placementValue').value) : null;
  const errEl     = document.getElementById('pointsError');
  errEl.style.display = 'none';

  const { error } = await adminUpdatePoints(eventId, teamId, points, placement);
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('pointsModal');
  _allEvents = []; await loadEvents();
  // Refresh teams modal if still open
  const evTeamsModal = document.getElementById('eventTeamsModal');
  if (evTeamsModal.style.display !== 'none') {
    const updated = _allEvents.find(e => e.id === eventId);
    renderEventTeamsList(updated);
  }
}

async function removeFromEvent(eventId, teamId) {
  if (!confirm('Remove this team from the event?')) return;
  const { error } = await adminRemoveTeamFromEvent(eventId, teamId);
  if (error) { alert(error.message); return; }
  _allEvents = []; await loadEvents();
  const updated = _allEvents.find(e => e.id === eventId);
  renderEventTeamsList(updated);
  refreshAddTeamSelector(updated);
}

// ── ADD USER ─────────────────────────────────────────────────
function openAddUserModal() {
  document.getElementById('addUserEmail').value    = '';
  document.getElementById('addUserFname').value    = '';
  document.getElementById('addUserLname').value    = '';
  document.getElementById('addUserUsername').value = '';
  document.getElementById('addUserRole').value     = 'individual';
  document.getElementById('addUserError').style.display   = 'none';
  document.getElementById('addUserSuccess').style.display = 'none';
  document.getElementById('addUserMethod').value   = 'invite';
  setAddUserMethod('invite');
  openModal('addUserModal');
}

function setAddUserMethod(method) {
  document.getElementById('addUserMethod').value = method;
  const inviteBtn = document.getElementById('addUserMethodInvite');
  const manualBtn = document.getElementById('addUserMethodManual');
  const desc      = document.getElementById('addUserMethodDesc');
  const actionBtn = document.getElementById('addUserBtn');

  if (method === 'invite') {
    inviteBtn.className = 'btn btn-sm btn-primary';
    manualBtn.className = 'btn btn-sm btn-ghost';
    desc.textContent    = 'Creates a Supabase account and sends the user a confirmation email so they can log in.';
    actionBtn.textContent = 'Send Invite';
  } else {
    inviteBtn.className = 'btn btn-sm btn-ghost';
    manualBtn.className = 'btn btn-sm btn-primary';
    desc.textContent    = 'Adds a profile record only — no login account created. Useful for manually tracking participants.';
    actionBtn.textContent = 'Add Profile';
  }
}

async function addUser() {
  const method   = document.getElementById('addUserMethod').value;
  const email    = document.getElementById('addUserEmail').value.trim();
  const fname    = document.getElementById('addUserFname').value.trim();
  const lname    = document.getElementById('addUserLname').value.trim();
  const username = document.getElementById('addUserUsername').value.trim();
  const role     = document.getElementById('addUserRole').value;
  const errEl    = document.getElementById('addUserError');
  const okEl     = document.getElementById('addUserSuccess');
  errEl.style.display = okEl.style.display = 'none';

  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }

  if (method === 'invite') {
    // Use Supabase auth OTP to send a magic link
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
    okEl.textContent = `✅ Invite sent to ${email}! They'll receive a login link.`;
    okEl.style.display = 'block';
    // Update profile fields if they register
    // (profile is auto-created on signup via trigger — fields set after)
  } else {
    const full_name = [fname, lname].filter(Boolean).join(' ') || null;
    const { error } = await adminCreateProfileOnly({ email, username: username || null, full_name, role });
    if (error) {
      errEl.textContent = error.message.includes('profiles_id') 
        ? 'A profile with this email may already exist.' 
        : error.message;
      errEl.style.display = 'block'; return;
    }
    okEl.textContent = `✅ Profile created for ${email}.`;
    okEl.style.display = 'block';
    _allUsers = []; loadUsers();
  }

  document.getElementById('addUserEmail').value    = '';
  document.getElementById('addUserFname').value    = '';
  document.getElementById('addUserLname').value    = '';
  document.getElementById('addUserUsername').value = '';
}

// ── ADD TEAM ─────────────────────────────────────────────────
async function openAddTeamModal() {
  document.getElementById('addTeamName').value  = '';
  document.getElementById('addTeamDesc').value  = '';
  document.getElementById('addTeamError').style.display = 'none';
  document.getElementById('addTeamNameMsg').style.display = 'none';

  // Populate lead selector with users who have no team
  if (!_allUsers.length) { const { data } = await getAllUsers(); _allUsers = data || []; }
  const available = _allUsers.filter(u => !u.team_id);
  const sel = document.getElementById('addTeamLead');
  sel.innerHTML = '<option value="">— No lead assigned —</option>' +
    available.map(u => `<option value="${u.id}">${u.username || u.email}</option>`).join('');

  openModal('addTeamModal');
}

let _addTeamNameTimer;
function liveValidateNewTeamName() {
  clearTimeout(_addTeamNameTimer);
  _addTeamNameTimer = setTimeout(async () => {
    const val = document.getElementById('addTeamName').value;
    const msg = document.getElementById('addTeamNameMsg');
    if (!val.trim()) { msg.style.display = 'none'; return; }
    const { valid, error } = await validateTeamName(val);
    msg.style.display = 'block';
    if (valid) {
      const taken = await isTeamNameTaken(val);
      msg.textContent = taken ? '❌ Already taken.' : '✅ Name looks good!';
      msg.style.color = taken ? 'var(--coral)' : 'var(--green)';
    } else {
      msg.textContent = '❌ ' + error;
      msg.style.color = 'var(--coral)';
    }
  }, 500);
}

async function addTeamAdmin() {
  const name   = document.getElementById('addTeamName').value.trim();
  const desc   = document.getElementById('addTeamDesc').value.trim();
  const leadId = document.getElementById('addTeamLead').value || null;
  const errEl  = document.getElementById('addTeamError');
  errEl.style.display = 'none';

  if (!name) { errEl.textContent = 'Team name is required.'; errEl.style.display = 'block'; return; }

  const { error } = await adminCreateTeam({ name, description: desc || null, leadId });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }

  closeModal('addTeamModal');
  _allTeams = []; loadTeams();
  _allUsers = []; // refresh user list so team_id updates show
}

// ── MANAGE TEAM MEMBERS ───────────────────────────────────────
async function openManageTeam(teamId) {
  document.getElementById('manageTeamId').value = teamId;
  document.getElementById('manageTeamMsg').style.display = 'none';

  const team = _allTeams.find(t => t.id === teamId);
  document.getElementById('manageTeamTitle').textContent = `Manage: ${team?.name || 'Team'}`;

  if (!_allUsers.length) { const { data } = await getAllUsers(); _allUsers = data || []; }

  await refreshManageTeamView(teamId);
  openModal('manageTeamModal');
}

async function refreshManageTeamView(teamId) {
  // Refresh teams data
  const { data } = await getAllTeams();
  _allTeams = data || [];
  const team = _allTeams.find(t => t.id === teamId);
  const members = team?.profiles || [];

  // Render current members
  const membersEl = document.getElementById('manageTeamMembers');
  if (!members.length) {
    membersEl.innerHTML = '<p class="loading-msg" style="padding:1rem;">No members yet.</p>';
  } else {
    membersEl.innerHTML = members.map(m => `
      <div class="admin-row">
        <img src="${m.photo_url || PLACEHOLDER_AVATAR}" class="admin-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'" />
        <div class="admin-row-info">
          <strong>${m.username || m.email}</strong>
          <span>${m.role === 'team_lead' ? '👑 Team Lead' : m.role === 'admin' ? '⚡ Admin' : 'Member'}</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn btn-sm btn-ghost" onclick="openMoveMember('${m.id}','${teamId}','${(m.username || m.email).replace(/'/g,"\\'")}')">Move</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="removeMemberAdmin('${m.id}','${teamId}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  // Add member selector — users with no team
  const available = _allUsers.filter(u => !u.team_id);
  const addSel = document.getElementById('addMemberSelect');
  addSel.innerHTML = available.length
    ? available.map(u => `<option value="${u.id}">${u.username || u.email}</option>`).join('')
    : '<option value="">No available users</option>';
  addSel.disabled = !available.length || members.length >= 4;

  // Change lead selector — current members only
  const leadSel = document.getElementById('changeLeadSelect');
  leadSel.innerHTML = members.map(m =>
    `<option value="${m.id}">${m.username || m.email}${m.role === 'team_lead' ? ' (current lead)' : ''}</option>`
  ).join('');
}

async function addMemberToTeam() {
  const teamId = document.getElementById('manageTeamId').value;
  const userId = document.getElementById('addMemberSelect').value;
  const msg    = document.getElementById('manageTeamMsg');
  msg.style.display = 'none';
  if (!userId) return;

  const { error } = await adminAddMemberToTeam(userId, teamId);
  msg.style.display = 'block';
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'form-msg error'; }
  else { msg.textContent = '✅ Member added!'; msg.className = 'form-msg success'; }
  _allUsers = []; const { data } = await getAllUsers(); _allUsers = data || [];
  await refreshManageTeamView(teamId);
}

async function removeMemberAdmin(userId, teamId) {
  if (!confirm('Remove this member from the team?')) return;
  const { error } = await adminRemoveMemberFromTeam(userId, teamId);
  const msg = document.getElementById('manageTeamMsg');
  msg.style.display = 'block';
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'form-msg error'; }
  else { msg.textContent = '✅ Member removed.'; msg.className = 'form-msg success'; }
  _allUsers = []; const { data } = await getAllUsers(); _allUsers = data || [];
  await refreshManageTeamView(teamId);
}

async function changeTeamLead() {
  const teamId    = document.getElementById('manageTeamId').value;
  const newLeadId = document.getElementById('changeLeadSelect').value;
  const msg       = document.getElementById('manageTeamMsg');
  msg.style.display = 'none';
  if (!newLeadId) return;

  const { error } = await adminChangeTeamLead(newLeadId, teamId);
  msg.style.display = 'block';
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'form-msg error'; }
  else { msg.textContent = '✅ Team lead updated!'; msg.className = 'form-msg success'; }
  _allUsers = []; const { data } = await getAllUsers(); _allUsers = data || [];
  await refreshManageTeamView(teamId);
}

// ── MOVE MEMBER ───────────────────────────────────────────────
async function openMoveMember(userId, fromTeamId, userName) {
  document.getElementById('moveMemberId').value = userId;
  document.getElementById('moveMemberName').textContent = userName;
  document.getElementById('moveMemberMsg').style.display = 'none';

  // Populate destination teams (exclude current team, exclude full teams)
  if (!_allTeams.length) { const { data } = await getAllTeams(); _allTeams = data || []; }
  const destinations = _allTeams.filter(t => {
    if (t.id === fromTeamId) return false;
    const memberCount = (t.profiles || []).length;
    return memberCount < 4;
  });

  const sel = document.getElementById('moveToTeamSelect');
  sel.innerHTML = destinations.length
    ? destinations.map(t => `<option value="${t.id}|${fromTeamId}">${t.name} (${(t.profiles||[]).length}/4)</option>`).join('')
    : '<option value="">No available teams</option>';

  openModal('moveMemberModal');
}

async function moveMember() {
  const userId = document.getElementById('moveMemberId').value;
  const val    = document.getElementById('moveToTeamSelect').value;
  const msg    = document.getElementById('moveMemberMsg');
  msg.style.display = 'none';
  if (!val) return;

  const [toTeamId, fromTeamId] = val.split('|');
  const { error } = await adminMoveMember(userId, fromTeamId, toTeamId);
  msg.style.display = 'block';
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'form-msg error'; return; }
  msg.textContent = '✅ Member moved!'; msg.className = 'form-msg success';
  _allTeams = []; _allUsers = [];
  setTimeout(() => {
    closeModal('moveMemberModal');
    closeModal('manageTeamModal');
    loadTeams();
  }, 1000);
}

// ── UPDATED renderTeams — adds Manage Members button ─────────
// (override the one defined earlier in this file)
async function loadTeams() {
  const { data } = await getAllTeams();
  _allTeams = data || [];
  renderTeams(_allTeams);
}

function renderTeams(teams) {
  const el = document.getElementById('teamsList');
  if (!teams.length) { el.innerHTML = '<p class="loading-msg">No teams found.</p>'; return; }
  el.innerHTML = teams.map(t => {
    const members = t.profiles || [];
    return `
      <div class="admin-row">
        <img src="${t.photo_url || PLACEHOLDER_AVATAR}" class="admin-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'" />
        <div class="admin-row-info">
          <strong>${t.name}</strong>
          <span>${members.length}/4 members: ${members.map(m => m.username || m.email).join(', ') || 'none'}</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn btn-sm btn-ghost" onclick="openEditTeam('${t.id}')">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="openManageTeam('${t.id}')">Members</button>
          <a href="team.html?id=${t.id}" class="btn btn-sm btn-ghost" target="_blank">View</a>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteTeam('${t.id}','${t.name.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}
async function loadAchievements() {
  const { data } = await getAllAchievements();
  _allAchievements = data || [];
  renderAchievements(_allAchievements);
}

function renderAchievements(achievements) {
  const el = document.getElementById('achievementsList');
  if (!achievements.length) { el.innerHTML = '<p class="loading-msg">No achievements yet. Create one!</p>'; return; }
  el.innerHTML = achievements.map(a => {
    const levels = a.levels || [];
    return `
      <div class="admin-row">
        <div class="ach-thumb">
          ${a.image_url ? `<img src="${a.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : '🏅'}
        </div>
        <div class="admin-row-info">
          <strong>${a.name}</strong>
          <span>${a.description || 'No description'}</span>
          <span>${levels.length} level${levels.length !== 1 ? 's' : ''}: ${levels.map(l => l.label).join(' → ')}</span>
        </div>
        <div class="admin-row-actions">
          <button class="btn btn-sm btn-ghost" onclick="openAchievementModal('${a.id}')">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="openAssignAch('${a.id}')">Assign to Team</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteAchievement('${a.id}','${a.name.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function openAchievementModal(achId) {
  _levelCount = 0;
  document.getElementById('levelsList').innerHTML = '';
  document.getElementById('achId').value = achId || '';
  document.getElementById('achError').style.display = 'none';
  if (achId) {
    const a = _allAchievements.find(a => a.id === achId);
    if (!a) return;
    document.getElementById('achModalTitle').textContent = 'Edit Achievement';
    document.getElementById('achName').value = a.name;
    document.getElementById('achDesc').value = a.description || '';
    (a.levels || []).forEach(l => addLevel(l));
  } else {
    document.getElementById('achModalTitle').textContent = 'New Achievement';
    document.getElementById('achName').value = '';
    document.getElementById('achDesc').value = '';
    addLevel();
  }
  openModal('achievementModal');
}

function addLevel(existing) {
  _levelCount++;
  const i = _levelCount;
  const div = document.createElement('div');
  div.className = 'level-row';
  div.id = `level-${i}`;
  div.innerHTML = `
    <div class="level-num">L${i}</div>
    <div class="form-group" style="flex:1;margin-bottom:0;">
      <input type="text" placeholder="Label (e.g. Bronze)" class="level-label" value="${existing?.label || ''}" />
    </div>
    <div class="form-group" style="flex:1;margin-bottom:0;">
      <input type="number" placeholder="Threshold pts" class="level-threshold" min="1" value="${existing?.threshold || ''}" />
    </div>
    <input type="color" class="level-color" value="${existing?.color || '#C0C0C0'}" style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;padding:2px;flex-shrink:0;" />
    <button class="btn btn-sm btn-ghost" style="color:var(--coral);padding:0 8px;flex-shrink:0;" onclick="removeLevel(${i})">✕</button>
  `;
  document.getElementById('levelsList').appendChild(div);
}

function removeLevel(i) {
  const el = document.getElementById(`level-${i}`);
  if (el) el.remove();
}

function collectLevels() {
  return Array.from(document.querySelectorAll('.level-row')).map((row, idx) => ({
    level:     idx + 1,
    label:     row.querySelector('.level-label').value.trim(),
    threshold: parseInt(row.querySelector('.level-threshold').value) || 0,
    color:     row.querySelector('.level-color').value,
  })).filter(l => l.label);
}

async function saveAchievement() {
  const id    = document.getElementById('achId').value;
  const errEl = document.getElementById('achError');
  errEl.style.display = 'none';
  const name   = document.getElementById('achName').value.trim();
  const desc   = document.getElementById('achDesc').value.trim();
  const image  = document.getElementById('achImage').files[0];
  const levels = collectLevels();
  if (!name)         { errEl.textContent = 'Name is required.';            errEl.style.display = 'block'; return; }
  if (!levels.length){ errEl.textContent = 'Add at least one level.';      errEl.style.display = 'block'; return; }
  const fields = { name, description: desc || null, levels };
  const { error } = id
    ? await adminUpdateAchievement(id, fields, image)
    : await adminCreateAchievement({ ...fields, imageFile: image });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('achievementModal');
  _allAchievements = []; loadAchievements();
}

async function deleteAchievement(achId, name) {
  if (!confirm(`Delete achievement "${name}"? It will be removed from all teams.`)) return;
  const { error } = await adminDeleteAchievement(achId);
  if (error) alert(error.message);
  else { _allAchievements = []; loadAchievements(); }
}

async function openAssignAch(achId) {
  document.getElementById('assignAchId').value = achId;
  document.getElementById('assignAchMsg').style.display = 'none';
  if (!_allTeams.length) { const { data } = await getAllTeams(); _allTeams = data || []; }
  document.getElementById('assignTeamSelect').innerHTML =
    _allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  openModal('assignAchModal');
}

async function assignAchievement() {
  const achId  = document.getElementById('assignAchId').value;
  const teamId = document.getElementById('assignTeamSelect').value;
  const msg    = document.getElementById('assignAchMsg');
  const { error } = await adminAssignAchievement(teamId, achId);
  msg.style.display = 'block';
  if (error) {
    msg.textContent = '❌ ' + (error.message.includes('unique') ? 'This team already has this achievement.' : error.message);
    msg.className = 'form-msg error';
  } else {
    msg.textContent = '✅ Achievement assigned!';
    msg.className = 'form-msg success';
  }
}
