// Pushes apps-script/ to the Apps Script project and updates the web app deployment
// through the Apps Script API — no clasp, no local machine.
//
// Needs (GitHub → Settings → Secrets and variables → Actions):
//   secret   CLASPRC_JSON      contents of .clasprc.json from `npx clasp login`
//   variable SCRIPT_ID         Apps Script project ID
//   variable GOOGLE_CLIENT_ID  OAuth client ID used for "Sign in with Google"
//   variable SITE_URL          optional, default https://crm.edenalkhalij.com
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DESC = 'EDEN CRM API';
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };
const fail = (m) => { console.log(`::error::${m}`); process.exit(1); };

const { CLASPRC_JSON, SCRIPT_ID, GOOGLE_CLIENT_ID = '', FORCE = '' } = process.env;
const SITE_URL = process.env.SITE_URL || 'https://crm.edenalkhalij.com';
if (!CLASPRC_JSON || !SCRIPT_ID) {
  console.log('::warning::CLASPRC_JSON secret or SCRIPT_ID variable is missing — skipping the Apps Script deploy. See SETUP-AR.md.');
  out('api_url', process.env.API_URL_FALLBACK || '');
  process.exit(0);
}

// Supports both clasp v2 and v3 .clasprc.json formats
function credentials() {
  let j;
  try { j = JSON.parse(CLASPRC_JSON); } catch { fail('CLASPRC_JSON is not valid JSON. Paste the whole content of .clasprc.json.'); }
  if (j.tokens) {
    const t = j.tokens.default || Object.values(j.tokens)[0] || {};
    return { client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token };
  }
  if (j.token) {
    const o = j.oauth2ClientSettings || {};
    return { client_id: o.clientId, client_secret: o.clientSecret, refresh_token: j.token.refresh_token };
  }
  fail('CLASPRC_JSON does not look like a clasp login file.');
}

async function accessToken() {
  const c = credentials();
  if (!c.client_id || !c.refresh_token) fail('CLASPRC_JSON has no refresh token. Run `npx clasp login` again and paste the new file.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...c, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) fail('Google refused the clasp login (' + (j.error_description || j.error || r.status) + '). Run `npx clasp login` again and update CLASPRC_JSON.');
  return j.access_token;
}

const TOKEN = await accessToken();
async function gas(method, url, body) {
  const r = await fetch('https://script.googleapis.com/v1/projects/' + SCRIPT_ID + url, {
    method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || r.statusText;
    if (/not enabled|has not been used|disabled/i.test(m)) fail('The Apps Script API is off for this account. Turn it on at https://script.google.com/home/usersettings then re-run this workflow.');
    if (r.status === 404) fail('Apps Script project not found. Check the SCRIPT_ID variable.');
    fail(`Apps Script API ${method} ${url}: ${m}`);
  }
  return j;
}

// Build the file set
const dir = path.resolve('apps-script');
const files = fs.readdirSync(dir).sort().flatMap((f) => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (f === 'appsscript.json') return [{ name: 'appsscript', type: 'JSON', source: src }];
  if (f.endsWith('.gs')) return [{ name: f.slice(0, -3), type: 'SERVER_JS', source: src }];
  if (f.endsWith('.html')) return [{ name: f.slice(0, -5), type: 'HTML', source: src }];
  return [];
});
files.push({
  name: 'Generated', type: 'SERVER_JS',
  source: `// Written by GitHub Actions — do not edit.\nconst GOOGLE_CLIENT_ID = ${JSON.stringify(GOOGLE_CLIENT_ID)};\nconst SITE_URL = ${JSON.stringify(SITE_URL)};\n`,
});
const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);

const list = await gas('GET', '/deployments');
const mine = (list.deployments || []).find((d) => (d.deploymentConfig?.description || '').startsWith(DESC));
const urlOf = (d) => (d.entryPoints || []).find((e) => e.entryPointType === 'WEB_APP')?.webApp?.url || `https://script.google.com/macros/s/${d.deploymentId}/exec`;

if (mine && (mine.deploymentConfig.description || '').includes(hash) && !FORCE) {
  console.log('Apps Script code unchanged — nothing to deploy.');
  out('api_url', urlOf(mine));
  process.exit(0);
}

await gas('PUT', '/content', { scriptId: SCRIPT_ID, files });
console.log(`Pushed ${files.length} files.`);
const sha = (process.env.GITHUB_SHA || 'manual').slice(0, 7);
const version = await gas('POST', '/versions', { description: `${sha} ${hash}` });
const deploymentConfig = { scriptId: SCRIPT_ID, versionNumber: version.versionNumber, manifestFileName: 'appsscript', description: `${DESC} · ${sha} · ${hash}` };
let dep;
if (mine) {
  dep = await gas('PUT', '/deployments/' + mine.deploymentId, { deploymentConfig });
  console.log(`Updated deployment to version ${version.versionNumber}.`);
} else {
  dep = await gas('POST', '/deployments', deploymentConfig);
  console.log(`Created the web app deployment (version ${version.versionNumber}).`);
}
out('api_url', urlOf(dep));
