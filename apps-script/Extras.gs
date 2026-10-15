/**
 * In-app notifications, monthly targets, client files (Google Drive) and the activity feed.
 */

/* ---------- notifications ---------- */
function notify_(emails, type, text, leadId) {
  const now = nowIso_();
  [].concat(emails || []).forEach(function (e) {
    e = String(e || '').toLowerCase();
    if (!e || e === 'system') return;
    insert_('Notifications', { id: uid_(), email: e, at: now, type: type || 'info', text: String(text || '').slice(0, 300), leadId: leadId || '', read: '' });
  });
}

function myNotifications_(u) {
  const mine = rows_('Notifications').filter(function (n) { return n.email === u.email; });
  const unread = mine.filter(function (n) { return !n.read; }).length;
  const lm = leadMap_();
  const list = mine.slice(-40).reverse().map(function (n) {
    const c = clean_(n);
    const l = lm[n.leadId];
    c.read = !!n.read;
    c.leadName = l && canSee_(u, l) ? (l.name || l.phone) : '';
    if (!c.leadName) c.leadId = '';
    return c;
  });
  return { unread: unread, list: list };
}

function api_markRead(ids) {
  const u = me_();
  return withLock_(function () {
    const all = ids === 'all';
    rows_('Notifications').filter(function (n) { return n.email === u.email && !n.read && (all || (ids || []).indexOf(n.id) >= 0); })
      .forEach(function (n) { update_('Notifications', n, { read: nowIso_() }); });
    return myNotifications_(u);
  });
}

/** Keep the sheet small: drop notifications older than 45 days once it passes 3,000 rows */
function pruneNotifications_() {
  const rows = rows_('Notifications');
  if (rows.length < 3000) return;
  const cutoff = new Date(Date.now() - 45 * 864e5).toISOString();
  const keep = rows.filter(function (n) { return n.at >= cutoff; });
  const sh = sh_('Notifications');
  const head = SCHEMA.Notifications;
  sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (keep.length) {
    const r = sh.getRange(2, 1, keep.length, head.length);
    r.setNumberFormat('@');
    r.setValues(keep.map(function (n) { return head.map(function (h) { return cell_(n[h]); }); }));
  }
  clearCache_('Notifications');
}

/* ---------- monthly targets ---------- */
function monthOf_(ymd) { return String(ymd || today_()).slice(0, 7); }

function visibleTargets_(u) {
  const t = today_();
  const months = [monthOf_(t), monthOf_(addDays_(t.slice(0, 8) + '01', -1)), monthOf_(addDays_(t.slice(0, 8) + '28', 7))];
  return rows_('Targets').filter(function (r) { return months.indexOf(r.month) >= 0 && (isManager_(u) || r.email === u.email); })
    .map(function (r) { return { month: r.month, email: r.email, salesTarget: Number(r.salesTarget) || 0, dealsTarget: Number(r.dealsTarget) || 0, visitsTarget: Number(r.visitsTarget) || 0 }; });
}

function api_saveTargets(month, list) {
  const u = me_();
  requireManager_(u);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Pick a month.');
  return withLock_(function () {
    (list || []).forEach(function (x) {
      const email = String(x.email || '').toLowerCase();
      if (!email) return;
      const vals = { salesTarget: String(Number(x.salesTarget) || ''), dealsTarget: String(Number(x.dealsTarget) || ''), visitsTarget: String(Number(x.visitsTarget) || '') };
      const r = rows_('Targets').find(function (t) { return t.month === month && t.email === email; });
      if (r) update_('Targets', r, vals);
      else if (vals.salesTarget || vals.dealsTarget || vals.visitsTarget) insert_('Targets', Object.assign({ month: month, email: email }, vals));
    });
    return visibleTargets_(u);
  });
}

/* ---------- client files on Google Drive ---------- */
function filesFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILES_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ } }
  const f = DriveApp.createFolder('EDEN CRM — Client files');
  props.setProperty('FILES_FOLDER_ID', f.getId());
  return f;
}

function filesFor_(leadId) {
  return rows_('Files').filter(function (f) { return f.leadId === leadId; })
    .map(function (f) { const c = clean_(f); delete c.driveId; c.byName = displayName_(f.by); return c; })
    .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
}

function api_uploadFile(leadId, name, mime, base64) {
  const u = me_();
  const lead = visibleLead_(u, leadId);
  const bytes = Utilities.base64Decode(String(base64 || ''));
  if (!bytes.length) throw new Error('The file is empty.');
  if (bytes.length > MAX_FILE_MB * 1048576) throw new Error('Files can be up to ' + MAX_FILE_MB + ' MB.');
  const clean = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  const blob = Utilities.newBlob(bytes, mime || 'application/octet-stream', clean);
  const file = filesFolder_().createFile(blob);
  file.setDescription('EDEN CRM · ' + (lead.name || lead.phone) + ' · ' + lead.id);
  return withLock_(function () {
    insert_('Files', { id: uid_(), leadId: lead.id, name: clean, mime: blob.getContentType(), size: String(bytes.length), driveId: file.getId(), at: nowIso_(), by: u.email });
    logAct_(lead.id, u.email, 'note', 'Uploaded file: ' + clean);
    return { files: filesFor_(lead.id), detail: api_getLead(lead.id) };
  });
}

function fileRow_(u, id) {
  const f = rows_('Files').find(function (x) { return x.id === id; });
  if (!f) throw new Error('File not found.');
  visibleLead_(u, f.leadId);
  return f;
}

function api_getFile(id) {
  const u = me_();
  const f = fileRow_(u, id);
  const blob = DriveApp.getFileById(f.driveId).getBlob();
  return { name: f.name, mime: f.mime, base64: Utilities.base64Encode(blob.getBytes()) };
}

function api_deleteFile(id) {
  const u = me_();
  const f = fileRow_(u, id);
  if (!isManager_(u) && f.by !== u.email) throw new Error('Only the person who uploaded it or a manager can delete this file.');
  return withLock_(function () {
    try { DriveApp.getFileById(f.driveId).setTrashed(true); } catch (e) { /* already gone */ }
    deleteRow_('Files', rows_('Files').find(function (x) { return x.id === id; }));
    logAct_(f.leadId, u.email, 'note', 'Deleted file: ' + f.name);
    return { files: filesFor_(f.leadId), detail: api_getLead(f.leadId) };
  });
}

/* ---------- activity feed ---------- */
function api_feed(limit) {
  const u = me_();
  const lm = leadMap_();
  const n = Math.min(80, Math.max(5, Number(limit) || 25));
  const out = [];
  const acts = rows_('Activities');
  for (let i = acts.length - 1; i >= 0 && out.length < n; i--) {
    const a = acts[i];
    const l = lm[a.leadId];
    if (!l || !canSee_(u, l)) continue;
    const c = clean_(a);
    c.leadName = l.name || l.phone;
    out.push(c);
  }
  return out;
}
