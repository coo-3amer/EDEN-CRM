/**
 * Web API for the website at crm.edenalkhalij.com.
 *
 * The site posts JSON as text/plain (no CORS preflight):
 *   { fn: 'auth', idToken }              → Google sign-in → returns a signed session
 *   { fn: 'api_…', args: [...], session } → runs one CRM action as the signed-in user
 *   { action: 'intake', secret, ...fields } → a lead from the website form
 *
 * The web app is deployed "Execute as: Me, Who has access: Anyone", so the browser
 * needs no Google cookies. Who the user is comes only from the verified session.
 */
function apiMap_() {
  return {
    api_bootstrap: api_bootstrap, api_sync: api_sync, api_getLead: api_getLead, api_saveLead: api_saveLead,
    api_changeStage: api_changeStage, api_addActivity: api_addActivity, api_deleteLead: api_deleteLead,
    api_bulkAssign: api_bulkAssign, api_saveTask: api_saveTask, api_completeTask: api_completeTask,
    api_cancelTask: api_cancelTask, api_reserveUnit: api_reserveUnit, api_releaseUnit: api_releaseUnit,
    api_saveUnit: api_saveUnit, api_importUnits: api_importUnits, api_deleteUnit: api_deleteUnit,
    api_activityReport: api_activityReport, api_importRows: api_importRows, api_saveProjects: api_saveProjects,
    api_saveTemplates: api_saveTemplates, api_saveUsers: api_saveUsers, api_saveSettings: api_saveSettings,
    api_testMeta: api_testMeta, api_runAutomationsNow: api_runAutomationsNow,
    api_markRead: api_markRead, api_saveTargets: api_saveTargets, api_uploadFile: api_uploadFile,
    api_getFile: api_getFile, api_deleteFile: api_deleteFile, api_feed: api_feed,
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, service: APP_NAME, site: siteUrl_() });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { body = (e && e.parameter) || {}; }
  return json_(handleRequest_(body));
}

function handleRequest_(body) {
  CURRENT_EMAIL_ = '';
  try {
    if (body.action === 'intake') return intakeRequest_(body);
    if (body.fn === 'auth') return { ok: true, result: signIn_(body.idToken) };
    if (body.fn === 'sendCode') return { ok: true, result: sendCode_(body.email) };
    if (body.fn === 'verifyCode') return { ok: true, result: verifyCode_(body.email, body.code) };
    const fn = apiMap_()[body.fn];
    if (!fn) throw new Error('Unknown action.');
    CURRENT_EMAIL_ = verifySession_(body.session);
    const result = fn.apply(null, Array.isArray(body.args) ? body.args : []);
    return { ok: true, result: result === undefined ? null : result };
  } catch (err) {
    console.error(body.fn || body.action, err);
    return { ok: false, error: String((err && err.message) || err), auth: !!(err && err.auth) };
  } finally {
    CURRENT_EMAIL_ = '';
  }
}

/* ---------- sign-in ---------- */
function signIn_(idToken) {
  if (!idToken) throw authError_('Sign in with your company Google account.');
  const cid = clientId_();
  if (!cid) throw new Error('Google sign-in is not configured yet (GOOGLE_CLIENT_ID is missing).');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('Google sign-in failed. Please try again.');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== cid) throw authError_('This Google sign-in was not made for EDEN CRM.');
  if (String(t.email_verified) !== 'true') throw authError_('Your Google email is not verified.');
  if (Number(t.exp) * 1000 < Date.now()) throw authError_('Google sign-in expired. Please try again.');
  const email = String(t.email || '').toLowerCase();
  const u = userByEmail_(email);
  if (!u || !truthy_(u.active)) throw authError_('Your account (' + email + ') has not been added to EDEN CRM or is inactive. Ask the admin to add you.');
  const exp = Date.now() + SESSION_HOURS * 36e5;
  return { session: makeSession_(email, exp), email: email, exp: exp };
}

function sessionKey_() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('SESSION_SECRET');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SESSION_SECRET', k);
  }
  return k;
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, sessionKey_()));
}

function makeSession_(email, exp) {
  const p = Utilities.base64EncodeWebSafe(email + '|' + exp, Utilities.Charset.UTF_8);
  return p + '.' + sign_(p);
}

function verifySession_(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 2 || !parts[0] || sign_(parts[0]) !== parts[1]) throw authError_('Please sign in again.');
  const raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  const i = raw.lastIndexOf('|');
  const exp = Number(raw.slice(i + 1));
  if (i < 1 || !exp || Date.now() > exp) throw authError_('Your sign-in has ended. Please sign in again.');
  return raw.slice(0, i).toLowerCase();
}

/* ---------- sign-in with a one-time code by email ---------- */
const CODE_MINUTES_ = 10, CODE_TRIES_ = 5;

function codeHash_(email, code) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(email + '|' + code, sessionKey_()));
}

function activeUser_(email) {
  const u = userByEmail_(email);
  if (!u || !truthy_(u.active)) throw authError_('Your account (' + email + ') has not been added to EDEN CRM or is inactive. Ask the admin to add you.');
  return u;
}

function sendCode_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw authError_('Enter your email address.');
  const u = activeUser_(email);
  const cache = CacheService.getScriptCache();
  const key = 'otp:' + email;
  const prev = JSON.parse(cache.get(key) || 'null');
  if (prev && Date.now() - prev.sent < 60000) throw authError_('A code was just sent. Wait a minute before asking for another one.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ h: codeHash_(email, code), tries: 0, sent: Date.now(), exp: Date.now() + CODE_MINUTES_ * 60000 }), CODE_MINUTES_ * 60);
  MailApp.sendEmail({
    to: email, name: APP_NAME, subject: 'Your EDEN CRM sign-in code: ' + code,
    htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18221E">' +
      '<p>Hi ' + esc_(u.name || '') + ',</p><p>Your EDEN CRM sign-in code is</p>' +
      '<p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:8px 0">' + code + '</p>' +
      '<p style="color:#5B6A62">It works for ' + CODE_MINUTES_ + ' minutes. If you did not try to sign in, ignore this email.</p></div>',
  });
  return { sent: true, minutes: CODE_MINUTES_ };
}

function verifyCode_(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').replace(/\D/g, '');
  const cache = CacheService.getScriptCache();
  const key = 'otp:' + email;
  const rec = JSON.parse(cache.get(key) || 'null');
  if (!rec || Date.now() > rec.exp) throw authError_('This code has expired. Ask for a new one.');
  if (rec.tries >= CODE_TRIES_) { cache.remove(key); throw authError_('Too many wrong tries. Ask for a new code.'); }
  if (codeHash_(email, code) !== rec.h) {
    rec.tries++;
    cache.put(key, JSON.stringify(rec), Math.max(1, Math.round((rec.exp - Date.now()) / 1000)));
    throw authError_('That code is not right. Check the latest email and try again.');
  }
  cache.remove(key);
  activeUser_(email);
  const exp = Date.now() + SESSION_HOURS * 36e5;
  return { session: makeSession_(email, exp), email: email, exp: exp };
}

/** Ends every open session (e.g. after a phone is lost): rotate the key */
function signOutEveryone() {
  PropertiesService.getScriptProperties().deleteProperty('SESSION_SECRET');
  Logger.log('Everyone has been signed out.');
}

/* ---------- website form ---------- */
function intakeRequest_(p) {
  const secret = secret_('INTAKE_SECRET');
  if (!secret || p.secret !== secret) return { ok: false, error: 'unauthorized' };
  const clean = {};
  Object.keys(p).slice(0, 30).forEach(function (k) {
    if (k === 'secret' || k === 'action') return;
    clean[String(k).slice(0, 40)] = String(p[k] == null ? '' : p[k]).slice(0, 1000);
  });
  if (!clean.name && !clean.full_name && !clean.phone && !clean.phone_number) return { ok: false, error: 'name or phone required' };
  withLock_(function () {
    insert_('Inbox', { receivedAt: nowIso_(), source: clean.source || 'website', payload: JSON.stringify(clean), status: '', leadId: '', error: '' });
    processInbox_();
  });
  return { ok: true };
}
