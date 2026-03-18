// ─────────────────────────────────────────────────────────────
//  Nerdlandia — Teams Logic
//  js/teams.js  (load after auth.js)
// ─────────────────────────────────────────────────────────────

const MAX_TEAM_MEMBERS = 4;

// ── TEAM NAME VALIDATION ─────────────────────────────────────

let _nounCache = null;

async function loadNouns() {
  if (_nounCache) return _nounCache;
  
  let allWords = [];
  let from = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await sb
      .from('noun_list')
      .select('word')
      .range(from, from + pageSize - 1);
    
    if (error) { console.error('Could not load noun list', error); break; }
    if (!data || data.length === 0) break;
    
    allWords = allWords.concat(data.map(r => r.word.toLowerCase()));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  
  _nounCache = new Set(allWords);
  return _nounCache;
}

// Team name = "[1-2 digit positive integer] [Noun]"
// Returns { valid: bool, error: string|null }
async function validateTeamName(name) {
  if (!name || !name.trim()) return { valid: false, error: 'Team name cannot be empty.' };

  const parts = name.trim().split(/\s+/);
  if (parts.length !== 2) return { valid: false, error: 'Team name must be exactly a number followed by a single noun (e.g. "7 Penguins").' };

  const [numPart, nounPart] = parts;

  // Validate number: 1–2 digit positive integer
  if (!/^\d{1,2}$/.test(numPart) || parseInt(numPart, 10) < 1) {
    return { valid: false, error: 'The first part must be a 1 or 2-digit positive number (1–99).' };
  }

  // Validate noun against approved list
  const nouns = await loadNouns();
  if (!nouns.has(nounPart.toLowerCase())) {
    return { valid: false, error: `"${nounPart}" is not on the approved noun list. Try a common animal, creature, or object.` };
  }

  return { valid: true, error: null };
}

// Check if a team name is already taken
async function isTeamNameTaken(name) {
  const { data } = await sb
    .from('teams')
    .select('id')
    .ilike('name', name.trim())
    .maybeSingle();
  return !!data;
}

// ── CREATE TEAM ──────────────────────────────────────────────

async function createTeam({ name, description, photoFile }) {
  const user = await getUser();
  if (!user) return { error: { message: 'Not logged in.' } };

  const profile = await getProfile(user.id);
  if (profile.team_id) return { error: { message: 'You are already on a team.' } };

  // Validate name
  const nameCheck = await validateTeamName(name);
  if (!nameCheck.valid) return { error: { message: nameCheck.error } };

  const taken = await isTeamNameTaken(name);
  if (taken) return { error: { message: 'That team name is already taken. Try a different number or noun.' } };

  // Insert team (lead_id set after profile update)
  const { data: team, error: teamErr } = await sb
    .from('teams')
    .insert({ name: name.trim(), description, lead_id: user.id })
    .select()
    .single();
  if (teamErr) return { error: teamErr };

  // Upload photo if provided
  if (photoFile) {
    const ext = photoFile.name.split('.').pop();
    const path = `${team.id}/photo.${ext}`;
    const { error: upErr } = await sb.storage.from('team-photos').upload(path, photoFile, { upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('team-photos').getPublicUrl(path);
      await sb.from('teams').update({ photo_url: urlData.publicUrl }).eq('id', team.id);
    }
  }

  // Update creator's profile: set team_id and role
  await sb.from('profiles')
    .update({ team_id: team.id, role: 'team_lead' })
    .eq('id', user.id);

  return { team, error: null };
}

// ── UPDATE TEAM ──────────────────────────────────────────────
// Admin can change name; lead or admin can change other fields

async function updateTeam(teamId, fields, photoFile) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: { message: 'Not logged in.' } };

  const isAdmin = profile.role === 'admin';
  const isLead  = profile.role === 'team_lead' && profile.team_id === teamId;

  if (!isAdmin && !isLead) return { error: { message: 'Permission denied.' } };

  // Block name changes for non-admins
  if (fields.name && !isAdmin) {
    return { error: { message: 'Only an admin can change a team name.' } };
  }

  // Validate new name if provided
  if (fields.name) {
    const nameCheck = await validateTeamName(fields.name);
    if (!nameCheck.valid) return { error: { message: nameCheck.error } };
    const taken = await isTeamNameTaken(fields.name);
    if (taken) return { error: { message: 'That team name is already taken.' } };
  }

  if (photoFile) {
    const ext = photoFile.name.split('.').pop();
    const path = `${teamId}/photo.${ext}`;
    const { error: upErr } = await sb.storage.from('team-photos').upload(path, photoFile, { upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('team-photos').getPublicUrl(path);
      fields.photo_url = urlData.publicUrl;
    }
  }

  const { data, error } = await sb.from('teams').update(fields).eq('id', teamId).select().single();
  return { data, error };
}

// ── INVITE MEMBER ────────────────────────────────────────────

async function inviteTeamMember(teamId, email) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: { message: 'Not logged in.' } };

  const isAdmin = profile.role === 'admin';
  const isLead  = profile.role === 'team_lead' && profile.team_id === teamId;
  if (!isAdmin && !isLead) return { error: { message: 'Only the team lead or admin can send invites.' } };

  // Check team isn't full
  const count = await sb.rpc('team_member_count', { p_team_id: teamId });
  if (count.data >= MAX_TEAM_MEMBERS) {
    return { error: { message: `Teams are limited to ${MAX_TEAM_MEMBERS} members. Remove someone before inviting.` } };
  }

  // Check pending invite count too (invited but not yet joined count toward the cap)
  const { count: pendingCount } = await sb
    .from('team_invites')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'pending');

  if ((count.data + pendingCount) >= MAX_TEAM_MEMBERS) {
    return { error: { message: 'All spots are filled or pending. Wait for invites to be accepted or cancel one.' } };
  }

  const { data, error } = await sb
    .from('team_invites')
    .insert({ team_id: teamId, email: email.toLowerCase().trim(), invited_by: profile.id })
    .select()
    .single();

  // TODO: trigger an email via Supabase Edge Function using the invite token
  // The invite link would be: https://nerdlandia.org/pages/accept-invite.html?token=TOKEN

  return { data, error };
}

// ── ACCEPT INVITE ────────────────────────────────────────────

async function acceptInvite(token) {
  const user = await getUser();
  if (!user) return { error: { message: 'You must be logged in to accept an invite.' } };

  // Find the invite
  const { data: invite, error: findErr } = await sb
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (findErr || !invite) return { error: { message: 'Invite not found or already used.' } };
  if (invite.email !== user.email) return { error: { message: 'This invite was sent to a different email address.' } };

  // Check team still has room
  const count = await sb.rpc('team_member_count', { p_team_id: invite.team_id });
  if (count.data >= MAX_TEAM_MEMBERS) {
    return { error: { message: 'Sorry, this team is now full.' } };
  }

  // Check user isn't already on a team
  const profile = await getProfile(user.id);
  if (profile.team_id) return { error: { message: 'You are already on a team. Leave your current team first.' } };

  // Accept: update invite status + add user to team
  await sb.from('team_invites').update({ status: 'accepted' }).eq('id', invite.id);
  await sb.from('profiles').update({ team_id: invite.team_id }).eq('id', user.id);

  return { teamId: invite.team_id, error: null };
}

// ── REMOVE TEAM MEMBER ───────────────────────────────────────

async function removeTeamMember(targetUserId, teamId) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: { message: 'Not logged in.' } };

  const isAdmin = profile.role === 'admin';
  const isLead  = profile.role === 'team_lead' && profile.team_id === teamId;
  if (!isAdmin && !isLead) return { error: { message: 'Only the team lead or admin can remove members.' } };

  // Get target's profile
  const { data: target } = await sb.from('profiles').select('*').eq('id', targetUserId).single();
  if (!target || target.team_id !== teamId) return { error: { message: 'User is not on this team.' } };

  // Determine new role for target
  const newRole = target.role === 'team_lead' ? 'individual' : target.role === 'admin' ? 'admin' : 'individual';

  await sb.from('profiles')
    .update({ team_id: null, role: newRole })
    .eq('id', targetUserId);

  // The DB trigger handle_lead_departure will auto-promote oldest member if target was lead

  return { error: null };
}

// ── LOAD TEAM WITH MEMBERS ───────────────────────────────────

async function getTeamWithMembers(teamId) {
  const { data: team, error } = await sb
    .from('teams')
    .select('*, profiles(*), team_invites(id, email, status, created_at)')
    .eq('id', teamId)
    .single();
  return { team, error };
}
