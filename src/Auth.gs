/**
 * Permissions. Every call from the app identifies the user by their Google Workspace
 * account, and the server decides what to return. Sales agents have no access to the sheet.
 *
 * admin   : everything + team, settings and automations
 * manager : sees all leads, assigns, imports, manages inventory and projects
 * sales   : sees and edits only their own leads and tasks
 */
function users_() {
  return rows_('Users').map(function (u) {
    const role = String(u.role || '').trim().toLowerCase();
    return Object.assign({}, u, {
      email: String(u.email || '').trim().toLowerCase(),
      role: ROLES.indexOf(role) >= 0 ? role : 'sales',
    });
  }).filter(function (u) { return u.email; });
}

function activeUsers_() { return users_().filter(function (u) { return truthy_(u.active); }); }

function userByEmail_(email) {
  email = String(email || '').toLowerCase();
  return users_().find(function (u) { return u.email === email; }) || null;
}

function displayName_(email) {
  if (!email) return 'Unassigned';
  if (email === 'system') return 'System';
  const u = userByEmail_(email);
  return (u && u.name) || email;
}

function me_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('Could not identify your account. Open EDEN CRM with your company account (@edenalkhalij.com).');
  const u = userByEmail_(email);
  if (!u || !truthy_(u.active)) throw new Error('Your account (' + email + ') has not been added to EDEN CRM or is inactive. Ask the admin to add you.');
  return { email: email, name: u.name || email, role: u.role };
}

function isManager_(u) { return u.role === 'admin' || u.role === 'manager'; }
function isAdmin_(u) { return u.role === 'admin'; }

function requireManager_(u) { if (!isManager_(u)) throw new Error('Only managers can do this.'); }
function requireAdmin_(u) { if (!isAdmin_(u)) throw new Error('Only the admin can change this.'); }

function canSee_(u, lead) {
  return !!lead && (isManager_(u) || String(lead.ownerEmail || '').toLowerCase() === u.email);
}

function managers_() {
  return activeUsers_().filter(function (u) { return u.role === 'admin' || u.role === 'manager'; })
    .map(function (u) { return u.email; });
}
