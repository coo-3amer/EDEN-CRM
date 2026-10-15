/**
 * The CRM's actions. The website calls them through doPost (Web.gs), which first checks
 * the signed-in session. Every action identifies the user again (me_) and applies permissions.
 */

function visibleLeads_(u) {
  return rows_('Leads').filter(function (l) { return canSee_(u, l); }).map(publicLead_);
}

function syncData_(u) {
  return { leads: visibleLeads_(u), tasks: publicTasks_(u), units: publicUnits_(u), today: today_(), notifications: myNotifications_(u), targets: visibleTargets_(u) };
}

function projects_() {
  return rows_('Projects').filter(function (p) { return p.name && (p.active === '' || truthy_(p.active)); })
    .map(function (p) { return { name: p.name, country: p.country }; });
}

function api_bootstrap() {
  const u = me_();
  const s = settings_();
  const out = Object.assign(syncData_(u), {
    me: u,
    people: activeUsers_().map(function (x) { return { email: x.email, name: x.name || x.email, role: x.role, receivesLeads: truthy_(x.receivesLeads) }; }),
    projects: projects_(),
    templates: templates_(),
    cfg: { reservationDays: Number(s.RESERVATION_DAYS) || 7, allowExport: isManager_(u) || truthy_(s.ALLOW_SALES_EXPORT) },
    consts: {
      stages: STAGES, sources: SOURCES, ratings: RATINGS, unitStatuses: UNIT_STATUSES, taskTypes: TASK_TYPES,
      lostReasons: LOST_REASONS, currencies: CURRENCIES, actLabel: ACT_LABEL,
      payment: PAYMENT_OPTIONS, purpose: PURPOSE_OPTIONS, unitTypes: UNIT_TYPE_OPTIONS, maxFileMb: MAX_FILE_MB,
    },
  });
  if (isAdmin_(u)) out.admin = adminData_();
  return out;
}

/** Refresh everything the current user can see */
function api_sync() {
  return syncData_(me_());
}

function visibleLead_(u, id) {
  const l = leadById_(id);
  if (!canSee_(u, l)) throw new Error('This lead does not exist or is not one of yours.');
  return l;
}

function api_getLead(id) {
  const u = me_();
  const l = visibleLead_(u, id);
  return {
    lead: publicLead_(l),
    activities: activitiesFor_(id),
    files: filesFor_(id),
    tasks: publicTasks_(u).filter(function (t) { return t.leadId === id; }),
  };
}

/** A lead change can touch units and tasks too, so return the full refreshed state */
function leadResult_(u, id) {
  return Object.assign(syncData_(u), { detail: api_getLead(id) });
}

function api_saveLead(d) {
  const u = me_();
  return withLock_(function () {
    if (!d.id) {
      if (!String(d.name || '').trim() && !String(d.phone || '').trim()) throw new Error('Enter at least a name or a phone number.');
      const data = Object.assign({}, d);
      if (!isManager_(u)) data.ownerEmail = u.email; // agents add leads for themselves
      let canForce = isManager_(u);
      if (d.force && !canForce) {
        const k = phoneKey_(d.phone);
        const dup = k && rows_('Leads').find(function (l) { return l.phoneKey === k; });
        canForce = !!(dup && dup.ownerEmail === u.email);
      }
      const r = createLead_(data, u.email, { force: !!d.force && canForce });
      if (r.duplicate) {
        const dup = r.duplicate, vis = canSee_(u, dup);
        return { duplicate: { id: vis ? dup.id : null, name: vis ? dup.name : '', ownerName: displayName_(dup.ownerEmail), canForce: isManager_(u) || dup.ownerEmail === u.email } };
      }
      return leadResult_(u, r.lead.id);
    }
    const lead = visibleLead_(u, d.id);
    updateLeadFields_(lead, d, u.email, isManager_(u));
    return leadResult_(u, d.id);
  });
}

function api_changeStage(id, stage, extra) {
  const u = me_();
  return withLock_(function () {
    const lead = visibleLead_(u, id);
    if ((lead.stage || 'new') !== stage) changeStage_(lead, stage, extra || {}, u.email);
    return leadResult_(u, id);
  });
}

function api_addActivity(id, a) {
  const u = me_();
  return withLock_(function () {
    addActivity_(visibleLead_(u, id), a || {}, u.email);
    return leadResult_(u, id);
  });
}

function api_deleteLead(id) {
  const u = me_();
  requireAdmin_(u);
  return withLock_(function () {
    const lead = leadById_(id);
    if (lead) {
      releaseUnitsForLead_(id, u.email, 'lead deleted');
      rows_('Units').filter(function (x) { return x.leadId === id; }).forEach(function (x) { update_('Units', x, { leadId: '' }); });
      const files = rows_('Files').filter(function (f) { return f.leadId === id; });
      files.forEach(function (f) { try { DriveApp.getFileById(f.driveId).setTrashed(true); } catch (e) { /* gone */ } });
      deleteRows_('Files', files);
      const tasks = rows_('Tasks').filter(function (t) { return t.leadId === id; });
      tasks.forEach(deleteTaskEvent_);
      deleteRows_('Tasks', tasks);
      deleteRows_('Activities', rows_('Activities').filter(function (a) { return a.leadId === id; }));
      deleteRow_('Leads', leadById_(id));
    }
    return syncData_(u);
  });
}

function api_bulkAssign(ids, ownerEmail) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () {
    (ids || []).forEach(function (id) {
      const lead = leadById_(id);
      if (lead) updateLeadFields_(lead, { ownerEmail: ownerEmail }, u.email, true);
    });
    return syncData_(u);
  });
}

/* ---------- tasks ---------- */
function api_saveTask(d) {
  const u = me_();
  return withLock_(function () {
    if (d.id) {
      const t = taskById_(d.id);
      if (!t || !(isManager_(u) || t.ownerEmail === u.email)) throw new Error('Task not found.');
      updateTask_(t, d, u.email, isManager_(u));
      return leadResult_(u, t.leadId);
    }
    const lead = visibleLead_(u, d.leadId);
    createTask_(lead, d, u.email, isManager_(u));
    return leadResult_(u, lead.id);
  });
}

function myTask_(u, id) {
  const t = taskById_(id);
  if (!t || !(isManager_(u) || t.ownerEmail === u.email)) throw new Error('Task not found.');
  return t;
}

function api_completeTask(id, outcome) {
  const u = me_();
  return withLock_(function () {
    const t = myTask_(u, id);
    completeTask_(t, outcome, u.email);
    return leadResult_(u, t.leadId);
  });
}

function api_cancelTask(id) {
  const u = me_();
  return withLock_(function () {
    const t = myTask_(u, id);
    cancelTask_(t, u.email);
    return leadResult_(u, t.leadId);
  });
}

/* ---------- units ---------- */
function api_reserveUnit(leadId, code, days, note) {
  const u = me_();
  return withLock_(function () {
    const lead = visibleLead_(u, leadId);
    if (!isOpen_(lead.stage)) throw new Error('Only open leads can reserve a unit.');
    reserveUnit_(lead, code, days, u.email, note);
    return leadResult_(u, leadId);
  });
}

function api_releaseUnit(code, reason) {
  const u = me_();
  return withLock_(function () {
    const unit = unitByCode_(code);
    if (!unit || unit.status !== 'reserved') throw new Error('This unit is not reserved.');
    const lead = unit.leadId ? leadById_(unit.leadId) : null;
    if (!isManager_(u) && !(lead && lead.ownerEmail === u.email)) throw new Error('Only the client\'s agent or a manager can release this unit.');
    releaseUnit_(unit, u.email, reason || 'released by ' + displayName_(u.email));
    return syncData_(u);
  });
}

function api_saveUnit(d) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () { saveUnit_(d || {}, u.email); return syncData_(u); });
}

function api_importUnits(list) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () { return Object.assign(importUnits_(list), syncData_(u)); });
}

function api_deleteUnit(code) {
  const u = me_();
  requireAdmin_(u);
  return withLock_(function () { deleteUnit_(code); return syncData_(u); });
}

/* ---------- reports ---------- */
function api_activityReport(from, to) {
  const u = me_();
  return activityReport_(from, to, u);
}

/* ---------- import ---------- */
function api_importRows(rows, source, project) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () {
    let added = 0, dups = 0, skipped = 0;
    (rows || []).slice(0, 2000).forEach(function (r) {
      const res = createLead_({
        name: r.name, phone: r.phone, email: r.email, note: r.note, campaign: r.campaign,
        source: source || 'manual', project: r.project || project || '',
      }, u.email, { system: true });
      if (res.lead) added++; else if (res.duplicate) dups++; else skipped++;
    });
    return Object.assign({ added: added, dups: dups, skipped: skipped }, syncData_(u));
  });
}

/* ---------- projects & templates (managers) ---------- */
function api_saveProjects(list) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () {
    const sh = sh_('Projects');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.Projects.length).clearContent();
    clearCache_('Projects');
    (list || []).filter(function (p) { return String(p.name || '').trim(); }).forEach(function (p) {
      insert_('Projects', { name: String(p.name).trim(), country: p.country || '', units: '', active: 'TRUE' });
    });
    return projects_();
  });
}

function api_saveTemplates(list) {
  const u = me_();
  requireManager_(u);
  const clean = (list || []).map(function (t) { return { name: String(t.name || '').trim(), text: String(t.text || '').trim() }; })
    .filter(function (t) { return t.name && t.text; }).slice(0, 30);
  setSetting_('WA_TEMPLATES', JSON.stringify(clean));
  return templates_();
}

/* ---------- admin ---------- */
function adminData_() {
  const s = settings_();
  const shown = {};
  Object.keys(s).forEach(function (k) { if (k !== 'WA_TEMPLATES') shown[k] = s[k]; });
  return {
    users: users_().map(function (x) { return { email: x.email, name: x.name, role: x.role, active: truthy_(x.active), receivesLeads: truthy_(x.receivesLeads), phone: x.phone }; }),
    settings: shown,
    metaTokenSet: !!secret_('META_PAGE_TOKEN'),
    intakeSecret: secret_('INTAKE_SECRET'),
    apiUrl: apiUrl_(),
    siteUrl: appUrl_(),
    spreadsheetUrl: ss_().getUrl(),
    calendarId: secret_('CALENDAR_ID'),
    lastAutomation: secret_('LAST_AUTOMATION_RUN'),
    lastMetaSync: s.META_LAST_SYNC_AT || '',
    lastError: secret_('LAST_AUTOMATION_ERROR'),
  };
}

function api_saveUsers(list) {
  const u = me_();
  requireAdmin_(u);
  return withLock_(function () {
    const clean = (list || []).map(function (x) {
      return {
        email: String(x.email || '').trim().toLowerCase(), name: String(x.name || '').trim(),
        role: ROLES.indexOf(x.role) >= 0 ? x.role : 'sales',
        active: x.active ? 'TRUE' : 'FALSE', receivesLeads: x.receivesLeads ? 'TRUE' : 'FALSE', phone: x.phone || '',
      };
    }).filter(function (x) { return /@/.test(x.email); });
    if (!clean.some(function (x) { return x.email === u.email && x.role === 'admin' && x.active === 'TRUE'; })) {
      throw new Error('You cannot remove yourself as admin.');
    }
    const sh = sh_('Users');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.Users.length).clearContent();
    clearCache_('Users');
    clean.forEach(function (x) { insert_('Users', x); });
    return adminData_();
  });
}

function api_saveSettings(map) {
  const u = me_();
  requireAdmin_(u);
  return withLock_(function () {
    const before = settings_().DIGEST_HOUR;
    Object.keys(map || {}).forEach(function (k) {
      if (k === 'META_PAGE_TOKEN') {
        if (map[k]) PropertiesService.getScriptProperties().setProperty('META_PAGE_TOKEN', String(map[k]).trim());
        return;
      }
      if (DEFAULT_SETTINGS[k] && k !== 'WA_TEMPLATES' && k !== 'APP_URL') {
        let v = map[k];
        if (typeof v === 'boolean') v = v ? 'TRUE' : 'FALSE';
        setSetting_(k, String(v == null ? '' : v).trim());
      }
    });
    if (settings_().DIGEST_HOUR !== before) installTriggers_();
    return adminData_();
  });
}

function api_testMeta() {
  requireAdmin_(me_());
  return testMeta_();
}

function api_runAutomationsNow() {
  requireAdmin_(me_());
  runAutomations();
  return adminData_();
}
