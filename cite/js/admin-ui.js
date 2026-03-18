// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Admin UI Logic
//  js/admin-ui.js  (load after admin.js)
// ─────────────────────────────────────────────────────────────

const PLACEHOLDER_AVATAR = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="%23EEEDFE"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="36">🧙</text></svg>';

let _allUsers = [];
let _allTeams = [];
let _allEvents = [];
let _allAchievements = [];
let levelCount = 0;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await requireAdmin();
  loadUsers();
});

// ── TABS ─────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  event.target.classList.add('active');

  if (tab === 'users' && !_allUsers.length) loadUsers();
  if (tab === 'teams' && !_allTeams.length) loadTeams();
  if (tab === 'events' && !_allEvents.length) loadEvents();
  if (tab === 'achievements' && !_allAchievements.length) loadAchievements();
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModalIfOutside(e, id) { if (e.target.id === id) closeModal(id); }

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
          : `<button class="btn btn-sm btn-ghost" onclick="revokeAdmin('${u.id}')">Revoke Admin</button>`
        }
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
  const username = document.getElementById('editUserUsername').value.trim();
  const fname = document.getElementById('editUserFname').value.trim();
  const lname = document.getElementById('editUserLname').value.trim();
  const bio = document.getElementById('editUserBio').value.trim();
  const role = document.getElementById('editUserRole').value;
  const errEl = document.getElementById('editUserError');
  errEl.style.display = 'none';

  const { error } = await adminUpdateUser(id, {
    username: username || null,
    full_name: [fname, lname].filter(Boolean).join(' ') || null,
    bio: bio || null,
    role,
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('editUserModal');
  _allUsers = [];
  loadUsers();
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
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteTeam('${t.id}','${t.name}')">Delete</button>
        </div>
      </div>
    `;
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

async function saveTeam() {
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
  _allTeams = [];
  loadTeams();
}

async function deleteTeam(teamId, teamName) {
  if (!confirm(`Delete team "${teamName}"? This cannot be undone. All members will be removed from the team.`)) return;
  const { error } = await adminDeleteTeam(teamId);
  if (error) alert(error.message);
  else { _allTeams = []; loadTeams(); }
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

  const statusColors = { upcoming: 'blue', active: 'green', completed: 'gray', cancelled: 'coral' };

  el.innerHTML = events.map(ev => {
    const regs = ev.event_registrations || [];
    const color = statusColors[ev.status] || 'gray';
    return `
      <div class="admin-row" style="align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div class="admin-row-info" style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <strong>${ev.title}</strong>
            <span class="status-pill ${color}">${ev.status}</span>
          </div>
          <span>${ev.event_date || 'No date set'} · ${ev.location || 'No location'}</span>
          <span>${regs.length} team${regs.length !== 1 ? 's' : ''} registered</span>
        </div>
        <div class="admin-row-actions" style="flex-shrink:0;">
          <button class="btn btn-sm btn-ghost" onclick="openEventModal('${ev.id}')">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="openEventTeams('${ev.id}','${ev.title.replace(/'/g,"\\'")}')">Teams & Points</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="deleteEvent('${ev.id}','${ev.title.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function openEventModal(eventId) {
  document.getElementById('eventId').value = eventId || '';
  document.getElementById('eventError').style.display = 'none';

  if (eventId) {
    const ev = _allEvents.find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('eventModalTitle').textContent = 'Edit Event';
    document.getElementById('eventTitle').value = ev.title;
    document.getElementById('eventDesc').value = ev.description || '';
    document.getElementById('eventDate').value = ev.event_date || '';
    document.getElementById('eventStatus').value = ev.status;
    document.getElementById('eventLocation').value = ev.location || '';
    document.getElementById('eventMaxTeams').value = ev.max_teams || '';
  } else {
    document.getElementById('eventModalTitle').textContent = 'New Event';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDesc').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventStatus').value = 'upcoming';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventMaxTeams').value = '';
  }
  openModal('eventModal');
}

async function saveEvent() {
  const id = document.getElementById('eventId').value;
  const errEl = document.getElementById('eventError');
  errEl.style.display = 'none';

  const fields = {
    title:     document.getElementById('eventTitle').value.trim(),
    description: document.getElementById('eventDesc').value.trim() || null,
    event_date: document.getElementById('eventDate').value || null,
    status:    document.getElementById('eventStatus').value,
    location:  document.getElementById('eventLocation').value.trim() || null,
    max_teams: document.getElementById('eventMaxTeams').value ? parseInt(document.getElementById('eventMaxTeams').value) : null,
  };

  if (!fields.title) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; return; }

  const { error } = id ? await adminUpdateEvent(id, fields) : await adminCreateEvent(fields);
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('eventModal');
  _allEvents = [];
  loadEvents();
}

async function deleteEvent(eventId, title) {
  if (!confirm(`Delete event "${title}"? This will also remove all team registrations and scores.`)) return;
  const { error } = await adminDeleteEvent(eventId);
  if (error) alert(error.message);
  else { _allEvents = []; loadEvents(); }
}

async function openEventTeams(eventId, title) {
  document.getElementById('eventTeamsEventId').value = eventId;
  document.getElementById('eventTeamsTitle').textContent = `Teams: ${title}`;
  document.getElementById('addTeamMsg').style.display = 'none';

  // Populate team selector with unregistered teams
  const ev = _allEvents.find(e => e.id === eventId);
  const registeredIds = new Set((ev?.event_registrations || []).map(r => r.team_id));
  if (!_allTeams.length) { const { data } = await getAllTeams(); _allTeams = data || []; }
  const unregistered = _allTeams.filter(t => !registeredIds.has(t.id));
  const sel = document.getElementById('addTeamSelect');
  sel.innerHTML = unregistered.length
    ? unregistered.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
    : '<option value="">All teams registered</option>';

  renderEventTeams(ev);
  openModal('eventTeamsModal');
}

function renderEventTeams(ev) {
  const regs = ev?.event_registrations || [];
  const el = document.getElementById('eventTeamsList');
  if (!regs.length) { el.innerHTML = '<p class="loading-msg">No teams registered yet.</p>'; return; }
  el.innerHTML = regs.map(r => `
    <div class="admin-row" style="flex-wrap:wrap;gap:8px;">
      <div class="admin-row-info" style="flex:1;">
        <strong>${r.teams?.name || 'Unknown team'}</strong>
        <span>Points: <strong>${r.points}</strong> · Placement: ${r.placement ? `#${r.placement}` : '—'}</span>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-sm btn-outline" onclick="openPointsEditor('${ev.id}','${r.team_id}',${r.points},${r.placement || 0})">Edit Points</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--coral);" onclick="removeTeamFromEvent('${ev.id}','${r.team_id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

async function addTeamToEvent() {
  const eventId = document.getElementById('eventTeamsEventId').value;
  const teamId = document.getElementById('addTeamSelect').value;
  const msg = document.getElementById('addTeamMsg');
  msg.style.display = 'none';
  if (!teamId) return;
  const { error } = await adminRegisterTeam(eventId, teamId);
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'form-msg error'; msg.style.display = 'block'; return; }
  msg.textContent = '✅ Team added!'; msg.className = 'form-msg success'; msg.style.display = 'block';
  _allEvents = []; await loadEvents();
  const ev = _allEvents.find(e => e.id === eventId);
  renderEventTeams(ev);
  // Refresh selector
  const registeredIds = new Set((ev?.event_registrations || []).map(r => r.team_id));
  const unregistered = _allTeams.filter(t => !registeredIds.has(t.id));
  document.getElementById('addTeamSelect').innerHTML = unregistered.length
    ? unregistered.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
    : '<option value="">All teams registered</option>';
}

function openPointsEditor(eventId, teamId, points, placement) {
  // Inline prompt for now — could be a modal if preferred
  const newPoints = prompt('Enter points for this team:', points);
  if (newPoints === null) return;
  const newPlacement = prompt('Enter placement (leave blank if not final):', placement || '');
  adminUpdatePoints(eventId, teamId, parseInt(newPoints) || 0, parseInt(newPlacement) || null)
    .then(({ error }) => {
      if (error) alert(error.message);
      else { _allEvents = []; loadEvents(); closeModal('eventTeamsModal'); }
    });
}

async function removeTeamFromEvent(eventId, teamId) {
  if (!confirm('Remove this team from the event?')) return;
  const { error } = await adminRemoveTeamFromEvent(eventId, teamId);
  if (error) alert(error.message);
  else {
    _allEvents = []; await loadEvents();
    const ev = _allEvents.find(e => e.id === eventId);
    renderEventTeams(ev);
  }
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────
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
        <div class="ach-thumb" style="background:var(--purple-light);border:2px solid var(--purple-mid);">
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
      </div>
    `;
  }).join('');
}

function openAchievementModal(achId) {
  levelCount = 0;
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
    addLevel(); // start with one level
  }
  openModal('achievementModal');
}

function addLevel(existing) {
  levelCount++;
  const i = levelCount;
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
    <div style="display:flex;align-items:center;gap:6px;">
      <input type="color" class="level-color" value="${existing?.color || '#C0C0C0'}" style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;padding:2px;" />
    </div>
    <button class="btn btn-sm btn-ghost" style="color:var(--coral);padding:0 8px;" onclick="removeLevel(${i})">✕</button>
  `;
  document.getElementById('levelsList').appendChild(div);
}

function removeLevel(i) {
  const el = document.getElementById(`level-${i}`);
  if (el) el.remove();
}

function collectLevels() {
  const rows = document.querySelectorAll('.level-row');
  return Array.from(rows).map((row, idx) => ({
    level: idx + 1,
    label: row.querySelector('.level-label').value.trim(),
    threshold: parseInt(row.querySelector('.level-threshold').value) || 0,
    color: row.querySelector('.level-color').value,
  })).filter(l => l.label);
}

async function saveAchievement() {
  const id = document.getElementById('achId').value;
  const errEl = document.getElementById('achError');
  errEl.style.display = 'none';

  const name = document.getElementById('achName').value.trim();
  const desc = document.getElementById('achDesc').value.trim();
  const imageFile = document.getElementById('achImage').files[0];
  const levels = collectLevels();

  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
  if (!levels.length) { errEl.textContent = 'Add at least one level.'; errEl.style.display = 'block'; return; }

  const fields = { name, description: desc || null, levels };
  const { error } = id
    ? await adminUpdateAchievement(id, fields, imageFile)
    : await adminCreateAchievement({ ...fields, imageFile });

  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }
  closeModal('achievementModal');
  _allAchievements = [];
  loadAchievements();
}

async function deleteAchievement(achId, name) {
  if (!confirm(`Delete achievement "${name}"? This will also remove it from all teams.`)) return;
  const { error } = await adminDeleteAchievement(achId);
  if (error) alert(error.message);
  else { _allAchievements = []; loadAchievements(); }
}

async function openAssignAch(achId) {
  document.getElementById('assignAchId').value = achId;
  document.getElementById('assignAchMsg').style.display = 'none';
  if (!_allTeams.length) { const { data } = await getAllTeams(); _allTeams = data || []; }
  const sel = document.getElementById('assignTeamSelect');
  sel.innerHTML = _allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  openModal('assignAchModal');
}

async function assignAchievement() {
  const achId = document.getElementById('assignAchId').value;
  const teamId = document.getElementById('assignTeamSelect').value;
  const msg = document.getElementById('assignAchMsg');
  const { error } = await adminAssignAchievement(teamId, achId);
  msg.style.display = 'block';
  if (error) { msg.textContent = '❌ ' + (error.message.includes('unique') ? 'This team already has this achievement.' : error.message); msg.className = 'form-msg error'; }
  else { msg.textContent = '✅ Achievement assigned!'; msg.className = 'form-msg success'; }
}
