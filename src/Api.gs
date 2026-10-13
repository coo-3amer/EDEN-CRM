/**
 * الدوال اللي المتصفح بيناديها بـ google.script.run
 * كل دالة بتبدأ بالتعرف على المستخدم (me_) وبتطبق الصلاحيات قبل أي حاجة.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('EDEN CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function visibleLeads_(u) {
  return rows_('Leads').filter(function (l) { return canSee_(u, l); }).map(publicLead_);
}

function api_bootstrap() {
  const u = me_();
  if (isAdmin_(u) && !settings_().APP_URL) {
    try { const url = ScriptApp.getService().getUrl(); if (url) setSetting_('APP_URL', url); } catch (e) { /* ignore */ }
  }
  const people = activeUsers_().map(function (x) {
    return { email: x.email, name: x.name || x.email, role: x.role, receivesLeads: truthy_(x.receivesLeads) };
  });
  const out = {
    me: u,
    people: people,
    projects: rows_('Projects').filter(function (p) { return p.active === '' || truthy_(p.active); }).map(function (p) {
      return { name: p.name, country: p.country, units: String(p.units || '').split(/[\n,،]+/).map(function (s) { return s.trim(); }).filter(String) };
    }),
    leads: visibleLeads_(u),
    consts: { stages: STAGES, sources: SOURCES, lostReasons: LOST_REASONS, currencies: CURRENCIES, actLabel: ACT_LABEL, today: today_() },
  };
  if (isAdmin_(u)) out.admin = api_adminData_();
  return out;
}

function api_listLeads() {
  const u = me_();
  return { leads: visibleLeads_(u), today: today_() };
}

function api_getLead(id) {
  const u = me_();
  const l = leadById_(id);
  if (!l || !canSee_(u, l)) throw new Error('الليد ده مش موجود أو مش من ليدزك.');
  return { lead: publicLead_(l), activities: activitiesFor_(id).map(function (a) {
    return Object.assign(a, { byName: displayName_(a.by), toName: a.toVal && a.type === 'assign' ? displayName_(a.toVal) : '' });
  }) };
}

function api_saveLead(d) {
  const u = me_();
  return withLock_(function () {
    if (!d.id) {
      if (!String(d.name || '').trim() && !String(d.phone || '').trim()) throw new Error('اكتب الاسم أو الموبايل على الأقل.');
      const data = Object.assign({}, d);
      if (!isManager_(u)) data.ownerEmail = u.email; // السيلز بيضيف لنفسه
      const r = createLead_(data, u.email, { force: !!d.force });
      if (r.duplicate) {
        const dup = r.duplicate;
        return { duplicate: { id: canSee_(u, dup) ? dup.id : null, name: canSee_(u, dup) ? dup.name : '', ownerName: displayName_(dup.ownerEmail), canForce: isManager_(u) } };
      }
      return api_getLead(r.lead.id);
    }
    const lead = leadById_(d.id);
    if (!lead || !canSee_(u, lead)) throw new Error('الليد ده مش موجود أو مش من ليدزك.');
    updateLeadFields_(lead, d, u.email, isManager_(u));
    return api_getLead(d.id);
  });
}

function api_changeStage(id, stage, extra) {
  const u = me_();
  return withLock_(function () {
    const lead = leadById_(id);
    if (!lead || !canSee_(u, lead)) throw new Error('الليد ده مش موجود أو مش من ليدزك.');
    if ((lead.stage || 'new') !== stage) changeStage_(lead, stage, extra || {}, u.email);
    return api_getLead(id);
  });
}

function api_addActivity(id, a) {
  const u = me_();
  return withLock_(function () {
    const lead = leadById_(id);
    if (!lead || !canSee_(u, lead)) throw new Error('الليد ده مش موجود أو مش من ليدزك.');
    addActivity_(lead, a || {}, u.email);
    return api_getLead(id);
  });
}

function api_deleteLead(id) {
  const u = me_();
  requireAdmin_(u);
  return withLock_(function () {
    const lead = leadById_(id);
    if (!lead) return { ok: true };
    const acts = rows_('Activities').filter(function (a) { return a.leadId === id; }).sort(function (a, b) { return b._row - a._row; });
    acts.forEach(function (a) { sh_('Activities').deleteRow(a._row); });
    clearCache_('Activities');
    deleteRow_('Leads', lead);
    return { ok: true };
  });
}

/** توزيع مجموعة ليدز مرة واحدة (للمديرين) */
function api_bulkAssign(ids, ownerEmail) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () {
    (ids || []).forEach(function (id) {
      const lead = leadById_(id);
      if (lead) updateLeadFields_(lead, { ownerEmail: ownerEmail }, u.email, true);
    });
    return { leads: visibleLeads_(u) };
  });
}

/* ---------- استيراد ---------- */
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
    return { added: added, dups: dups, skipped: skipped, leads: visibleLeads_(u) };
  });
}

/* ---------- المشاريع (مدير) ---------- */
function api_saveProjects(list) {
  const u = me_();
  requireManager_(u);
  return withLock_(function () {
    const sh = sh_('Projects');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.Projects.length).clearContent();
    clearCache_('Projects');
    (list || []).filter(function (p) { return String(p.name || '').trim(); }).forEach(function (p) {
      insert_('Projects', { name: String(p.name).trim(), country: p.country || '', units: (p.units || []).join(', '), active: 'TRUE' });
    });
    return api_bootstrap().projects;
  });
}

/* ---------- الأدمن ---------- */
function api_adminData_() {
  const s = settings_();
  return {
    users: users_().map(function (x) { return { email: x.email, name: x.name, role: x.role, active: truthy_(x.active), receivesLeads: truthy_(x.receivesLeads), phone: x.phone }; }),
    settings: s,
    metaTokenSet: !!secret_('META_PAGE_TOKEN'),
    intakeSecret: secret_('INTAKE_SECRET'),
    spreadsheetUrl: ss_().getUrl(),
    spreadsheetId: ss_().getId(),
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
      throw new Error('مينفعش تشيل نفسك من الأدمن.');
    }
    const sh = sh_('Users');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.Users.length).clearContent();
    clearCache_('Users');
    clean.forEach(function (x) { insert_('Users', x); });
    return api_adminData_();
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
      if (DEFAULT_SETTINGS[k]) setSetting_(k, String(map[k] == null ? '' : map[k]).trim());
    });
    if (settings_().DIGEST_HOUR !== before) installTriggers_();
    return api_adminData_();
  });
}

function api_clearMetaToken() {
  requireAdmin_(me_());
  PropertiesService.getScriptProperties().deleteProperty('META_PAGE_TOKEN');
  return api_adminData_();
}

function api_testMeta() {
  requireAdmin_(me_());
  return testMeta_();
}

function api_runAutomationsNow() {
  requireAdmin_(me_());
  runAutomations();
  return api_adminData_();
}
