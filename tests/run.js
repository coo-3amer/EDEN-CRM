// End-to-end tests of the EDEN CRM server code on a mocked Apps Script runtime
const fs = require('fs'), vm = require('vm'), path = require('path');
const makeEnv = require('./mock.js');
const SRC = path.join(__dirname, '..', 'apps-script');
let NOW = Date.parse('2026-10-13T08:00:00Z');
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { a.length ? super(...a) : super(NOW); } static now() { return NOW; } }
const { ctx: mocks, st, ss } = makeEnv({ now: () => NOW });
const ctx = Object.assign({ console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, encodeURIComponent, decodeURIComponent, TextEncoder, TextDecoder, Uint8Array, Date: FakeDate }, mocks);
vm.createContext(ctx);
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort()) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
const as = (email, fn, ...args) => { st.activeEmail = email; vm.runInContext('Object.keys(CACHE_).forEach(function(k){delete CACHE_[k]})', ctx); return ctx[fn](...args); };
const fresh = () => vm.runInContext('Object.keys(CACHE_).forEach(function(k){delete CACHE_[k]})', ctx);
let pass = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else pass++; };
const throws = (f, re, m) => { try { f(); ok(false, m + ' (no throw)'); } catch (e) { ok(re.test(e.message), m + ' → ' + e.message); } };
const A = 'coo@edenalkhalij.com', M = 'mgr@edenalkhalij.com', SA = 'a@edenalkhalij.com', SB = 'b@edenalkhalij.com';
const lead = (who, id) => as(who, 'api_getLead', id).lead;

// 1. setup (with a v1-style project that has unit codes)
ctx.setup();
ok(st.props.SPREADSHEET_ID === 'SSID' && st.props.INTAKE_SECRET && st.props.CALENDAR_ID === 'CAL1', 'setup props + calendar');
ok(!ss.sheets.Sheet1 && ss.sheets.Units && ss.sheets.Tasks, 'sheets created');
ok(st.triggers.length === 2, 'triggers installed');
ss.sheets.Projects.appendRow(['Old Project', 'Egypt', 'OP-1, OP-2', 'TRUE']);
ctx.setup(); ok(st.triggers.length === 2, 'setup idempotent');
ok(ss.sheets.Units.data.filter(r => r[0]).length === 3 && ss.sheets.Projects.data[1][2] === '', 'v1 project units migrated');

// 2. users
throws(() => as('stranger@gmail.com', 'api_bootstrap'), /has not been added/, 'unknown user blocked');
as(A, 'api_saveUsers', [
  { email: A, name: 'COO', role: 'admin', active: true, receivesLeads: false },
  { email: M, name: 'Manager', role: 'manager', active: true, receivesLeads: false },
  { email: SA, name: 'Ahmed Ali', role: 'sales', active: true, receivesLeads: true },
  { email: SB, name: 'Basma', role: 'sales', active: true, receivesLeads: true },
]);
throws(() => as(SA, 'api_saveUsers', []), /Only the admin/, 'sales cannot edit users');
throws(() => as(A, 'api_saveUsers', [{ email: SA, role: 'sales', active: true }]), /remove yourself/, 'admin cannot remove self');
as(M, 'api_saveProjects', [{ name: 'Eden Walk', country: 'Egypt' }, { name: 'Tbilisi Heights', country: 'Georgia' }]);
const imp = as(M, 'api_importUnits', [
  { code: 'ew-101', project: 'Eden Walk', type: 'Shop', floor: 'GF', area: '45', price: '3,500,000', currency: 'EGP' },
  { code: 'EW-102', project: 'Eden Walk', type: 'Shop', floor: 'GF', area: '60', price: '4800000' },
  { code: 'TH-1', project: 'Tbilisi Heights', type: 'Apartment', price: '120000', currency: 'USD', status: 'blocked' },
]);
ok(imp.added === 3 && imp.units.find(u => u.code === 'EW-101').price === '3500000', 'units imported + normalised');
ok(imp.units.find(u => u.code === 'TH-1').status === 'blocked', 'import status blocked');
const bs = as(A, 'api_bootstrap');
ok(bs.projects.length === 2 && bs.admin && bs.people.length === 4 && bs.templates.length === 5 && bs.cfg.allowExport, 'bootstrap admin');
const bsa = as(SA, 'api_bootstrap');
ok(!bsa.admin && bsa.cfg.allowExport === false && bsa.units.length === 5, 'sales bootstrap');
throws(() => as(SA, 'api_saveUnit', { code: 'X' }), /Only managers/, 'sales cannot edit units');

// 3. leads + auto distribution
st.mails = [];
const r1 = as(M, 'api_saveLead', { name: 'Client One', phone: '01012345678', ownerEmail: 'auto', project: 'Eden Walk', rating: 'hot', tags: 'investor, cash, Investor' });
NOW += 60e3;
const r2 = as(M, 'api_saveLead', { name: 'Client Two', phone: '01112345678', ownerEmail: 'auto' });
const L1 = r1.detail.lead, L2 = r2.detail.lead;
ok(L1.ownerEmail !== L2.ownerEmail && [L1, L2].every(l => /^[ab]@/.test(l.ownerEmail)), 'auto-assign balances');
ok(L1.rating === 'hot' && L1.tags === 'investor, cash', 'rating + tags normalised');
ok(st.mails.length === 2 && /New lead/.test(st.mails[0].subject), 'new-lead emails');
ok(L1.phoneKey === undefined, 'phoneKey not exposed');
const owner1 = L1.ownerEmail, other = owner1 === SA ? SB : SA;

// 4. duplicates
const d = as(M, 'api_saveLead', { name: 'dup', phone: '+20 101 234 5678' });
ok(d.duplicate && d.duplicate.canForce && d.duplicate.id === L1.id, 'manager sees duplicate');
const d2 = as(other, 'api_saveLead', { name: 'dup', phone: '01012345678' });
ok(d2.duplicate && d2.duplicate.id === null && d2.duplicate.name === '' && !d2.duplicate.canForce, 'sales duplicate hides details');
const d3 = as(other, 'api_saveLead', { name: 'dup', phone: '01012345678', force: true });
ok(d3.duplicate, 'sales cannot force duplicate');

// 5. privacy
const vis = as(owner1, 'api_sync').leads.map(l => l.id);
ok(vis.includes(L1.id) && !vis.includes(L2.id), 'sales sees only own');
throws(() => as(owner1, 'api_getLead', L2.id), /not one of yours/, 'sales cannot open others lead');
throws(() => as(owner1, 'api_changeStage', L2.id, 'won', {}), /not one of yours/, 'sales cannot change others');
as(owner1, 'api_saveLead', { id: L1.id, name: 'Client 1x', ownerEmail: other });
ok(lead(M, L1.id).ownerEmail === owner1 && lead(M, L1.id).name === 'Client 1x', 'sales edit ok, reassign ignored');
const s1 = as(SA, 'api_saveLead', { name: 'Walk-in', phone: '01234567890', ownerEmail: SB });
ok(s1.detail.lead.ownerEmail === SA, 'sales lead assigned to self');
as(owner1, 'api_saveLead', { id: L1.id, rating: 'warm' });
ok(lead(M, L1.id).rating === 'warm' && as(M, 'api_getLead', L1.id).activities.some(a => /Rating: Warm/.test(a.text)), 'rating change logged');

// 6. activity → contacted
const a1 = as(owner1, 'api_addActivity', L1.id, { type: 'call', text: 'Called him', nextFollowUp: '2026-10-15' });
ok(a1.detail.lead.stage === 'contacted' && a1.detail.lead.firstContactAt && a1.detail.lead.nextFollowUp === '2026-10-15', 'call moves to contacted');
throws(() => as(owner1, 'api_addActivity', L1.id, { type: 'note' }), /Write what happened/, 'empty note rejected');

// 7. tasks + calendar
st.mails = [];
const due = new Date(NOW + 26 * 3600e3).toISOString(); // tomorrow
const t1 = as(M, 'api_saveTask', { leadId: L1.id, type: 'visit', title: '', dueAt: due, notes: 'Bring brochure' });
const task1 = t1.tasks.find(t => t.leadId === L1.id);
ok(task1 && task1.ownerEmail === owner1 && task1.onCalendar && /Site visit/.test(task1.title), 'manager task for lead owner on calendar');
const ev = Object.values(st.events)[0];
ok(ev && ev.guests.includes(owner1) && /Client 1x/.test(ev.title), 'calendar event with agent invited');
ok(st.mails.some(m => m.to === owner1 && /New task/.test(m.subject)), 'task email to agent');
ok(t1.detail.lead.nextFollowUp === ymd(due), 'task pulls follow-up earlier? ' + t1.detail.lead.nextFollowUp);
throws(() => as(other, 'api_completeTask', task1.id, ''), /Task not found/, 'other agent cannot complete task');
const tSales = as(owner1, 'api_saveTask', { leadId: L1.id, type: 'call', dueAt: new Date(NOW + 30 * 60e3).toISOString(), ownerEmail: other });
const callTask = tSales.tasks.find(t => t.type === 'call');
ok(callTask.ownerEmail === owner1 && !callTask.onCalendar, 'sales task always own, calls not on calendar');
throws(() => as(owner1, 'api_saveTask', { leadId: L1.id, type: 'call', dueAt: 'nope' }), /date and time/, 'bad due date');
// reschedule visit
const later = new Date(NOW + 50 * 3600e3).toISOString();
as(owner1, 'api_saveTask', { id: task1.id, dueAt: later });
ok(Object.values(st.events)[0].start.toISOString() === later, 'calendar event moved');
// reminder
st.mails = []; ctx.runAutomations();
ok(st.mails.some(m => /Reminder:/.test(m.subject) && m.to === owner1), 'task reminder sent');
st.mails = []; ctx.runAutomations(); ok(!st.mails.some(m => /Reminder:/.test(m.subject)), 'reminder not repeated');
// complete call task
const done = as(owner1, 'api_completeTask', callTask.id, 'No answer, will retry');
ok(done.tasks.find(t => t.id === callTask.id).status === 'done' && done.detail.activities.some(a => a.type === 'call' && /No answer/.test(a.text)), 'completing call logs a call');

// 8. units: reserve / conflicts / switch / expiry / won
throws(() => as(other, 'api_reserveUnit', L1.id, 'EW-101', 7, ''), /not one of yours/, 'cannot reserve for others lead');
const rs = as(owner1, 'api_reserveUnit', L1.id, 'ew-101', 7, 'Paid 50k cheque');
const u101 = rs.units.find(u => u.code === 'EW-101');
ok(u101.status === 'reserved' && u101.leadName === 'Client 1x' && rs.detail.lead.unit === 'EW-101' && rs.detail.lead.project === 'Eden Walk', 'reserved');
const otherView = as(other, 'api_sync').units.find(u => u.code === 'EW-101');
ok(otherView.status === 'reserved' && otherView.leadName === '' && otherView.leadId === '' && otherView.reservedBy === undefined, 'other agent sees reserved without client');
const L3 = as(other, 'api_saveLead', { name: 'Competitor', phone: '01000000003' }).detail.lead;
as(other, 'api_addActivity', L3.id, { type: 'call', text: 'Intro call' });
throws(() => as(other, 'api_reserveUnit', L3.id, 'EW-101', 7, ''), /already reserved/, 'double booking blocked');
throws(() => as(other, 'api_reserveUnit', L3.id, 'TH-1', 7, ''), /blocked/, 'blocked unit');
throws(() => as(other, 'api_changeStage', L3.id, 'won', { unit: 'EW-101' }), /reserved for another client/, 'cannot sell unit reserved for another');
throws(() => as(other, 'api_releaseUnit', 'EW-101'), /Only the client/, 'other agent cannot release');
const sw = as(owner1, 'api_reserveUnit', L1.id, 'EW-102', 3, '');
ok(sw.units.find(u => u.code === 'EW-101').status === 'available' && sw.units.find(u => u.code === 'EW-102').status === 'reserved', 'switching releases old unit');
// expiry
NOW += 4 * 86400e3; st.mails = []; ctx.runAutomations();
ok(as(M, 'api_sync').units.find(u => u.code === 'EW-102').status === 'available' && st.mails.some(m => /Reservation expired/.test(m.subject)), 'reservation expired');
// won with unit → sold, deal value from price
as(owner1, 'api_reserveUnit', L1.id, 'EW-101', 7, '');
st.mails = [];
const w = as(owner1, 'api_changeStage', L1.id, 'won', { dealValue: '', currency: '', unit: 'EW-101' });
ok(w.detail.lead.stage === 'won' && w.detail.lead.dealValue === '3500000' && w.detail.lead.currency === 'EGP', 'won takes unit price');
ok(w.units.find(u => u.code === 'EW-101').status === 'sold', 'unit sold');
ok(w.tasks.filter(t => t.leadId === L1.id && t.status === 'open').every(t => t.type === 'visit'), 'won cancels open call tasks, keeps visit');
ok(st.mails.some(m => /New sale/.test(m.subject)), 'won email');
throws(() => as(other, 'api_reserveUnit', L3.id, 'EW-101', 7, ''), /already sold/, 'sold unit cannot be reserved');
// lost releases + cancels tasks
as(other, 'api_reserveUnit', L3.id, 'EW-102', 7, '');
as(other, 'api_saveTask', { leadId: L3.id, type: 'meeting', dueAt: new Date(NOW + 86400e3).toISOString() });
const evCount = Object.keys(st.events).length;
const lost = as(other, 'api_changeStage', L3.id, 'lost', { lostReason: 'Price' });
ok(lost.units.find(u => u.code === 'EW-102').status === 'available', 'lost releases unit');
ok(!lost.tasks.some(t => t.leadId === L3.id && t.status === 'open') && Object.keys(st.events).length === evCount - 1, 'lost cancels tasks + calendar');
throws(() => as(other, 'api_reserveUnit', L3.id, 'EW-102', 7, ''), /Only open leads/, 'closed lead cannot reserve');
// manager unit edit / status
as(M, 'api_reserveUnit', L2.id, 'EW-102', 5, '');
const ed = as(M, 'api_saveUnit', { originalCode: 'EW-102', code: 'EW-102B', project: 'Eden Walk', price: '5000000', status: 'blocked' });
ok(ed.units.find(u => u.code === 'EW-102B').status === 'blocked' && !ed.units.find(u => u.code === 'EW-102B').leadId, 'manager status change releases');
throws(() => as(M, 'api_saveUnit', { originalCode: 'EW-102B', code: 'TH-1' }), /already exists/, 'code clash');
throws(() => as(M, 'api_deleteUnit', 'OP-1'), /Only the admin/, 'manager cannot delete unit');
throws(() => as(A, 'api_deleteUnit', 'EW-101'), /Release or unsell/, 'cannot delete sold unit');
ok(!as(A, 'api_deleteUnit', 'OP-1').units.some(u => u.code === 'OP-1'), 'admin deletes unit');

// 9. SLA + reassign moves tasks + calendar guest
st.mails = [];
const L4 = as(M, 'api_saveLead', { name: 'Slow', phone: '01055555555', ownerEmail: SB }).detail.lead;
as(M, 'api_saveTask', { leadId: L4.id, type: 'visit', dueAt: new Date(NOW + 72 * 3600e3).toISOString() });
NOW += 3 * 3600e3; ctx.runAutomations();
ok(st.mails.some(m => /waiting for your call/.test(m.subject) && m.to === SB), 'SLA email');
NOW += 22 * 3600e3; st.mails = []; ctx.runAutomations();
const l4 = as(M, 'api_getLead', L4.id);
ok(l4.lead.ownerEmail === SA && l4.lead.reassignCount === '1', 'auto reassigned');
ok(l4.tasks.every(t => t.ownerEmail === SA), 'tasks follow reassignment');
const ev4 = Object.values(st.events).find(e => /Slow/.test(e.title));
ok(ev4 && ev4.guests.includes(SA) && !ev4.guests.includes(SB), 'calendar guest moved');
ok(!st.props.LAST_AUTOMATION_ERROR, 'no automation errors: ' + st.props.LAST_AUTOMATION_ERROR);

// 10. website inbox + Meta
ss.sheets.Inbox.appendRow([new Date().toISOString(), 'website', JSON.stringify({ name: 'Web Lead', phone: '01099999999', project: 'Eden Walk', message: 'Looking for a shop', utm_source: 'google' }), '', '', '']);
ss.sheets.Inbox.appendRow([new Date().toISOString(), 'website', JSON.stringify({ name: 'Again', phone: '01099999999' }), '', '', '']);
ss.sheets.Inbox.appendRow([new Date().toISOString(), 'website', '{bad json', '', '', '']);
ctx.runAutomations();
ok(ss.sheets.Inbox.data.slice(1).map(r => r[3]).join(',') === 'done,duplicate,error', 'inbox statuses');
as(A, 'api_saveSettings', { META_PAGE_TOKEN: 'TKN', META_FORM_IDS: '111222333:Eden Walk' });
st.meta = url => ({ getContentText: () => JSON.stringify(/\/leads/.test(url) ? { data: [{ id: 'L1', created_time: '2026-10-18T09:00:00+0000', campaign_name: 'EW Oct', field_data: [{ name: 'full_name', values: ['Meta Person'] }, { name: 'phone_number', values: ['p:+201055500000'] }] }] } : { name: 'EW Form', leads_count: 1 }), getResponseCode: () => 200 });
ctx.runAutomations(); ctx.runAutomations();
ok(as(M, 'api_sync').leads.filter(l => l.source === 'meta').length === 1, 'meta lead once');
ok(/✓ EW Form/.test(as(A, 'api_testMeta').message), 'meta test');

// 11. activity report
const today = ymd(new Date(NOW).toISOString());
const rep = as(M, 'api_activityReport', '2026-10-01', today);
const ra = rep.rows.find(r => r.email === owner1);
ok(ra && ra.call >= 2 && ra.won === 1 && ra.tasksDone === 1 && ra.wonValue.EGP === 3500000, 'activity report agent row ' + JSON.stringify(ra));
ok(rep.days.length >= 1 && rep.rows.every(r => r.email !== 'system'), 'activity days');
const repS = as(SB, 'api_activityReport', '2026-10-01', today);
ok(repS.rows.every(r => r.email === SB), 'sales sees only own activity');
throws(() => as(M, 'api_activityReport', 'x', today), /valid date range/, 'bad range');

// 12. templates + settings
as(M, 'api_saveTemplates', [{ name: 'Hi', text: 'Hi {name}' }, { name: '', text: 'x' }]);
ok(as(SA, 'api_bootstrap').templates.length === 1, 'templates saved');
as(A, 'api_saveSettings', { ALLOW_SALES_EXPORT: true, CALENDAR_SYNC: false });
ok(as(SA, 'api_bootstrap').cfg.allowExport === true, 'sales export toggled');
const tNoCal = as(SA, 'api_saveTask', { leadId: s1.detail.lead.id, type: 'visit', dueAt: new Date(NOW + 86400e3).toISOString() });
ok(!tNoCal.tasks.find(t => t.leadId === s1.detail.lead.id).onCalendar, 'calendar sync off respected');

// 13. bulk assign, delete lead cleans up
const ids = as(M, 'api_sync').leads.filter(l => l.stage === 'new').map(l => l.id).slice(0, 2);
as(M, 'api_bulkAssign', ids, SB);
ok(ids.every(id => lead(M, id).ownerEmail === SB), 'bulk assign');
throws(() => as(M, 'api_deleteLead', L1.id), /Only the admin/, 'manager cannot delete');
const del = as(A, 'api_deleteLead', L1.id);
ok(!del.leads.some(l => l.id === L1.id) && !ss.sheets.Activities.data.some(r => r[1] === L1.id) && !ss.sheets.Tasks.data.some(r => r[1] === L1.id), 'delete cleans activities and tasks');
ok(del.units.find(u => u.code === 'EW-101').leadId === '', 'sold unit unlinked from deleted lead');

// 14. digest
st.mails = []; ctx.morningDigest();
ok(st.mails.some(m => /Your day/.test(m.subject)) && st.mails.some(m => /Sales summary/.test(m.subject) && /activity/i.test(m.htmlBody)), 'digest emails');
// 15. inactive user locked out
as(A, 'api_saveUsers', as(A, 'api_bootstrap').admin.users.map(u => u.email === SB ? Object.assign(u, { active: false }) : u));
throws(() => as(SB, 'api_sync'), /inactive|has not been added/, 'inactive blocked');
// 16. web router: Google sign-in → session → API; intake
vm.runInContext("var GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';", ctx);
st.activeEmail = '';
const post = (body) => { fresh(); return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text); };
let tokenInfo = { aud: 'cid.apps.googleusercontent.com', email: M, email_verified: 'true', exp: String(Math.floor(NOW / 1000) + 3600), hd: 'edenalkhalij.com' };
st.meta = (url) => /tokeninfo/.test(url) ? { getResponseCode: () => 200, getContentText: () => JSON.stringify(tokenInfo) } : { getResponseCode: () => 200, getContentText: () => '{"data":[]}' };
const login = post({ fn: 'auth', idToken: 'x' });
ok(login.ok && login.result.session && login.result.email === M, 'sign-in issues a session');
const boot = post({ fn: 'api_bootstrap', args: [], session: login.result.session });
ok(boot.ok && boot.result.me.email === M && boot.result.me.role === 'manager', 'session call runs as that user');
ok(post({ fn: 'api_bootstrap', session: login.result.session.replace(/.$/, c => c === 'A' ? 'B' : 'A') }).auth, 'tampered session rejected');
ok(post({ fn: 'api_bootstrap' }).auth, 'missing session rejected');
ok(!post({ fn: 'setup', session: login.result.session }).ok, 'non-API functions not callable');
ok(post({ fn: 'auth', idToken: 'x' }) && (tokenInfo.aud = 'other') && post({ fn: 'auth', idToken: 'x' }).auth, 'wrong client id rejected');
tokenInfo.aud = 'cid.apps.googleusercontent.com'; tokenInfo.email = 'stranger@gmail.com';
const stranger = post({ fn: 'auth', idToken: 'x' });
ok(!stranger.ok && stranger.auth && /has not been added/.test(stranger.error), 'unlisted user cannot sign in');
const later2 = NOW; NOW += 13 * 3600e3;
ok(post({ fn: 'api_sync', session: login.result.session }).auth, 'session expires after 12h');
NOW = later2;
ok(post({ fn: 'api_saveUsers', args: [[]], session: login.result.session }).error.indexOf('Only the admin') === 0, 'permissions still apply through router');
const before = as(M, 'api_sync').leads.length;
ok(!post({ action: 'intake', secret: 'wrong', name: 'X', phone: '01000000999' }).ok, 'intake needs secret');
const intake = post({ action: 'intake', secret: st.props.INTAKE_SECRET, name: 'Form Lead', phone: '01000000999', project: 'Eden Walk', message: 'hi' });
ok(intake.ok && as(M, 'api_sync').leads.length === before + 1, 'website intake creates lead immediately');
ok(JSON.parse(ctx.doGet().text).ok, 'doGet health');
// email code sign-in
st.mails = [];
ok(post({ fn: 'sendCode', email: 'nobody@edenalkhalij.com' }).auth, 'code refused for unlisted email');
const sc = post({ fn: 'sendCode', email: ' Mgr@EdenAlkhalij.com ' });
const codeMail = st.mails.find(m => /sign-in code/.test(m.subject));
ok(sc.ok && codeMail && codeMail.to === M, 'code emailed');
const code = codeMail.subject.match(/(\d{6})/)[1];
ok(/wait a minute/i.test(post({ fn: 'sendCode', email: M }).error), 'resend throttled');
ok(post({ fn: 'verifyCode', email: M, code: '000000' === code ? '111111' : '000000' }).auth, 'wrong code rejected');
const vc = post({ fn: 'verifyCode', email: M, code: code });
ok(vc.ok && vc.result.session && post({ fn: 'api_sync', session: vc.result.session }).ok, 'code sign-in gives working session');
ok(post({ fn: 'verifyCode', email: M, code: code }).auth, 'code works once');
NOW += 61000; post({ fn: 'sendCode', email: M });
const code2 = st.mails.filter(m => /sign-in code/.test(m.subject)).pop().subject.match(/(\d{6})/)[1];
for (let i = 0; i < 5; i++) post({ fn: 'verifyCode', email: M, code: code2 === '999999' ? '999998' : '999999' });
ok(/Too many/.test(post({ fn: 'verifyCode', email: M, code: code2 }).error), 'locked after 5 wrong tries');
NOW += 61000; post({ fn: 'sendCode', email: M });
NOW += 11 * 60000;
const code3 = st.mails.filter(m => /sign-in code/.test(m.subject)).pop().subject.match(/(\d{6})/)[1];
ok(/expired/.test(post({ fn: 'verifyCode', email: M, code: code3 }).error), 'code expires after 10 minutes');
st.activeEmail = '';

// 18. profile fields, notifications, targets, files, feed
st.activeEmail = '';
as(A, 'api_saveUsers', as(A, 'api_bootstrap').admin.users.map(u => Object.assign(u, { active: true })));
const P = as(M, 'api_saveLead', { name: 'Profile Client', phone: '01066600000', ownerEmail: SA, nationality: 'Egyptian', occupation: 'Doctor', payment: 'Installments', purpose: 'Investment', unitType: 'Shop', phone2: '01266600000' }).detail.lead;
ok(P.nationality === 'Egyptian' && P.payment === 'Installments' && P.phone2 === '01266600000', 'profile fields saved');
as(SA, 'api_saveLead', { id: P.id, sizeRange: '40-60 m²' });
ok(lead(M, P.id).sizeRange === '40-60 m²' && lead(M, P.id).occupation === 'Doctor', 'profile field edit keeps others');
const nA = as(SA, 'api_sync').notifications;
ok(nA.unread >= 1 && nA.list[0].type === 'lead' && nA.list[0].leadId === P.id, 'in-app notification for new lead');
const nB = as(SB, 'api_sync').notifications;
ok(!nB.list.some(n => n.leadId === P.id), 'notifications are private');
ok(as(SA, 'api_markRead', 'all').unread === 0, 'mark all read');
// sales can add a new deal for their own client
const dupOwn = as(SA, 'api_saveLead', { name: 'Profile Client', phone: '01066600000', force: true });
ok(dupOwn.detail && dupOwn.detail.lead.id !== P.id, 'sales can open a second deal for own client');
// targets
const month = ymd(new Date(NOW).toISOString()).slice(0, 7);
throws(() => as(SA, 'api_saveTargets', month, []), /Only managers/, 'sales cannot set targets');
const tg = as(M, 'api_saveTargets', month, [{ email: SA, salesTarget: 5000000, dealsTarget: 2, visitsTarget: 10 }, { email: SB, salesTarget: 3000000 }]);
ok(tg.length === 2 && tg.find(t => t.email === SA).dealsTarget === 2, 'targets saved');
as(M, 'api_saveTargets', month, [{ email: SA, salesTarget: 6000000, dealsTarget: 3 }]);
ok(as(SA, 'api_sync').targets.length === 1 && as(SA, 'api_sync').targets[0].salesTarget === 6000000, 'sales sees own target, updated');
// files
const up = as(SA, 'api_uploadFile', P.id, 'ID copy.pdf', 'application/pdf', Buffer.from('hello pdf').toString('base64'));
ok(up.files.length === 1 && up.files[0].name === 'ID copy.pdf' && !up.files[0].driveId, 'file uploaded');
const fid = up.files[0].id;
ok(Buffer.from(as(M, 'api_getFile', fid).base64, 'base64').toString() === 'hello pdf', 'file downloaded');
throws(() => as(SB, 'api_getFile', fid), /not one of yours/, 'other agent cannot download');
throws(() => as(SA, 'api_uploadFile', P.id, 'x', 'text/plain', ''), /empty/, 'empty file rejected');
ok(as(SA, 'api_getLead', P.id).files.length === 1, 'files listed on lead');
const del2 = as(SA, 'api_deleteFile', fid);
ok(del2.files.length === 0 && Object.values(st.drive).every(f => f.trashed), 'file deleted to trash');
// feed
const feed = as(SA, 'api_feed', 10);
ok(feed.length && feed.every(a => as(SA, 'api_sync').leads.some(l => l.id === a.leadId)), 'feed only visible leads');
ok(as(M, 'api_feed', 50).length >= feed.length, 'manager feed');

// 17. no Arabic left in server messages / emails
const ar = st.mails.filter(m => /[؀-ۿ]/.test(m.subject));
ok(!ar.length, 'emails are English');
console.log('passed', pass, process.exitCode ? 'WITH FAILURES' : 'ALL OK');

function ymd(iso) { return new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10); }
