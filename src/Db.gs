/**
 * Data layer: a Google Sheet used as the database.
 * Every cell is stored as plain text (format @) so phone numbers and dates never change.
 * Rows are cached per execution; inserts and updates keep the cache in sync.
 */
let SS_ = null;
const CACHE_ = {};

function ss_() {
  if (SS_) return SS_;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('EDEN CRM is not set up yet: the admin must run setup() from the Apps Script editor.');
  SS_ = SpreadsheetApp.openById(id);
  return SS_;
}

function sh_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" is missing. Run setup() again.');
  return sh;
}

/** All rows of a sheet as objects, each with _row (its row number). */
function rows_(name) {
  if (CACHE_[name]) return CACHE_[name];
  const sh = sh_(name);
  const head = SCHEMA[name];
  const last = sh.getLastRow();
  const out = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    vals.forEach(function (r, i) {
      if (r.every(function (v) { return v === '' || v === null; })) return;
      const o = { _row: i + 2 };
      head.forEach(function (h, j) {
        let v = r[j];
        if (v instanceof Date) v = Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
        o[h] = v === null || v === undefined ? '' : String(v);
      });
      out.push(o);
    });
  }
  CACHE_[name] = out;
  return out;
}

function clearCache_(name) { delete CACHE_[name]; }

function str_(v) { return v === null || v === undefined ? '' : String(v); }

function cell_(v) {
  const s = str_(v);
  // Never let outside data (Meta / website) become a formula
  return /^=/.test(s) ? "'" + s : s;
}

function insert_(name, obj) {
  const head = SCHEMA[name];
  const sh = sh_(name);
  const row = sh.getLastRow() + 1;
  const range = sh.getRange(row, 1, 1, head.length);
  range.setNumberFormat('@');
  range.setValues([head.map(function (h) { return cell_(obj[h]); })]);
  const rec = { _row: row };
  head.forEach(function (h) { rec[h] = str_(obj[h]); });
  if (CACHE_[name]) CACHE_[name].push(rec);
  return rec;
}

function update_(name, rowObj, patch) {
  const head = SCHEMA[name];
  const merged = Object.assign({}, rowObj);
  Object.keys(patch).forEach(function (k) { merged[k] = str_(patch[k]); });
  sh_(name).getRange(rowObj._row, 1, 1, head.length)
    .setValues([head.map(function (h) { return cell_(merged[h]); })]);
  if (CACHE_[name]) {
    const i = CACHE_[name].findIndex(function (r) { return r._row === rowObj._row; });
    if (i >= 0) CACHE_[name][i] = merged;
  }
  return merged;
}

function deleteRow_(name, rowObj) {
  sh_(name).deleteRow(rowObj._row);
  clearCache_(name);
}

/** Deletes several rows of one sheet (bottom-up so row numbers stay valid). */
function deleteRows_(name, list) {
  list.slice().sort(function (a, b) { return b._row - a._row; })
    .forEach(function (r) { sh_(name).deleteRow(r._row); });
  clearCache_(name);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- helpers ---------- */
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function nowIso_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function ymdOf_(iso) { const d = new Date(iso); return iso && !isNaN(d) ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : ''; }
function fmtDateTime_(d) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), TZ, 'EEE d MMM, HH:mm'); }
function addDays_(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function digits_(p) { return String(p || '').replace(/\D/g, ''); }
/** Normalised number for matching and WhatsApp: Egypt 01xxxxxxxxx → 201xxxxxxxxx, Georgia 5xxxxxxxx → 9955xxxxxxxx */
function phoneKey_(p) {
  let d = digits_(p);
  if (!d) return '';
  if (d.indexOf('00') === 0) d = d.slice(2);
  else if (/^01\d{9}$/.test(d)) d = '2' + d;
  else if (/^5\d{8}$/.test(d)) d = '995' + d;
  return d;
}
function truthy_(v) { return v === true || /^(true|1|yes|y|x|✓)$/i.test(String(v || '').trim()); }
function clean_(o) { const c = Object.assign({}, o); delete c._row; return c; }
function srcLabel_(s) { return SOURCE_LABEL[s] || s || ''; }
function isOpen_(stage) { return OPEN_STAGES.indexOf(stage || 'new') >= 0; }
function hoursSince_(iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : (Date.now() - t) / 36e5; }
function money_(v, c) { return Number(v) ? Number(v).toLocaleString('en-US') + ' ' + (c || 'EGP') : ''; }
function tagsNorm_(s) {
  const seen = {};
  return String(s || '').split(/[,،\n]+/).map(function (t) { return t.trim(); })
    .filter(function (t) { const k = t.toLowerCase(); if (!t || seen[k]) return false; seen[k] = 1; return true; })
    .slice(0, 12).join(', ');
}

/* ---------- settings ---------- */
function settings_() {
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k][0]; });
  rows_('Settings').forEach(function (r) { if (r.key) out[r.key] = r.value; });
  return out;
}
function setSetting_(key, value) {
  const r = rows_('Settings').find(function (x) { return x.key === key; });
  if (r) update_('Settings', r, { value: value });
  else insert_('Settings', { key: key, value: value, description: (DEFAULT_SETTINGS[key] || [])[1] || '' });
}
function secret_(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }
function appUrl_() {
  const s = settings_().APP_URL;
  if (s) return s;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function templates_() {
  try {
    const t = JSON.parse(settings_().WA_TEMPLATES || '[]');
    if (Array.isArray(t)) return t.filter(function (x) { return x && x.name && x.text; });
  } catch (e) { /* fall through */ }
  return DEFAULT_TEMPLATES;
}
