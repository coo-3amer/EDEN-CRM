
/* ================= EDEN CRM — UI ================= */
let ME = null, PEOPLE = [], PROJECTS = [], LEADS = [], TASKS = [], UNITS = [], C = null, ADMIN = null, TEMPLATES = [], CFG = {};
const F = { q: '', owner: 'all', source: '', project: '', rating: '' };
const IF = { q: '', project: '', status: '', type: '' };
let tab = store('tab') || 'pipeline', period = 'all', sortBy = store('sort') || 'newest', actRange = store('actRange') || 'today';
let ACT = null, actLoading = false, TODAY = '', D = null, settingsDirty = false, selected = new Set(), INV = null;
let SL = {}, SRC = {}, RL = {}, USL = {}, TTL = {};
const RW = { hot: 0, warm: 1, cold: 2 };

/* ---------- utils ---------- */
function api(fn) {
  return EdenAuth.call(fn, Array.prototype.slice.call(arguments, 1));
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem('crm.' + k); localStorage.setItem('crm.' + k, v); } catch (e) { return null; } }
function h(t, a) {
  const e = document.createElement(t);
  if (a) for (const x in a) {
    const v = a[x];
    if (v == null || v === false) continue;
    if (x.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(x.slice(2), v);
    else if (x === 'class') e.className = v;
    else if (x === 'style') e.style.cssText = v;
    else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'draggable', 'tabIndex'].indexOf(x) >= 0) e[x] = v;
    else e.setAttribute(x, v === true ? '' : v);
  }
  Array.prototype.slice.call(arguments, 2).flat(9).forEach(function (c) {
    if (c == null || c === false || c === '') return;
    e.append(c.nodeType ? c : String(c));
  });
  return e;
}
function put(el, kids) { el.replaceChildren.apply(el, [].concat(kids).flat(9).filter(function (k) { return k != null && k !== false && k !== ''; })); return el; }
const $ = function (id) { return document.getElementById(id); };
const nf = new Intl.NumberFormat('en-US');
const df = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dtf = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tf = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
function addDays(s, n) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dayDiff(s) { return Math.round((Date.parse(s + 'T12:00:00Z') - Date.parse(TODAY + 'T12:00:00Z')) / 864e5); }
function localYmd(d) { d = d || new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function fmtDay(ymd) { return ymd ? df.format(new Date(ymd + 'T12:00:00')) : ''; }
const digits = function (p) { return String(p || '').replace(/\D/g, ''); };
function waNum(p) { let d = digits(p); if (d.indexOf('00') === 0) d = d.slice(2); else if (/^01\d{9}$/.test(d)) d = '2' + d; else if (/^5\d{8}$/.test(d)) d = '995' + d; return d; }
const isMgr = function () { return ME && (ME.role === 'admin' || ME.role === 'manager'); };
const isAdmin = function () { return ME && ME.role === 'admin'; };
const OPEN = function (s) { return ['won', 'lost'].indexOf(s || 'new') < 0; };
function money(v, c) { return Number(v) ? nf.format(Number(v)) + ' ' + (c || 'EGP') : ''; }
function nm(email) {
  if (!email) return 'Unassigned';
  if (email === 'system') return 'System';
  const p = PEOPLE.find(function (x) { return x.email === email; });
  const n = p ? p.name : email.split('@')[0];
  return email === ME.email ? n + ' (me)' : n;
}
function initials(email) { const n = nm(email).replace(' (me)', '').trim(); return (n[0] || '?').toUpperCase(); }
function av(email, cls) { return h('span', { class: 'av' + (cls ? ' ' + cls : ''), style: 'display:inline-grid;place-items:center;font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-soft)' }, email ? initials(email) : '–'); }
function toast(msg, kind, action) {
  const r = $('toast-root');
  put(r, h('div', { class: 'toast' + (kind ? ' ' + kind : ''), role: 'status', style: 'display:flex;gap:12px;align-items:center' }, msg,
    action ? h('button', { class: 'btn', style: 'padding:4px 10px', onclick: function () { action.fn(); r.replaceChildren(); } }, action.label) : null));
  clearTimeout(toast.t); toast.t = setTimeout(function () { r.replaceChildren(); }, action ? 7000 : 3500);
}
function errText(e) { return (e && e.message) ? e.message.replace(/^(Exception|Error):\s*/, '') : 'Something went wrong. Try again.'; }
function fuInfo(l) {
  if (!OPEN(l.stage)) return null;
  if (!l.nextFollowUp) return { cls: 'none', text: 'No follow-up' };
  const d = dayDiff(l.nextFollowUp);
  if (d < 0) return { cls: 'late', text: (-d) + 'd overdue', d: d };
  if (d === 0) return { cls: 'today', text: 'Today', d: d };
  if (d === 1) return { cls: 'soon', text: 'Tomorrow', d: d };
  return { cls: 'soon', text: fmtDay(l.nextFollowUp), d: d };
}
function srcChip(s) { return s ? h('span', { class: 'chip' }, SRC[s] || s) : null; }
function ownerBadge(e) { return h('span', { class: 'owner' }, av(e, 'sm'), h('span', {}, nm(e))); }
function ratingPill(r) { return r && RL[r] ? h('span', { class: 'rate rate-' + r }, RL[r]) : null; }
function tagList(l) { const t = String(l.tags || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); return t.length ? h('div', { class: 'tags' }, t.map(function (x) { return h('span', { class: 'tag' }, x); })) : null; }
function ustPill(s) { return h('span', { class: 'ust ust-' + s }, USL[s] || s); }
function openExternal(url) { const a = h('a', { href: url, target: '_blank', rel: 'noopener' }); document.body.append(a); a.click(); a.remove(); }
function leadOf(id) { return LEADS.find(function (x) { return x.id === id; }); }
function unitOf(code) { const k = String(code || '').trim().toUpperCase(); return k ? UNITS.find(function (u) { return String(u.code).toUpperCase() === k; }) : null; }
function canExport() { return !!CFG.allowExport; }

/* ---------- export ---------- */
function csvCell(v) { v = v == null ? '' : String(v); if (/^[=+@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function downloadCSV(name, rows) {
  const text = '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast('Downloaded ' + name, null, { label: 'Copy instead', fn: function () { copyTable(rows); } });
  } catch (e) { copyTable(rows); }
}
function copyTable(rows) {
  const text = rows.map(function (r) { return r.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied ' + (rows.length - 1) + ' rows — paste into Excel'); }, function () { toast('Copy was blocked by the browser', 'err'); });
}
function exportButtons(name, rowsFn) {
  return [h('button', { class: 'btn', onclick: function () { downloadCSV(name + '-' + TODAY + '.csv', rowsFn()); } }, 'Export Excel'),
    h('button', { class: 'btn ghost', onclick: function () { copyTable(rowsFn()); } }, 'Copy')];
}
function leadRows(list) {
  const head = ['Name', 'Phone', 'Email', 'Rating', 'Tags', 'Stage', 'Source', 'Campaign', 'Project', 'Unit', 'Budget', 'Owner', 'Next follow-up', 'Created', 'First contact', 'Last contact', 'Deal value', 'Currency', 'Lost reason'];
  return [head].concat(list.map(function (l) {
    return [l.name, l.phone, l.email, RL[l.rating] || '', l.tags, SL[l.stage || 'new'], SRC[l.source] || l.source, l.campaign, l.project, l.unit, l.budget,
      l.ownerName || nm(l.ownerEmail), l.nextFollowUp, (l.createdAt || '').slice(0, 10), (l.firstContactAt || '').slice(0, 10), (l.lastContactAt || '').slice(0, 10), l.dealValue, l.currency, l.lostReason];
  }));
}

/* ---------- filter ---------- */
function visible() {
  const q = F.q.trim().toLowerCase(), qd = digits(q);
  return LEADS.filter(function (l) {
    if (F.owner === 'me' && l.ownerEmail !== ME.email) return false;
    if (F.owner === 'none' && l.ownerEmail) return false;
    if (['all', 'me', 'none'].indexOf(F.owner) < 0 && l.ownerEmail !== F.owner) return false;
    if (F.source && l.source !== F.source) return false;
    if (F.project && l.project !== F.project) return false;
    if (F.rating && (l.rating || 'none') !== F.rating) return false;
    if (q) {
      const hit = (l.name || '').toLowerCase().indexOf(q) >= 0 || (qd.length >= 3 && digits(l.phone).indexOf(qd) >= 0) ||
        (l.unit || '').toLowerCase().indexOf(q) >= 0 || (l.email || '').toLowerCase().indexOf(q) >= 0 ||
        (l.tags || '').toLowerCase().indexOf(q) >= 0 || (l.campaign || '').toLowerCase().indexOf(q) >= 0;
      if (!hit) return false;
    }
    return true;
  });
}
function ownerScope(email) {
  if (F.owner === 'all') return true;
  if (F.owner === 'me') return email === ME.email;
  if (F.owner === 'none') return !email;
  return email === F.owner;
}
function lateTask(t) { return t.status === 'open' && Date.parse(t.dueAt) < Date.now(); }

/* ---------- render ---------- */
let rq = 0;
function render() { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; doRender(); }); }
function tabsList() {
  const t = [['pipeline', 'Pipeline'], ['list', 'Leads'], ['today', 'Today'], ['inventory', 'Inventory'], ['reports', 'Reports']];
  if (isMgr()) t.push(['settings', 'Settings']);
  return t;
}
function doRender() {
  if (!ME) return;
  if (!tabsList().some(function (t) { return t[0] === tab; })) tab = 'pipeline';
  const mine = function (e) { return isMgr() ? ownerScope(e) : e === ME.email; };
  const late = TASKS.filter(function (t) { return lateTask(t) && mine(t.ownerEmail); }).length +
    LEADS.filter(function (l) { const f = fuInfo(l); return f && f.cls === 'late' && mine(l.ownerEmail); }).length;
  put($('tabs'), tabsList().map(function (t) {
    return h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === t[0]), onclick: function () { tab = t[0]; store('tab', tab); settingsDirty = false; selected.clear(); render(); } },
      t[1], t[0] === 'today' && late ? h('span', { class: 'tab-n' }, late) : null);
  }));
  put($('me'), [av(ME.email), h('span', { title: ME.email }, (ME.name || ME.email) + ' · ' + { admin: 'Admin', manager: 'Manager', sales: 'Sales' }[ME.role]),
    h('button', { class: 'btn ghost', onclick: function () { EdenAuth.signOut(); } }, 'Sign out')]);
  $('bar').hidden = ['pipeline', 'list', 'today'].indexOf(tab) < 0;
  $('f-owner').hidden = !isMgr();
  renderFilters();
  const v = $('view');
  if (tab === 'settings') { if (!settingsDirty) put(v, viewSettings()); return; }
  if (tab === 'inventory') { const root = viewInventory(); if (v.firstChild !== root) put(v, root); return; }
  if (tab === 'reports') { put(v, viewReports(visible())); return; }
  if (!LEADS.length) { put(v, welcome()); return; }
  const list = visible();
  put(v, tab === 'pipeline' ? viewPipeline(list) : tab === 'list' ? viewList(list) : viewToday(list));
}
function fillSelect(sel, opts, val) {
  put(sel, opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
  sel.value = opts.some(function (o) { return o[0] === val; }) ? val : opts[0][0];
  return sel.value;
}
function projectNames() {
  const p = PROJECTS.map(function (x) { return x.name; });
  LEADS.forEach(function (l) { if (l.project && p.indexOf(l.project) < 0) p.push(l.project); });
  UNITS.forEach(function (u) { if (u.project && p.indexOf(u.project) < 0) p.push(u.project); });
  return p;
}
function renderFilters() {
  if (isMgr()) {
    const owners = [['all', 'Whole team'], ['me', 'My leads'], ['none', 'Unassigned']];
    PEOPLE.filter(function (p) { return p.email !== ME.email; }).forEach(function (p) { owners.push([p.email, p.name]); });
    F.owner = fillSelect($('f-owner'), owners, F.owner);
  } else F.owner = 'all';
  F.source = fillSelect($('f-source'), [['', 'All sources']].concat(C.sources), F.source);
  F.project = fillSelect($('f-project'), [['', 'All projects']].concat(projectNames().map(function (p) { return [p, p]; })), F.project);
  F.rating = fillSelect($('f-rating'), [['', 'Any rating']].concat(C.ratings, [['none', 'Not rated']]), F.rating);
}
function welcome() {
  return h('div', { class: 'welcome' },
    h('h2', {}, 'No leads yet'),
    h('p', {}, isMgr()
      ? 'Leads appear here as soon as you add them or they arrive from Meta and the website. First add your projects, units and sales team in Settings and Inventory.'
      : 'No leads are assigned to you yet. When one is, you will get an email and it will show up here.'),
    h('div', { class: 'acts', style: 'justify-content:flex-start' },
      h('button', { class: 'btn primary', onclick: function () { openLead('new'); } }, 'New lead'),
      isMgr() ? h('button', { class: 'btn', onclick: function () { tab = 'settings'; store('tab', tab); render(); } }, 'Settings') : null));
}

/* ---------- pipeline ---------- */
function byPriority(a, b) {
  const ra = RW[a.rating] == null ? 3 : RW[a.rating], rb = RW[b.rating] == null ? 3 : RW[b.rating];
  if (ra !== rb) return ra - rb;
  return (a.nextFollowUp || '9') < (b.nextFollowUp || '9') ? -1 : 1;
}
function viewPipeline(list) {
  return h('div', { class: 'board' }, C.stages.map(function (s) {
    const k = s[0];
    const items = list.filter(function (l) { return (l.stage || 'new') === k; }).sort(byPriority);
    const col = h('section', {
      class: 'col', 'aria-label': s[1],
      ondragover: function (e) { e.preventDefault(); col.classList.add('over'); },
      ondragleave: function () { col.classList.remove('over'); },
      ondrop: function (e) {
        e.preventDefault(); col.classList.remove('over');
        const l = leadOf(e.dataTransfer.getData('text/plain'));
        if (!l || (l.stage || 'new') === k) return;
        if (k === 'won' || k === 'lost') openLead(l.id, k); else changeStage(l.id, k);
      }
    },
      h('header', { class: 'col-h' }, h('span', { class: 'dot st-' + k }), h('span', {}, s[1]), h('span', { class: 'count' }, items.length)),
      items.length ? items.slice(0, 200).map(card) : h('p', { class: 'col-empty' }, 'Empty'));
    return col;
  }));
}
function card(l) {
  const fu = fuInfo(l);
  const nextTask = TASKS.filter(function (t) { return t.leadId === l.id && t.status === 'open'; }).sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : 1; })[0];
  return h('div', {
    class: 'card', role: 'button', tabIndex: 0, draggable: true,
    ondragstart: function (e) { e.dataTransfer.setData('text/plain', l.id); },
    onclick: function () { openLead(l.id); }, onkeydown: function (e) { if (e.key === 'Enter') openLead(l.id); }
  },
    h('div', { class: 'card-top' }, h('strong', {}, l.name || l.phone || 'No name'), ratingPill(l.rating) || srcChip(l.source)),
    (l.project || l.unit) ? h('div', { class: 'meta' }, [l.project, l.unit].filter(Boolean).join(' · ')) : null,
    l.stage === 'won' && l.dealValue ? h('div', { class: 'meta num' }, money(l.dealValue, l.currency)) : null,
    l.stage === 'lost' && l.lostReason ? h('div', { class: 'meta' }, 'Reason: ' + l.lostReason) : null,
    nextTask ? h('div', { class: 'meta' }, h('span', { class: 'ttype ' + nextTask.type }, TTL[nextTask.type]), ' ', dtf.format(new Date(nextTask.dueAt))) : null,
    tagList(l),
    h('div', { class: 'card-bot' }, isMgr() ? ownerBadge(l.ownerEmail) : h('span', { class: 'meta' }, SRC[l.source] || ''), fu ? h('span', { class: 'fu ' + fu.cls }, fu.text) : null));
}

/* ---------- list ---------- */
const SORTS = [['newest', 'Newest first'], ['followup', 'Follow-up date'], ['rating', 'Rating'], ['name', 'Name'], ['stage', 'Stage']];
function sortLeads(list) {
  const st = C.stages.map(function (s) { return s[0]; });
  const f = {
    newest: function (a, b) { return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1; },
    followup: function (a, b) { return (a.nextFollowUp || '9') < (b.nextFollowUp || '9') ? -1 : 1; },
    rating: byPriority,
    name: function (a, b) { return (a.name || '').localeCompare(b.name || ''); },
    stage: function (a, b) { return st.indexOf(a.stage || 'new') - st.indexOf(b.stage || 'new'); },
  }[sortBy] || function () { return 0; };
  return list.slice().sort(f);
}
function viewList(list) {
  if (!list.length) return h('div', { class: 'empty' }, 'No leads match these filters.');
  const mgr = isMgr();
  list = sortLeads(list);
  const sortSel = h('select', { id: 'sort', 'aria-label': 'Sort', onchange: function (e) { sortBy = e.target.value; store('sort', sortBy); render(); } },
    SORTS.map(function (s) { return h('option', { value: s[0], selected: sortBy === s[0] }, s[1]); }));
  const bulk = mgr && selected.size ? (function () {
    const sel = h('select', { id: 'bulk-owner' }, h('option', { value: 'auto' }, 'Auto-assign'),
      PEOPLE.map(function (p) { return h('option', { value: p.email }, p.name); }), h('option', { value: '' }, 'Unassigned'));
    const btn = h('button', { class: 'btn primary' }, 'Assign');
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try { applySync(await api('api_bulkAssign', Array.from(selected), sel.value)); selected.clear(); toast('Assigned'); render(); }
      catch (e) { toast(errText(e), 'err'); btn.disabled = false; }
    });
    return h('div', { class: 'bulk' }, h('span', {}, selected.size + ' selected'), sel, btn, h('button', { class: 'btn ghost', onclick: function () { selected.clear(); render(); } }, 'Clear'));
  })() : null;
  const allChk = mgr ? h('input', { type: 'checkbox', class: 'check', 'aria-label': 'Select all', checked: list.every(function (l) { return selected.has(l.id); }),
    onchange: function (e) { list.forEach(function (l) { if (e.target.checked) selected.add(l.id); else selected.delete(l.id); }); render(); } }) : null;
  return h('div', {},
    h('div', { class: 'toolrow' }, h('span', { class: 'meta' }, nf.format(list.length) + ' leads'), h('span', { class: 'grow' }), sortSel,
      canExport() ? exportButtons('eden-leads', function () { return leadRows(list); }) : null),
    bulk,
    h('div', { class: 'tbl-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, mgr ? h('th', {}, allChk) : null,
        ['Name', 'Phone', 'Rating', 'Source', 'Project / unit', 'Stage', mgr ? 'Owner' : null, 'Follow-up', 'Created'].filter(Boolean).map(function (t) { return h('th', {}, t); }))),
      h('tbody', {}, list.slice(0, 1000).map(function (l) {
        const fu = fuInfo(l);
        return h('tr', { onclick: function (e) { if (e.target.type !== 'checkbox') openLead(l.id); } },
          mgr ? h('td', {}, h('input', { type: 'checkbox', class: 'check', checked: selected.has(l.id), 'aria-label': 'Select', onchange: function (e) { if (e.target.checked) selected.add(l.id); else selected.delete(l.id); render(); } })) : null,
          h('td', {}, h('strong', { style: 'font-weight:600' }, l.name || '—'), tagList(l)),
          h('td', {}, h('span', { class: 'ltr num' }, l.phone || '—')),
          h('td', {}, ratingPill(l.rating) || '—'),
          h('td', {}, srcChip(l.source)),
          h('td', {}, [l.project, l.unit].filter(Boolean).join(' · ') || '—'),
          h('td', {}, h('span', { class: 'stage-pill' }, h('span', { class: 'dot st-' + (l.stage || 'new') }), SL[l.stage || 'new'])),
          mgr ? h('td', {}, ownerBadge(l.ownerEmail)) : null,
          h('td', {}, fu ? h('span', { class: 'fu ' + fu.cls }, fu.text) : '—'),
          h('td', { class: 'meta' }, l.createdAt ? df.format(new Date(l.createdAt)) : '—'));
      })))),
    list.length > 1000 ? h('p', { class: 'meta' }, 'Showing the first 1,000. Narrow the filters to see the rest.') : null);
}

/* ---------- tasks ---------- */
function taskRow(t, opts) {
  opts = opts || {};
  const done = t.status === 'done';
  const late = lateTask(t);
  const row = h('div', { class: 'task' + (late ? ' late' : '') + (done ? ' done' : '') });
  const chk = h('button', { class: 'chk', 'aria-label': 'Mark done', title: 'Mark done', disabled: done }, h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'));
  const l = leadOf(t.leadId);
  const body = h('div', { style: 'min-width:0' },
    h('div', { class: 'task-title' }, t.title),
    h('div', { class: 'task-meta' },
      h('span', { class: 'ttype ' + t.type }, TTL[t.type] || t.type),
      h('span', { class: 'task-when' }, done ? 'Done ' + df.format(new Date(t.doneAt)) : dtf.format(new Date(t.dueAt))),
      !opts.inLead && (l || t.leadName) ? h('button', { class: 'lead-link', onclick: function () { openLead(t.leadId); } }, (l && (l.name || l.phone)) || t.leadName) : null,
      isMgr() && t.ownerEmail !== ME.email ? h('span', {}, nm(t.ownerEmail)) : null,
      t.onCalendar ? h('span', {}, 'On calendar') : null,
      t.notes ? h('span', {}, t.notes) : null));
  const cancel = h('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end' });
  const drawCancel = function () {
    if (done) return put(cancel, []);
    put(cancel, h('button', { class: 'x', title: 'Cancel task', 'aria-label': 'Cancel task', onclick: function () {
      put(cancel, [h('button', { class: 'btn danger', style: 'padding:4px 10px', onclick: async function () {
        try { applySync(await api('api_cancelTask', t.id)); toast('Task cancelled'); } catch (e) { toast(errText(e), 'err'); }
      } }, 'Cancel task'), h('button', { class: 'btn ghost', style: 'padding:4px 8px', onclick: drawCancel }, 'Keep')]);
    } }, '✕'));
  };
  drawCancel();
  chk.addEventListener('click', function () {
    if (row.querySelector('.task-done-form')) return;
    const out = h('input', { type: 'text', id: 'outcome-' + t.id, placeholder: ['call', 'whatsapp', 'visit', 'meeting'].indexOf(t.type) >= 0 ? 'What happened? (optional)' : 'Note (optional)', dir: 'auto' });
    const ok = h('button', { class: 'btn primary' }, 'Done');
    const submit = async function () {
      ok.disabled = true;
      try { applySync(await api('api_completeTask', t.id, out.value.trim())); toast('Task done'); }
      catch (e) { toast(errText(e), 'err'); ok.disabled = false; }
    };
    ok.addEventListener('click', submit);
    out.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    row.append(h('div', { class: 'task-done-form' }, out, ok, h('button', { class: 'btn ghost', onclick: function (e) { e.target.closest('.task-done-form').remove(); } }, 'Back')));
    out.focus();
  });
  put(row, [chk, body, cancel]);
  return row;
}
function viewToday(list) {
  const ids = {}; list.forEach(function (l) { ids[l.id] = 1; });
  const q = F.q.trim();
  const tasks = TASKS.filter(function (t) { return t.status === 'open' && ownerScope(t.ownerEmail) && (ids[t.leadId] || (!leadOf(t.leadId) && !q)); })
    .sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : 1; });
  const now = Date.now(), wk = addDays(TODAY, 7);
  const tLate = tasks.filter(function (t) { return Date.parse(t.dueAt) < now; });
  const tToday = tasks.filter(function (t) { return Date.parse(t.dueAt) >= now && localYmd(new Date(t.dueAt)) === TODAY; });
  const tNext = tasks.filter(function (t) { const d = localYmd(new Date(t.dueAt)); return Date.parse(t.dueAt) >= now && d > TODAY && d <= wk; });
  const open = list.filter(function (l) { return OPEN(l.stage); });
  const fresh = open.filter(function (l) { return (l.stage || 'new') === 'new' && !l.firstContactAt; }).sort(byPriority);
  const notFresh = function (l) { return fresh.indexOf(l) < 0; };
  const late = open.filter(function (l) { return notFresh(l) && l.nextFollowUp && dayDiff(l.nextFollowUp) < 0; }).sort(byPriority);
  const tod = open.filter(function (l) { return notFresh(l) && l.nextFollowUp && dayDiff(l.nextFollowUp) === 0; }).sort(byPriority);
  const none = open.filter(function (l) { return !l.nextFollowUp; });
  const tg = function (title, arr, empty) {
    return h('section', { class: 'group' }, h('h2', {}, title, h('span', { class: 'count' }, arr.length)),
      arr.length ? h('div', { class: 'task-list' }, arr.map(function (t) { return taskRow(t); })) : h('div', { class: 'empty' }, empty));
  };
  const lg = function (title, arr, empty) {
    return h('section', { class: 'group' }, h('h2', {}, title, h('span', { class: 'count' }, arr.length)),
      arr.length ? h('div', { class: 'rows' }, arr.slice(0, 120).map(card)) : h('div', { class: 'empty' }, empty));
  };
  return h('div', { class: 'groups' },
    tLate.length ? tg('Overdue tasks', tLate, '') : null,
    tg('Tasks today', tToday, 'No more tasks today.'),
    lg('New leads not contacted yet', fresh, 'Every new lead has been contacted.'),
    lg('Overdue follow-ups', late, 'No overdue follow-ups.'),
    lg('Follow-ups today', tod, 'No follow-ups due today.'),
    tg('Next 7 days', tNext, 'Nothing scheduled for the next 7 days.'),
    none.length ? lg('Open leads with no follow-up date', none, '') : null);
}

/* ---------- inventory ---------- */
function unitRows(list) {
  return [['Code', 'Project', 'Type', 'Floor', 'Area (m²)', 'Price', 'Currency', 'Status', 'Client', 'Reserved until', 'Notes']].concat(list.map(function (u) {
    return [u.code, u.project, u.type, u.floor, u.area, u.price, u.currency, USL[u.status] || u.status, u.leadName, u.reservedUntil, u.notes];
  }));
}
function viewInventory() {
  if (INV) { INV.update(); return INV.root; }
  const q = h('input', { type: 'search', id: 'inv-q', placeholder: 'Search unit code, type or client', dir: 'auto', style: 'flex:1 1 220px', oninput: function (e) { IF.q = e.target.value; INV.update(); } });
  const proj = h('select', { id: 'inv-proj', 'aria-label': 'Project', onchange: function (e) { IF.project = e.target.value; INV.update(); } });
  const st = h('select', { id: 'inv-status', 'aria-label': 'Status', onchange: function (e) { IF.status = e.target.value; INV.update(); } });
  const typ = h('select', { id: 'inv-type', 'aria-label': 'Type', onchange: function (e) { IF.type = e.target.value; INV.update(); } });
  const actions = h('div', { class: 'toolrow', style: 'margin:0' });
  const summary = h('div', { class: 'inv-sum' });
  const count = h('p', { class: 'meta', style: 'margin:0 0 8px' });
  const table = h('div', {});
  const root = h('div', {}, summary, h('div', { class: 'toolrow' }, q, proj, st, typ, actions), count, table);
  INV = { root: root };
  INV.filtered = function () {
    const s = IF.q.trim().toLowerCase();
    return UNITS.filter(function (u) {
      if (IF.project && u.project !== IF.project) return false;
      if (IF.status && u.status !== IF.status) return false;
      if (IF.type && u.type !== IF.type) return false;
      if (s && [u.code, u.type, u.leadName, u.notes].join(' ').toLowerCase().indexOf(s) < 0) return false;
      return true;
    }).sort(function (a, b) { return (a.project || '').localeCompare(b.project || '') || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }); });
  };
  INV.update = function () {
    IF.project = fillSelect(proj, [['', 'All projects']].concat(projectNames().filter(function (p) { return UNITS.some(function (u) { return u.project === p; }); }).map(function (p) { return [p, p]; })), IF.project);
    IF.status = fillSelect(st, [['', 'Any status']].concat(C.unitStatuses), IF.status);
    const types = []; UNITS.forEach(function (u) { if (u.type && types.indexOf(u.type) < 0) types.push(u.type); });
    IF.type = fillSelect(typ, [['', 'Any type']].concat(types.sort().map(function (t) { return [t, t]; })), IF.type);
    put(actions, [isMgr() ? h('button', { class: 'btn primary', onclick: function () { openUnit(null); } }, '+ Unit') : null,
      isMgr() ? h('button', { class: 'btn', onclick: openUnitImport }, 'Import units') : null,
      canExport() ? exportButtons('eden-inventory', function () { return unitRows(INV.filtered()); }) : null]);
    // summary per project
    const byP = {};
    UNITS.forEach(function (u) {
      const p = u.project || 'No project';
      const r = byP[p] = byP[p] || { available: 0, reserved: 0, sold: 0, blocked: 0, soldValue: {}, availValue: {} };
      r[u.status] = (r[u.status] || 0) + 1;
      const c = u.currency || 'EGP';
      if (u.status === 'sold' && Number(u.price)) r.soldValue[c] = (r.soldValue[c] || 0) + Number(u.price);
      if (u.status === 'available' && Number(u.price)) r.availValue[c] = (r.availValue[c] || 0) + Number(u.price);
    });
    put(summary, Object.keys(byP).sort().map(function (p) {
      const r = byP[p], total = r.available + r.reserved + r.sold + r.blocked;
      const seg = function (k, color) { return r[k] ? h('i', { style: 'width:' + (r[k] / total * 100) + '%;background:' + color, title: USL[k] + ': ' + r[k] }) : null; };
      const vals = function (o) { return Object.keys(o).map(function (c) { return money(o[c], c); }).join(' · '); };
      return h('div', { class: 'proj-card', role: 'button', tabIndex: 0, style: 'cursor:pointer', onclick: function () { IF.project = IF.project === p ? '' : p; INV.update(); } },
        h('h3', {}, p),
        h('div', { class: 'stack' }, seg('sold', 'var(--accent)'), seg('reserved', 'var(--warn)'), seg('available', 'var(--ok)'), seg('blocked', 'var(--line)')),
        h('div', { class: 'counts' }, h('span', {}, h('b', {}, r.available), ' available'), h('span', {}, h('b', {}, r.reserved), ' reserved'), h('span', {}, h('b', {}, r.sold), ' sold'), r.blocked ? h('span', {}, h('b', {}, r.blocked), ' blocked') : null),
        vals(r.soldValue) ? h('div', { class: 'counts' }, 'Sold: ', h('b', {}, vals(r.soldValue))) : null,
        vals(r.availValue) ? h('div', { class: 'counts' }, 'Available stock: ', h('b', {}, vals(r.availValue))) : null);
    }));
    const list = INV.filtered();
    count.textContent = UNITS.length ? list.length + ' of ' + UNITS.length + ' units' : '';
    if (!UNITS.length) {
      put(table, h('div', { class: 'welcome' }, h('h2', {}, 'No units yet'),
        h('p', {}, isMgr() ? 'Add units one by one, or paste your whole price list with Import units (code, project, type, floor, area, price).' : 'Your manager has not added the unit inventory yet.')));
      return;
    }
    put(table, h('div', { class: 'tbl-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Code', 'Project', 'Type', 'Floor', 'Area m²', 'Price', 'Status', 'Client', 'Until'].map(function (t) { return h('th', {}, t); }))),
      h('tbody', {}, list.slice(0, 1500).map(function (u) {
        return h('tr', { onclick: function () { openUnit(u.code); } },
          h('td', {}, h('strong', { style: 'font-weight:600' }, u.code)), h('td', {}, u.project || '—'), h('td', {}, u.type || '—'),
          h('td', { class: 'n' }, u.floor || '—'), h('td', { class: 'n' }, u.area ? nf.format(u.area) : '—'), h('td', { class: 'n' }, money(u.price, u.currency) || '—'),
          h('td', {}, ustPill(u.status)),
          h('td', {}, u.leadName || (u.status === 'reserved' || u.status === 'sold' ? h('span', { class: 'meta' }, isMgr() ? '—' : 'Another agent\'s client') : '—')),
          h('td', { class: 'meta' }, u.status === 'reserved' ? fmtDay(u.reservedUntil) : ''));
      })))));
  };
  INV.update();
  return root;
}

/* ---------- reports ---------- */
function actDates(r) {
  const T = TODAY;
  return { today: [T, T], yesterday: [addDays(T, -1), addDays(T, -1)], '7d': [addDays(T, -6), T], '30d': [addDays(T, -29), T], month: [T.slice(0, 8) + '01', T] }[r] || [T, T];
}
function loadActivity() {
  const d = actDates(actRange), r = actRange;
  actLoading = true;
  api('api_activityReport', d[0], d[1]).then(function (res) { ACT = Object.assign({ range: r }, res); actLoading = false; if (tab === 'reports') render(); })
    .catch(function (e) { actLoading = false; ACT = { range: r, error: errText(e), rows: [], days: [] }; render(); });
}
function fmtHours(x) { return x < 1 ? Math.round(x * 60) + ' min' : x < 48 ? (Math.round(x * 10) / 10) + ' h' : Math.round(x / 24) + ' days'; }
function activitySection() {
  if ((!ACT || ACT.range !== actRange) && !actLoading) loadActivity();
  const sel = h('select', { id: 'act-range', 'aria-label': 'Activity period', onchange: function (e) { actRange = e.target.value; store('actRange', actRange); ACT = null; render(); } },
    [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']].map(function (o) { return h('option', { value: o[0], selected: actRange === o[0] }, o[1]); }));
  const head = h('div', { class: 'rep-head' }, h('h2', {}, 'Activity'), sel);
  if (!ACT || ACT.range !== actRange) return h('div', { class: 'panel', style: 'grid-column:1/-1' }, head, h('p', { class: 'meta' }, 'Loading…'));
  if (ACT.error) return h('div', { class: 'panel', style: 'grid-column:1/-1' }, head, h('p', { class: 'status err' }, ACT.error));
  const rows = ACT.rows;
  const cols = [['newLeads', 'New leads'], ['call', 'Calls'], ['whatsapp', 'WhatsApp'], ['visit', 'Visits'], ['meeting', 'Meetings'], ['note', 'Notes'], ['stage', 'Stage moves'], ['tasksDone', 'Tasks done'], ['won', 'Won']];
  const exportRows = function () {
    return [['Agent'].concat(cols.map(function (c) { return c[1]; }), ['Won value', 'Avg first response (h)'])].concat(rows.map(function (r) {
      return [r.name].concat(cols.map(function (c) { return r[c[0]]; }), [Object.keys(r.wonValue).map(function (c) { return money(r.wonValue[c], c); }).join(' + '), r.avgFirstResponseHrs == null ? '' : Math.round(r.avgFirstResponseHrs * 10) / 10]);
    }));
  };
  const max = Math.max.apply(null, [1].concat(ACT.days.map(function (d) { return d.call + d.whatsapp + d.visit + d.meeting; })));
  return h('div', { class: 'panel', style: 'grid-column:1/-1' },
    h('div', { class: 'rep-head' }, h('h2', {}, 'Activity'), h('span', { class: 'meta' }, ACT.from === ACT.to ? fmtDay(ACT.from) : fmtDay(ACT.from) + ' – ' + fmtDay(ACT.to)), sel,
      canExport() && rows.length ? exportButtons('eden-activity-' + ACT.from + '_' + ACT.to, exportRows) : null),
    rows.length ? h('div', { style: 'overflow-x:auto' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Agent'), cols.map(function (c) { return h('th', {}, c[1]); }), h('th', {}, 'Avg first response'))),
      h('tbody', {}, rows.map(function (r) {
        return h('tr', {}, h('td', {}, ownerBadge(r.email)), cols.map(function (c) { return h('td', { class: 'n', style: c[0] === 'won' && r.won ? 'color:var(--ok);font-weight:600' : '' }, r[c[0]]); }),
          h('td', { class: 'n' }, r.avgFirstResponseHrs == null ? '—' : fmtHours(r.avgFirstResponseHrs)));
      })))) : h('p', { class: 'meta' }, 'No activity logged in this period.'),
    ACT.days.length > 1 ? h('div', { style: 'margin-top:14px' }, h('h3', {}, 'Contacts per day'),
      h('div', { class: 'days' }, ACT.days.map(function (d) {
        const tot = d.call + d.whatsapp + d.visit + d.meeting;
        return h('div', { class: 'day' }, h('span', {}, fmtDay(d.date)),
          h('div', { class: 'bar', style: 'width:' + Math.max(4, tot / max * 100) + '%' }, ['call', 'whatsapp', 'visit', 'meeting'].map(function (k) { return d[k] ? h('i', { class: 'c-' + k, style: 'width:' + (d[k] / tot * 100) + '%', title: TTL[k] + ': ' + d[k] }) : null; })),
          h('span', { class: 'n' }, tot));
      })),
      h('div', { class: 'legend' }, ['call', 'whatsapp', 'visit', 'meeting'].map(function (k) { return h('span', {}, h('i', { class: 'c-' + k }), TTL[k]); }))) : null);
}
function viewReports(all) {
  let list = all;
  if (period === '30') list = all.filter(function (l) { return l.createdAt && l.createdAt.slice(0, 10) >= addDays(TODAY, -30); });
  if (period === 'month') list = all.filter(function (l) { return l.createdAt && l.createdAt.slice(0, 7) === TODAY.slice(0, 7); });
  const won = list.filter(function (l) { return l.stage === 'won'; }), open = list.filter(function (l) { return OPEN(l.stage); });
  const late = open.filter(function (l) { const f = fuInfo(l); return f && f.cls === 'late'; }).length;
  const conv = list.length ? Math.round(won.length / list.length * 1000) / 10 : 0;
  const sums = {};
  won.forEach(function (l) { if (Number(l.dealValue)) { const c = l.currency || 'EGP'; sums[c] = (sums[c] || 0) + Number(l.dealValue); } });
  const resp = list.filter(function (l) { return l.firstContactAt && l.assignedAt; })
    .map(function (l) { return (Date.parse(l.firstContactAt) - Date.parse(l.assignedAt)) / 36e5; }).filter(function (x) { return x >= 0; });
  const avgResp = resp.length ? resp.reduce(function (a, b) { return a + b; }, 0) / resp.length : null;
  const sel = h('select', { id: 'r-period', 'aria-label': 'Period', onchange: function (e) { period = e.target.value; render(); } },
    [['all', 'All time'], ['month', 'This month'], ['30', 'Last 30 days']].map(function (o) { return h('option', { value: o[0], selected: period === o[0] }, o[1]); }));
  const kpi = function (l, v, s, cls) { return h('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, h('span', {}, l), h('b', {}, v), s ? h('small', {}, s) : null); };
  const count = function (k) { return list.filter(function (l) { return (l.stage || 'new') === k; }).length; };
  const max = Math.max.apply(null, [1].concat(C.stages.map(function (s) { return count(s[0]); })));
  const funnel = h('div', { class: 'panel' }, h('h3', {}, 'Leads by stage'), C.stages.map(function (s) {
    const n = count(s[0]);
    return h('div', { class: 'hb' }, h('span', {}, s[1]), h('div', { class: 'track' }, h('div', { class: 'fill', style: 'width:' + (n / max * 100) + '%;background:var(--st-' + s[0] + ')' })), h('span', { class: 'n' }, n));
  }));
  const bySrc = C.sources.map(function (s) {
    return { l: s[1], n: list.filter(function (x) { return x.source === s[0]; }).length, w: list.filter(function (x) { return x.source === s[0] && x.stage === 'won'; }).length };
  }).filter(function (x) { return x.n; }).sort(function (a, b) { return b.n - a.n; });
  const smax = Math.max.apply(null, [1].concat(bySrc.map(function (x) { return x.n; })));
  const src = h('div', { class: 'panel' }, h('h3', {}, 'Sources'),
    bySrc.length ? bySrc.map(function (x) {
      return h('div', { class: 'hb' }, h('span', {}, x.l), h('div', { class: 'track' }, h('div', { class: 'fill', style: 'width:' + (x.n / smax * 100) + '%;opacity:.35' }), h('div', { class: 'fill won', style: 'width:' + (x.w / smax * 100) + '%' })), h('span', { class: 'n' }, x.w + '/' + x.n));
    }) : h('p', { class: 'meta' }, 'No data.'),
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--accent);opacity:.35' }), 'All leads'), h('span', {}, h('i', { style: 'background:var(--ok)' }), 'Won')));
  const byRating = C.ratings.concat([['', 'Not rated']]).map(function (r) {
    const m = list.filter(function (l) { return (l.rating || '') === r[0]; });
    return { l: r[1], k: r[0], n: m.length, o: m.filter(function (l) { return OPEN(l.stage); }).length, w: m.filter(function (l) { return l.stage === 'won'; }).length };
  });
  const rating = h('div', { class: 'panel' }, h('h3', {}, 'Rating'), h('table', {},
    h('thead', {}, h('tr', {}, ['Rating', 'Leads', 'Open', 'Won', 'Conversion'].map(function (t) { return h('th', {}, t); }))),
    h('tbody', {}, byRating.map(function (r) {
      return h('tr', {}, h('td', {}, r.k ? ratingPill(r.k) : r.l), h('td', { class: 'n' }, r.n), h('td', { class: 'n' }, r.o), h('td', { class: 'n' }, r.w), h('td', { class: 'n' }, r.n ? Math.round(r.w / r.n * 100) + '%' : '—'));
    }))));
  const byProj = {};
  list.forEach(function (l) { const p = l.project || 'No project'; byProj[p] = byProj[p] || { n: 0, w: 0 }; byProj[p].n++; if (l.stage === 'won') byProj[p].w++; });
  const proj = h('div', { class: 'panel' }, h('h3', {}, 'Projects'), h('table', {},
    h('thead', {}, h('tr', {}, ['Project', 'Leads', 'Won', 'Conversion'].map(function (t) { return h('th', {}, t); }))),
    h('tbody', {}, Object.keys(byProj).sort(function (a, b) { return byProj[b].n - byProj[a].n; }).map(function (p) {
      const x = byProj[p];
      return h('tr', {}, h('td', {}, p), h('td', { class: 'n' }, x.n), h('td', { class: 'n' }, x.w), h('td', { class: 'n' }, Math.round(x.w / x.n * 100) + '%'));
    }))));
  const lostR = {};
  list.filter(function (l) { return l.stage === 'lost'; }).forEach(function (l) { const r = l.lostReason || 'No reason'; lostR[r] = (lostR[r] || 0) + 1; });
  const lmax = Math.max.apply(null, [1].concat(Object.keys(lostR).map(function (k) { return lostR[k]; })));
  const lost = h('div', { class: 'panel' }, h('h3', {}, 'Why leads were lost'),
    Object.keys(lostR).length ? Object.keys(lostR).sort(function (a, b) { return lostR[b] - lostR[a]; }).map(function (r) {
      return h('div', { class: 'hb' }, h('span', {}, r), h('div', { class: 'track' }, h('div', { class: 'fill', style: 'width:' + (lostR[r] / lmax * 100) + '%;background:var(--danger)' })), h('span', { class: 'n' }, lostR[r]));
    }) : h('p', { class: 'meta' }, 'No lost leads in this period.'));
  let team = null;
  if (isMgr()) {
    const ids = []; list.forEach(function (l) { const k = l.ownerEmail || ''; if (ids.indexOf(k) < 0) ids.push(k); });
    const rows = ids.map(function (id) {
      const m = list.filter(function (l) { return (l.ownerEmail || '') === id; });
      const w = m.filter(function (l) { return l.stage === 'won'; });
      const val = {}; w.forEach(function (l) { if (Number(l.dealValue)) { const c = l.currency || 'EGP'; val[c] = (val[c] || 0) + Number(l.dealValue); } });
      const rs = m.filter(function (l) { return l.firstContactAt && l.assignedAt; }).map(function (l) { return (Date.parse(l.firstContactAt) - Date.parse(l.assignedAt)) / 36e5; }).filter(function (x) { return x >= 0; });
      return { id: id, n: m.length, o: m.filter(function (l) { return OPEN(l.stage); }).length, w: w.length, val: val, c: m.length ? Math.round(w.length / m.length * 100) : 0,
        late: m.filter(function (l) { const f = fuInfo(l); return f && f.cls === 'late'; }).length,
        resp: rs.length ? rs.reduce(function (a, b) { return a + b; }, 0) / rs.length : null };
    }).sort(function (a, b) { return b.w - a.w || b.n - a.n; });
    team = h('div', { class: 'panel', style: 'grid-column:1/-1' }, h('h3', {}, 'Sales team'), h('div', { style: 'overflow-x:auto' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Agent', 'Leads', 'Open', 'Won', 'Sales value', 'Conversion', 'Avg first response', 'Overdue'].map(function (t) { return h('th', {}, t); }))),
      h('tbody', {}, rows.map(function (r) {
        return h('tr', {}, h('td', {}, r.id ? ownerBadge(r.id) : h('span', { class: 'meta' }, 'Unassigned')), h('td', { class: 'n' }, r.n), h('td', { class: 'n' }, r.o), h('td', { class: 'n' }, r.w),
          h('td', { class: 'n' }, Object.keys(r.val).map(function (c) { return money(r.val[c], c); }).join(' · ') || '—'), h('td', { class: 'n' }, r.c + '%'),
          h('td', { class: 'n' }, r.resp == null ? '—' : fmtHours(r.resp)),
          h('td', { class: 'n', style: r.late ? 'color:var(--danger);font-weight:600' : '' }, r.late));
      })))));
  }
  return h('div', {},
    h('div', { class: 'rep-head' }, h('h2', {}, isMgr() ? 'Team reports' : 'My reports'), sel),
    h('div', { class: 'kpis' },
      kpi('Leads', nf.format(list.length)), kpi('Open', nf.format(open.length)),
      kpi('Won', nf.format(won.length), Object.keys(sums).map(function (c) { return money(sums[c], c); }).join(' · ') || null),
      kpi('Conversion', conv + '%'), kpi('Avg first response', avgResp == null ? '—' : fmtHours(avgResp)),
      kpi('Overdue follow-ups', nf.format(late), null, late ? 'alert' : '')),
    h('div', { class: 'rep-grid' }, activitySection(), funnel, src, rating, proj, lost, team));
}

/* ---------- settings ---------- */
function dirty() { settingsDirty = true; }
function viewSettings() {
  const wrap = h('div', { class: 'sets' });
  wrap.append(projectsSec(), templatesSec(), importSec());
  if (isAdmin() && ADMIN) wrap.append(usersSec(), automationSec(), metaSec(), websiteSec());
  return wrap;
}
function saveBtn(label, fn) {
  const b = h('button', { class: 'btn primary' }, label);
  b.addEventListener('click', async function () {
    b.disabled = true;
    try { await fn(); settingsDirty = false; toast('Saved'); render(); } catch (e) { toast(errText(e), 'err'); b.disabled = false; }
  });
  return b;
}
function projectsSec() {
  const projs = JSON.parse(JSON.stringify(PROJECTS));
  const box = h('div', {});
  const draw = function () {
    put(box, projs.length ? projs.map(function (p, i) {
      return h('div', { class: 'proj' }, h('div', { class: 'proj-row' },
        h('input', { type: 'text', id: 'p-name-' + i, value: p.name || '', placeholder: 'Project name', dir: 'auto', oninput: function (e) { p.name = e.target.value; dirty(); } }),
        h('input', { type: 'text', id: 'p-country-' + i, value: p.country || '', placeholder: 'Country', style: 'flex:0 1 160px', oninput: function (e) { p.country = e.target.value; dirty(); } }),
        h('button', { class: 'btn ghost danger', onclick: function () { projs.splice(i, 1); dirty(); draw(); } }, 'Remove')));
    }) : h('p', { class: 'meta' }, 'No projects yet.'));
  };
  draw();
  return h('section', { class: 'sec' }, h('h2', {}, 'Projects'),
    h('p', { class: 'hint' }, 'Projects appear in the lead form and filters. Units for each project are managed in the Inventory tab.'),
    box, h('div', { class: 'acts', style: 'justify-content:flex-start' },
      h('button', { class: 'btn', onclick: function () { projs.push({ name: '', country: '' }); dirty(); draw(); } }, '+ Project'),
      saveBtn('Save projects', async function () { PROJECTS = await api('api_saveProjects', projs); })));
}
function templatesSec() {
  const list = JSON.parse(JSON.stringify(TEMPLATES));
  const box = h('div', {});
  const draw = function () {
    put(box, list.map(function (t, i) {
      return h('div', { class: 'tpl' },
        h('div', { class: 'proj-row' }, h('input', { type: 'text', id: 'tpl-name-' + i, value: t.name, placeholder: 'Template name', oninput: function (e) { t.name = e.target.value; dirty(); } }),
          h('button', { class: 'btn ghost danger', onclick: function () { list.splice(i, 1); dirty(); draw(); } }, 'Remove')),
        h('textarea', { id: 'tpl-text-' + i, rows: 3, dir: 'auto', value: t.text, oninput: function (e) { t.text = e.target.value; dirty(); } }));
    }));
  };
  draw();
  return h('section', { class: 'sec' }, h('h2', {}, 'WhatsApp templates'),
    h('p', { class: 'hint' }, 'Agents pick these from the WhatsApp button on a lead. Placeholders: {name} first name, {fullname}, {agent}, {project}, {unit}, {price}, {visit} next site visit.'),
    box, h('div', { class: 'acts', style: 'justify-content:flex-start' },
      h('button', { class: 'btn', onclick: function () { list.push({ name: '', text: '' }); dirty(); draw(); } }, '+ Template'),
      saveBtn('Save templates', async function () { TEMPLATES = await api('api_saveTemplates', list); })));
}
function parseCSV(t) {
  t = String(t || '').replace(/^\uFEFF/, '');
  const first = t.split('\n')[0] || '';
  const d = first.indexOf('\t') >= 0 ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows.filter(function (x) { return x.some(function (y) { return y.trim(); }); });
}
function readFileInto(ta, after) {
  return h('input', { type: 'file', accept: '.csv,.tsv,.txt', onchange: async function (e) {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer(); const b = new Uint8Array(buf);
    ta.value = b[0] === 0xFF && b[1] === 0xFE ? new TextDecoder('utf-16le').decode(buf) : b[0] === 0xFE && b[1] === 0xFF ? new TextDecoder('utf-16be').decode(buf) : new TextDecoder('utf-8').decode(buf);
    after();
  } });
}
function parseLeads(t) {
  const rows = parseCSV(t);
  if (rows.length < 2) return [];
  const H = rows[0].map(function (x) { return x.trim().toLowerCase(); });
  const col = function (keys) { return H.findIndex(function (x) { return keys.indexOf(x) >= 0; }); };
  const ci = { name: col(['full_name', 'full name', 'name', 'الاسم', 'اسم']), phone: col(['phone_number', 'phone', 'mobile', 'الموبايل', 'رقم الموبايل', 'التليفون']),
    email: col(['email', 'الإيميل']), camp: col(['campaign_name', 'campaign', 'الحملة']), project: col(['project', 'المشروع']), note: col(['notes', 'note', 'ملاحظات', 'ad_name', 'form_name']) };
  if (ci.name < 0 && ci.phone < 0) return [];
  return rows.slice(1).map(function (r) {
    const g = function (i) { return i >= 0 ? (r[i] || '').trim() : ''; };
    return { name: g(ci.name), phone: g(ci.phone).replace(/^p:/i, ''), email: g(ci.email), campaign: g(ci.camp), project: g(ci.project), note: g(ci.note) };
  }).filter(function (x) { return x.name || x.phone; });
}
function importSec() {
  const ta = h('textarea', { id: 'imp-text', rows: 6, placeholder: 'Paste CSV content here (first row = column names)' });
  const src = h('select', { id: 'imp-src' }, C.sources.map(function (s) { return h('option', { value: s[0], selected: s[0] === 'meta' }, s[1]); }));
  const proj = h('select', { id: 'imp-proj' }, h('option', { value: '' }, 'No project'), PROJECTS.map(function (p) { return h('option', { value: p.name }, p.name); }));
  const info = h('p', { class: 'status', style: 'margin:0' });
  const btn = h('button', { class: 'btn primary', disabled: true }, 'Import and assign');
  const preview = function () { dirty(); const n = parseLeads(ta.value).length; info.textContent = n ? 'Found ' + n + ' leads. Numbers that already exist are logged on the existing lead instead of being added again.' : (ta.value.trim() ? 'No name or phone column found in the first row.' : ''); btn.disabled = !n; };
  ta.addEventListener('input', preview);
  btn.addEventListener('click', async function () {
    const rows = parseLeads(ta.value); if (!rows.length) return;
    btn.disabled = true; info.textContent = 'Importing ' + rows.length + ' leads…';
    try {
      const r = await api('api_importRows', rows, src.value, proj.value);
      applySync(r); settingsDirty = false;
      toast('Added ' + r.added + ' leads' + (r.dups ? ', ' + r.dups + ' already existed' : ''));
      render();
    } catch (e) { info.textContent = errText(e); info.className = 'status err'; btn.disabled = false; }
  });
  return h('section', { class: 'sec' }, h('h2', {}, 'Import leads (CSV)'),
    h('p', { class: 'hint' }, 'For old leads or any sheet. Recognised columns: full_name / name, phone_number / phone, email, campaign_name, project. Leads are auto-assigned to the team.'),
    h('div', { style: 'display:grid;gap:10px' }, readFileInto(ta, preview), ta,
      h('div', { class: 'proj-row' }, h('div', { class: 'field' }, h('label', { for: 'imp-src' }, 'Source'), src), h('div', { class: 'field' }, h('label', { for: 'imp-proj' }, 'Project'), proj)),
      info, h('div', { class: 'acts', style: 'justify-content:flex-start' }, btn)));
}
function usersSec() {
  const users = JSON.parse(JSON.stringify(ADMIN.users));
  const body = h('tbody', {});
  const draw = function () {
    put(body, users.map(function (u, i) {
      return h('tr', {},
        h('td', {}, h('input', { type: 'email', id: 'u-email-' + i, value: u.email, placeholder: 'name@gmail.com or name@edenalkhalij.com', oninput: function (e) { u.email = e.target.value.trim().toLowerCase(); dirty(); } })),
        h('td', {}, h('input', { type: 'text', id: 'u-name-' + i, value: u.name || '', placeholder: 'Name', dir: 'auto', oninput: function (e) { u.name = e.target.value; dirty(); } })),
        h('td', {}, h('select', { id: 'u-role-' + i, onchange: function (e) { u.role = e.target.value; dirty(); } },
          [['sales', 'Sales'], ['manager', 'Manager'], ['admin', 'Admin']].map(function (r) { return h('option', { value: r[0], selected: u.role === r[0] }, r[1]); }))),
        h('td', { style: 'text-align:center' }, h('input', { type: 'checkbox', class: 'check', id: 'u-recv-' + i, checked: u.receivesLeads, 'aria-label': 'Receives leads', onchange: function (e) { u.receivesLeads = e.target.checked; dirty(); } })),
        h('td', { style: 'text-align:center' }, h('input', { type: 'checkbox', class: 'check', id: 'u-active-' + i, checked: u.active, 'aria-label': 'Active', onchange: function (e) { u.active = e.target.checked; dirty(); } })));
    }));
  };
  draw();
  return h('section', { class: 'sec' }, h('h2', {}, 'Team and permissions'),
    h('p', { class: 'hint' }, 'Everyone who opens the CRM must be listed here. Any email works (company, Gmail, Outlook…): they sign in with a code sent to that email. Sales see only their own leads, managers see everything and assign, the admin controls settings. "Receives leads" puts the person in auto-assignment. When someone leaves, untick Active and reassign their leads.'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'users-tbl', style: 'min-width:640px' },
      h('thead', {}, h('tr', {}, ['Email', 'Name', 'Role', 'Receives leads', 'Active'].map(function (t) { return h('th', {}, t); }))), body)),
    h('div', { class: 'acts', style: 'justify-content:flex-start;margin-top:10px' },
      h('button', { class: 'btn', onclick: function () { users.push({ email: '', name: '', role: 'sales', active: true, receivesLeads: true }); dirty(); draw(); } }, '+ Member'),
      saveBtn('Save team', async function () {
        ADMIN = await api('api_saveUsers', users);
        PEOPLE = ADMIN.users.filter(function (u) { return u.active; }).map(function (u) { return { email: u.email, name: u.name || u.email, role: u.role, receivesLeads: u.receivesLeads }; });
      })));
}
function automationSec() {
  const s = ADMIN.settings;
  const nums = [['SLA_FIRST_CONTACT_HOURS', 'Alert if a new lead is not contacted after (hours)', '0 = off'],
    ['AUTO_REASSIGN_HOURS', 'Move the lead to another agent if still not contacted after (hours)', '0 = off'],
    ['MAX_REASSIGNS', 'Maximum automatic moves per lead', ''],
    ['TASK_REMINDER_MIN', 'Email a task reminder before it is due (minutes)', '0 = off'],
    ['VISIT_DURATION_MIN', 'Site visit / meeting length on the calendar (minutes)', ''],
    ['RESERVATION_DAYS', 'Default unit reservation (days)', 'Expired reservations free the unit automatically'],
    ['DIGEST_HOUR', 'Morning digest email hour', 'Cairo time, 0–23']];
  const flags = [['CALENDAR_SYNC', 'Put site visits and meetings on the shared EDEN CRM calendar and invite the agent'],
    ['ALLOW_SALES_EXPORT', 'Let sales agents export their own leads to Excel']];
  const vals = {};
  const grid = h('div', { class: 'kv' }, nums.map(function (f) {
    vals[f[0]] = s[f[0]];
    return [h('label', { for: 'set-' + f[0] }, f[1], f[2] ? h('small', {}, f[2]) : null),
      h('input', { type: 'number', min: 0, id: 'set-' + f[0], value: s[f[0]], oninput: function (e) { vals[f[0]] = e.target.value; dirty(); } })];
  }));
  const checks = h('div', { style: 'display:grid;gap:8px;margin-top:12px' }, flags.map(function (f) {
    vals[f[0]] = /^(true|1|yes)$/i.test(s[f[0]] || '');
    return h('label', { class: 'check-row' }, h('input', { type: 'checkbox', class: 'check', id: 'set-' + f[0], checked: vals[f[0]], onchange: function (e) { vals[f[0]] = e.target.checked; dirty(); } }), f[1]);
  }));
  const run = h('button', { class: 'btn' }, 'Run automations now');
  run.addEventListener('click', async function () {
    run.disabled = true; run.textContent = 'Running…';
    try { ADMIN = await api('api_runAutomationsNow'); applySync(await api('api_sync')); toast('Done'); settingsDirty = false; render(); }
    catch (e) { toast(errText(e), 'err'); run.disabled = false; run.textContent = 'Run automations now'; }
  });
  return h('section', { class: 'sec' }, h('h2', {}, 'Automations and alerts'),
    h('p', { class: 'hint' }, 'Every 10 minutes: pull Meta and website leads and assign them, alert when a new lead passes the first-contact time, move it to a colleague if it stays untouched, send task reminders and free expired unit reservations. Every morning: each agent gets their day by email and managers get a summary.'),
    grid, checks,
    h('p', { class: 'status' + (ADMIN.lastError ? ' err' : '') }, 'Last run: ' + (ADMIN.lastAutomation ? dtf.format(new Date(ADMIN.lastAutomation)) : 'not yet') + (ADMIN.lastError ? ' · Problem: ' + ADMIN.lastError : '')),
    h('div', { class: 'acts', style: 'justify-content:flex-start' }, saveBtn('Save', async function () { ADMIN = await api('api_saveSettings', vals); CFG.reservationDays = Number(vals.RESERVATION_DAYS) || CFG.reservationDays; }), run));
}
function metaSec() {
  const s = ADMIN.settings;
  const token = h('input', { type: 'password', id: 'meta-token', placeholder: ADMIN.metaTokenSet ? 'Saved ✓ — type a new one to replace it' : 'Page Access Token', autocomplete: 'off', style: 'width:100%', oninput: dirty });
  const forms = h('textarea', { id: 'meta-forms', rows: 3, placeholder: '1234567890123456:Eden Walk', value: s.META_FORM_IDS || '', oninput: dirty });
  const out = h('pre', { class: 'mono', hidden: true });
  const test = h('button', { class: 'btn' }, 'Test connection');
  test.addEventListener('click', async function () {
    test.disabled = true; out.hidden = false; out.textContent = 'Testing…';
    try { const r = await api('api_testMeta'); out.textContent = r.message; } catch (e) { out.textContent = errText(e); }
    test.disabled = false;
  });
  return h('section', { class: 'sec' }, h('h2', {}, 'Meta Lead Ads'),
    h('p', { class: 'hint' }, 'The CRM pulls new leads from your Facebook and Instagram lead forms every 10 minutes and assigns them. It needs a Page Access Token with leads_retrieval, and each form ID with its project, one per line.'),
    h('div', { style: 'display:grid;gap:10px' },
      h('div', { class: 'field' }, h('label', { for: 'meta-token' }, 'Page Access Token'), token),
      h('div', { class: 'field' }, h('label', { for: 'meta-forms' }, 'Forms (FormID:Project — one per line)'), forms),
      h('p', { class: 'status' }, 'Last pull: ' + (ADMIN.lastMetaSync ? dtf.format(new Date(ADMIN.lastMetaSync)) : 'not yet')),
      out, h('div', { class: 'acts', style: 'justify-content:flex-start' },
        saveBtn('Save', async function () { const m = { META_FORM_IDS: forms.value }; if (token.value.trim()) m.META_PAGE_TOKEN = token.value.trim(); ADMIN = await api('api_saveSettings', m); }), test)));
}
function websiteSec() {
  return h('section', { class: 'sec' }, h('h2', {}, 'Website form and data'),
    h('p', { class: 'hint' }, 'The website form sends leads straight to the CRM. Put these two values in website-snippet.html (in the GitHub repo):'),
    h('div', { class: 'field' }, h('label', {}, 'Form address (API URL)'), h('div', { class: 'mono' }, ADMIN.apiUrl || '—')),
    h('div', { class: 'field', style: 'margin-top:8px' }, h('label', {}, 'Secret'), h('div', { class: 'mono' }, ADMIN.intakeSecret || '—')),
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'The data spreadsheet is for you only. Never share it with sales, or they will see each other\'s leads.'),
    h('a', { href: ADMIN.spreadsheetUrl, target: '_blank', rel: 'noopener', class: 'btn' }, 'Open data spreadsheet'));
}

/* ---------- drawer ---------- */
function openDrawer(label, head, body) {
  const panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, head, body);
  put($('drawer-root'), [h('div', { class: 'scrim', onclick: closeDrawer }), panel]);
  document.removeEventListener('keydown', escClose);
  document.addEventListener('keydown', escClose);
  return panel;
}
function escClose(e) { if (e.key === 'Escape' && !document.querySelector('.menu')) closeDrawer(); }
function closeDrawer() { D = null; $('drawer-root').replaceChildren(); document.removeEventListener('keydown', escClose); }
function closeBtn() { return h('button', { class: 'btn ghost', 'aria-label': 'Close', onclick: closeDrawer }, '✕'); }
function refreshDrawer(passive) {
  if (!D || !D.refresh) return;
  if (passive && D.panel && D.panel.contains(document.activeElement) && document.activeElement !== D.panel) return;
  D.refresh();
}
function applySync(r) {
  if (!r) return;
  if (r.leads) LEADS = r.leads;
  if (r.tasks) TASKS = r.tasks;
  if (r.units) UNITS = r.units;
  if (r.today) TODAY = r.today;
  if (r.detail && D && D.kind === 'lead' && D.id === r.detail.lead.id) D.acts = r.detail.activities;
  render(); refreshDrawer();
}

/* ---------- lead drawer ---------- */
function openLead(id, pendingStage) {
  const l = id === 'new' ? null : leadOf(id);
  if (id !== 'new' && !l) return;
  const head = h('div', { class: 'd-head' });
  const live = h('div', { style: 'display:grid;gap:16px' });
  const unitHost = h('div', {});
  const tasksHost = h('div', {});
  const logHost = h('div', {}, h('span', { class: 'lbl' }, 'Activity'), h('p', { class: 'loading-row' }, 'Loading…'));
  const actBox = l ? activityBox(l) : null;
  const body = h('div', { class: 'd-body' }, live,
    l ? unitHost : null, l ? tasksHost : null, l ? taskForm(l) : null,
    leadForm(l), actBox, l ? logHost : null, l && isAdmin() ? dangerZone(l) : null);
  const panel = openDrawer(l ? (l.name || 'Lead') : 'New lead', head, body);
  D = { kind: 'lead', id: id, panel: panel, head: head, live: live, unitHost: unitHost, tasksHost: tasksHost, logHost: logHost, pendingStage: pendingStage || null, acts: null, menu: false };
  D.refresh = refreshLead;
  refreshLead();
  if (l) api('api_getLead', id).then(function (r) { if (!D || D.id !== id) return; D.acts = r.activities; refreshLead(); })
    .catch(function (e) { toast(errText(e), 'err'); });
}
function fillTpl(text, l) {
  const visit = TASKS.filter(function (t) { return t.leadId === l.id && t.status === 'open' && t.type === 'visit'; }).sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : 1; })[0];
  const u = unitOf(l.unit);
  const map = { name: String(l.name || '').trim().split(/\s+/)[0] || '', fullname: l.name || '', agent: String(ME.name || '').trim().split(/\s+/)[0],
    project: l.project || '', unit: l.unit || '', price: u ? money(u.price, u.currency) : '', visit: visit ? dtf.format(new Date(visit.dueAt)) : '' };
  return text.replace(/\{(\w+)\}/g, function (m, k) { return k in map ? map[k] : m; });
}
function waButton(l) {
  const wa = waNum(l.phone);
  if (!wa) return null;
  const wrap = h('div', { class: 'menu-wrap' });
  const close = function () { const m = wrap.querySelector('.menu'); if (m) m.remove(); document.removeEventListener('click', outside, true); };
  const outside = function (e) { if (!wrap.contains(e.target)) close(); };
  const pick = function (tpl) {
    close();
    openExternal('https://wa.me/' + wa + (tpl ? '?text=' + encodeURIComponent(fillTpl(tpl.text, l)) : ''));
    const type = $('a-type'), text = $('a-text');
    if (type && text) { type.value = 'whatsapp'; text.value = tpl ? 'Sent WhatsApp: ' + tpl.name : 'WhatsApp chat'; text.focus(); }
    toast('WhatsApp opened. Press Log below to record it.');
  };
  wrap.append(h('button', { class: 'btn', 'aria-haspopup': 'true', onclick: function () {
    if (wrap.querySelector('.menu')) { close(); return; }
    wrap.append(h('div', { class: 'menu', role: 'menu' },
      h('button', { role: 'menuitem', onclick: function () { pick(null); } }, 'Open chat'),
      TEMPLATES.map(function (t) { return h('button', { role: 'menuitem', onclick: function () { pick(t); } }, t.name, h('small', { dir: 'auto' }, fillTpl(t.text, l))); })));
    setTimeout(function () { document.addEventListener('click', outside, true); });
  } }, 'WhatsApp ▾'));
  return wrap;
}
function refreshLead() {
  if (!D || D.kind !== 'lead') return;
  if (D.id === 'new') { put(D.head, [h('h2', {}, 'New lead'), closeBtn()]); return; }
  const l = leadOf(D.id);
  if (!l) { closeDrawer(); return; }
  put(D.head, [h('h2', {}, l.name || 'No name', h('div', { class: 'sub' }, [SRC[l.source], l.campaign, l.project, isMgr() ? nm(l.ownerEmail) : null].filter(Boolean).join(' · '))), closeBtn()]);
  const contact = l.phone ? h('div', { class: 'contact' }, h('span', { class: 'phone ltr num' }, l.phone),
    waButton(l),
    h('a', { class: 'btn', href: 'tel:' + l.phone }, 'Call'),
    h('button', { class: 'btn ghost', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(l.phone) : Promise.reject()).then(function () { toast('Number copied'); }, function () { toast('Select the number and copy it'); }); } }, 'Copy'),
    l.email ? h('span', { class: 'meta', style: 'user-select:all' }, l.email) : null) : null;
  const rate = h('div', { class: 'rate-row' }, h('span', { class: 'lbl', style: 'margin:0 6px 0 0' }, 'Rating'), C.ratings.map(function (r) {
    return h('button', { class: 'sbtn', 'aria-pressed': String(l.rating === r[0]), onclick: async function () {
      try { applySync(await api('api_saveLead', { id: l.id, rating: l.rating === r[0] ? '' : r[0] })); } catch (e) { toast(errText(e), 'err'); }
    } }, h('span', { class: 'rate rate-' + r[0], style: 'padding:0 6px' }, r[1]));
  }), tagList(l));
  const stage = l.stage || 'new';
  const stages = h('div', {}, h('span', { class: 'lbl' }, 'Stage'), h('div', { class: 'stages' }, C.stages.map(function (s) {
    return h('button', { class: 'sbtn', 'aria-pressed': String(stage === s[0]), onclick: function () {
      if (stage === s[0]) return;
      if (s[0] === 'won' || s[0] === 'lost') { D.pendingStage = s[0]; refreshLead(); } else { D.pendingStage = null; changeStage(l.id, s[0]); }
    } }, h('span', { class: 'dot st-' + s[0] }), s[1]);
  })));
  let sub = null;
  if (D.pendingStage === 'won') {
    const u0 = unitOf(l.unit);
    const sellable = UNITS.filter(function (u) { return u.status === 'available' || (u.leadId === l.id && u.status === 'reserved'); });
    const v = h('input', { type: 'number', id: 'won-val', placeholder: 'Deal value', value: l.dealValue || (u0 && u0.price) || '', style: 'flex:1 1 140px' });
    const c = h('select', { id: 'won-cur' }, C.currencies.map(function (x) { return h('option', { value: x, selected: (l.currency || (u0 && u0.currency) || 'EGP') === x }, x); }));
    const u = h('input', { type: 'text', id: 'won-unit', placeholder: 'Unit sold', value: l.unit || '', list: 'won-units', style: 'flex:1 1 140px' });
    u.addEventListener('change', function () { const x = unitOf(u.value); if (x && x.price && !v.value) { v.value = x.price; c.value = x.currency || 'EGP'; } });
    sub = h('div', { class: 'subform' }, v, c, u, h('datalist', { id: 'won-units' }, sellable.map(function (x) { return h('option', { value: x.code }, [x.project, x.type, money(x.price, x.currency)].filter(Boolean).join(' · ')); })),
      h('button', { class: 'btn primary', onclick: function () { D.pendingStage = null; changeStage(l.id, 'won', { dealValue: v.value, currency: c.value, unit: u.value.trim() }); } }, 'Confirm sale'),
      h('button', { class: 'btn ghost', onclick: function () { D.pendingStage = null; refreshLead(); } }, 'Cancel'));
  }
  if (D.pendingStage === 'lost') {
    const s = h('select', { id: 'lost-r' }, C.lostReasons.map(function (x) { return h('option', { value: x }, x); }));
    sub = h('div', { class: 'subform' }, h('span', {}, 'Reason'), s,
      h('button', { class: 'btn primary', onclick: function () { D.pendingStage = null; changeStage(l.id, 'lost', { lostReason: s.value }); } }, 'Confirm'),
      h('button', { class: 'btn ghost', onclick: function () { D.pendingStage = null; refreshLead(); } }, 'Cancel'));
  }
  put(D.live, [contact, rate, stages, sub]);
  put(D.unitHost, unitBox(l));
  const open = TASKS.filter(function (t) { return t.leadId === l.id && t.status === 'open'; }).sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : 1; });
  put(D.tasksHost, [h('span', { class: 'lbl' }, 'Tasks'), open.length ? h('div', { class: 'task-list' }, open.map(function (t) { return taskRow(t, { inLead: true }); })) : h('p', { class: 'meta', style: 'margin:0' }, 'No open tasks.')]);
  if (D.acts) {
    const A = C.actLabel;
    put(D.logHost, [h('span', { class: 'lbl' }, 'Activity'), D.acts.length ? h('div', { class: 'log' }, D.acts.slice().reverse().map(function (a) {
      let what = a.text || '';
      if (a.type === 'stage') what = (SL[a.fromVal] || '') + ' → ' + (SL[a.toVal] || '') + (a.text ? '\n' + a.text : '');
      if (a.type === 'assign') what = (a.toVal ? 'to ' + nm(a.toVal) : 'owner removed') + (a.text ? '\n' + a.text : '');
      return h('div', { class: 'ev' + (a.type === 'stage' ? ' stage' : '') },
        h('div', { class: 'who' }, nm(a.by) + ' · ' + (a.at ? dtf.format(new Date(a.at)) : '')),
        h('div', { class: 'what', dir: 'auto' }, h('span', { class: 'tag', style: 'border:0;padding:0;font-weight:600;color:var(--fg);font-size:13px;margin-right:6px' }, A[a.type] || a.type), what));
    })) : h('p', { class: 'meta' }, 'No activity yet.')]);
  }
}
function unitBox(l) {
  const u = unitOf(l.unit);
  const mineReserved = UNITS.filter(function (x) { return x.status === 'reserved' && x.leadId === l.id; })[0];
  const box = h('div', { class: 'unit-box' }, h('span', { class: 'lbl', style: 'margin:0' }, 'Unit'));
  if (mineReserved) {
    const days = h('input', { type: 'number', id: 'ext-days', min: 1, max: 90, value: CFG.reservationDays, style: 'width:80px', 'aria-label': 'Days' });
    box.append(h('div', { class: 'row' }, h('strong', {}, mineReserved.code), ustPill('reserved'), h('span', { class: 'meta' }, 'until ' + fmtDay(mineReserved.reservedUntil)),
      mineReserved.price ? h('span', { class: 'meta' }, money(mineReserved.price, mineReserved.currency)) : null),
      h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Extend by'), days, h('span', { class: 'meta' }, 'days'),
        h('button', { class: 'btn', onclick: function () { reserve(l.id, mineReserved.code, days.value); } }, 'Extend'),
        h('button', { class: 'btn ghost danger', onclick: function () { releaseUnit(mineReserved.code); } }, 'Release')));
    return box;
  }
  if (u && u.status === 'sold' && u.leadId === l.id) {
    box.append(h('div', { class: 'row' }, h('strong', {}, u.code), ustPill('sold'), h('span', { class: 'meta' }, [u.project, u.type, money(u.price, u.currency)].filter(Boolean).join(' · '))));
    return box;
  }
  if (!OPEN(l.stage)) { box.append(h('p', { class: 'meta', style: 'margin:0' }, l.unit ? l.unit : 'No unit linked.')); return box; }
  const avail = UNITS.filter(function (x) { return x.status === 'available'; })
    .sort(function (a, b) { const pa = a.project === l.project ? 0 : 1, pb = b.project === l.project ? 0 : 1; return pa - pb || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }); });
  if (l.unit && !mineReserved) box.append(h('p', { class: 'meta', style: 'margin:0' }, 'Interested in ' + l.unit + (u ? ' — ' + (USL[u.status] || u.status) : '')));
  if (!UNITS.length) { box.append(h('p', { class: 'meta', style: 'margin:0' }, 'The unit inventory is empty. A manager can add units in Inventory.')); return box; }
  if (!avail.length) { box.append(h('p', { class: 'meta', style: 'margin:0' }, 'No units are available right now.')); return box; }
  const sel = h('select', { id: 'res-unit', 'aria-label': 'Unit' }, avail.map(function (x) {
    return h('option', { value: x.code, selected: u && x.code === u.code }, [x.code, x.project, x.type, x.area ? x.area + ' m²' : '', money(x.price, x.currency)].filter(Boolean).join(' · '));
  }));
  const days = h('input', { type: 'number', id: 'res-days', min: 1, max: 90, value: CFG.reservationDays, style: 'width:80px', 'aria-label': 'Days' });
  box.append(h('div', { class: 'row' }, sel), h('div', { class: 'row' }, h('span', { class: 'meta' }, 'Reserve for'), days, h('span', { class: 'meta' }, 'days'),
    h('button', { class: 'btn primary', onclick: function () { reserve(l.id, sel.value, days.value); } }, 'Reserve')));
  return box;
}
async function reserve(leadId, code, days, note) {
  try { applySync(await api('api_reserveUnit', leadId, code, Number(days) || CFG.reservationDays, note || '')); toast('Unit ' + code + ' reserved'); }
  catch (e) { toast(errText(e), 'err'); }
}
async function releaseUnit(code) {
  try { applySync(await api('api_releaseUnit', code, '')); toast('Unit ' + code + ' released'); if (D && D.kind === 'lead') api('api_getLead', D.id).then(function (r) { if (D && D.id === r.lead.id) { D.acts = r.activities; refreshLead(); } }); }
  catch (e) { toast(errText(e), 'err'); }
}
function taskForm(l) {
  const wrap = h('div', { class: 'addact' });
  const draw = function (open) {
    if (!open) { put(wrap, h('button', { class: 'btn', style: 'justify-self:start', onclick: function () { draw(true); } }, '+ Add task')); return; }
    const type = h('select', { id: 't-type' }, C.taskTypes.map(function (t) { return h('option', { value: t[0] }, t[1]); }));
    const title = h('input', { type: 'text', id: 't-title', placeholder: 'Title (optional)', dir: 'auto', style: 'flex:1 1 200px' });
    const date = h('input', { type: 'date', id: 't-date', value: addDays(TODAY, 1) });
    const time = h('input', { type: 'time', id: 't-time', value: '11:00', step: 900 });
    let owner = null;
    if (isMgr()) {
      owner = h('select', { id: 't-owner', 'aria-label': 'Assign to' }, PEOPLE.map(function (p) { return h('option', { value: p.email }, nm(p.email)); }));
      owner.value = l.ownerEmail || ME.email;
    }
    const notes = h('input', { type: 'text', id: 't-notes', placeholder: 'Notes (optional)', dir: 'auto', style: 'flex:1 1 200px' });
    const quick = function (label, n, hh) { return h('button', { class: 'btn ghost', onclick: function () { date.value = addDays(TODAY, n); time.value = hh; } }, label); };
    const save = h('button', { class: 'btn primary' }, 'Add task');
    save.addEventListener('click', async function () {
      if (!date.value || !time.value) { toast('Pick a date and time', 'err'); return; }
      save.disabled = true;
      try {
        const d = { leadId: l.id, type: type.value, title: title.value.trim(), dueAt: new Date(date.value + 'T' + time.value).toISOString(), notes: notes.value.trim() };
        if (owner) d.ownerEmail = owner.value;
        applySync(await api('api_saveTask', d));
        toast(type.value === 'visit' || type.value === 'meeting' ? 'Task added and sent to the calendar' : 'Task added');
        draw(false);
      } catch (e) { toast(errText(e), 'err'); save.disabled = false; }
    });
    put(wrap, [h('span', { class: 'lbl', style: 'margin:0' }, 'New task'),
      h('div', { class: 'row' }, type, title),
      h('div', { class: 'row' }, date, time, quick('Today 17:00', 0, '17:00'), quick('Tomorrow 11:00', 1, '11:00'), quick('In 3 days', 3, '11:00')),
      h('div', { class: 'row' }, owner, notes),
      h('div', { class: 'acts' }, h('button', { class: 'btn ghost', onclick: function () { draw(false); } }, 'Cancel'), save)]);
    title.focus();
  };
  draw(false);
  return wrap;
}
function field(label, id, el, full) { return h('div', { class: 'field' + (full ? ' full' : '') }, h('label', { for: id }, label), el); }
function leadForm(l) {
  const isNew = !l;
  const x = l || { source: 'manual', nextFollowUp: TODAY };
  const name = h('input', { type: 'text', id: 'f-name', value: x.name || '', dir: 'auto' });
  const phone = h('input', { type: 'tel', id: 'f-phone', value: x.phone || '', dir: 'ltr' });
  const email = h('input', { type: 'email', id: 'f-email', value: x.email || '' });
  const source = h('select', { id: 'f-src' }, C.sources.map(function (s) { return h('option', { value: s[0], selected: x.source === s[0] }, s[1]); }));
  const pnames = projectNames();
  const project = h('select', { id: 'f-proj' }, h('option', { value: '' }, '—'), pnames.map(function (p) { return h('option', { value: p, selected: x.project === p }, p); }));
  const dl = h('datalist', { id: 'units-dl' });
  const fillUnits = function () {
    put(dl, UNITS.filter(function (u) { return !project.value || u.project === project.value; }).map(function (u) { return h('option', { value: u.code }, (USL[u.status] || '') + (u.price ? ' · ' + money(u.price, u.currency) : '')); }));
  };
  fillUnits(); project.addEventListener('change', fillUnits);
  const unit = h('input', { type: 'text', id: 'f-unit', value: x.unit || '', list: 'units-dl', placeholder: 'Unit of interest' });
  const budget = h('input', { type: 'text', id: 'f-budget', value: x.budget || '', placeholder: 'e.g. 3–4M, cash', dir: 'auto' });
  const tags = h('input', { type: 'text', id: 'f-tags', value: x.tags || '', placeholder: 'e.g. investor, 3 bedrooms, cash', dir: 'auto' });
  const rating = h('select', { id: 'f-rating' }, h('option', { value: '' }, 'Not rated'), C.ratings.map(function (r) { return h('option', { value: r[0], selected: x.rating === r[0] }, r[1]); }));
  let owner = null;
  if (isMgr()) {
    const opts = [];
    if (isNew) opts.push(['auto', 'Auto-assign']);
    PEOPLE.forEach(function (p) { opts.push([p.email, nm(p.email)]); });
    if (x.ownerEmail && !opts.some(function (o) { return o[0] === x.ownerEmail; })) opts.push([x.ownerEmail, nm(x.ownerEmail)]);
    opts.push(['', 'Unassigned']);
    owner = h('select', { id: 'f-owner-sel' }, opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    owner.value = isNew ? 'auto' : (x.ownerEmail || '');
  }
  const fu = h('input', { type: 'date', id: 'f-fu', value: x.nextFollowUp || '' });
  const note = isNew ? h('textarea', { id: 'f-note', rows: 3, dir: 'auto', placeholder: 'First contact, what they are looking for, any details' }) : null;
  const warn = h('div', {});
  const save = h('button', { class: 'btn primary' }, isNew ? 'Add lead' : 'Save changes');
  let force = false;
  save.addEventListener('click', async function () {
    const d = { id: isNew ? null : l.id, name: name.value.trim(), phone: phone.value.trim(), email: email.value.trim(), source: source.value,
      project: project.value, unit: unit.value.trim(), budget: budget.value.trim(), tags: tags.value, rating: rating.value, nextFollowUp: fu.value || '' };
    if (!d.name && !d.phone) { toast('Enter at least a name or a phone number', 'err'); return; }
    if (owner) d.ownerEmail = owner.value;
    if (isNew) { d.note = note.value.trim(); d.force = force; }
    save.disabled = true;
    try {
      const r = await api('api_saveLead', d);
      if (r.duplicate) {
        const dup = r.duplicate;
        put(warn, h('div', { class: 'warnbox' },
          'This number already exists' + (dup.name ? ' as "' + dup.name + '"' : '') + ', owned by ' + dup.ownerName + '.',
          dup.id ? h('button', { class: 'btn', onclick: function () { openLead(dup.id); } }, 'Open it') : null,
          dup.canForce ? h('button', { class: 'btn', onclick: function () { force = true; save.click(); } }, 'Add anyway') : null));
        save.disabled = false; return;
      }
      applySync(r);
      toast(isNew ? 'Lead added' : 'Saved');
      if (isNew) openLead(r.detail.lead.id); else save.disabled = false;
    } catch (e) { toast(errText(e), 'err'); save.disabled = false; }
  });
  return h('div', {}, h('span', { class: 'lbl' }, isNew ? 'Lead details' : 'Details'),
    h('div', { class: 'form' },
      field('Name', 'f-name', name), field('Phone', 'f-phone', phone), field('Source', 'f-src', source), field('Email', 'f-email', email),
      field('Project', 'f-proj', project), field('Unit', 'f-unit', h('div', {}, unit, dl)), field('Budget', 'f-budget', budget), field('Rating', 'f-rating', rating),
      field('Tags (comma separated)', 'f-tags', tags, true),
      owner ? field('Owner', 'f-owner-sel', owner) : field('Owner', 'f-owner-ro', h('div', { id: 'f-owner-ro', style: 'padding:8px 0' }, isNew ? 'Me' : nm(x.ownerEmail))),
      field('Next follow-up', 'f-fu', fu), note ? field('Note', 'f-note', note, true) : null,
      h('div', { class: 'full' }, warn), h('div', { class: 'full acts' }, save)));
}
function activityBox(l) {
  const A = C.actLabel;
  const type = h('select', { id: 'a-type' }, ['call', 'whatsapp', 'visit', 'meeting', 'note'].map(function (k) { return h('option', { value: k }, A[k]); }));
  const text = h('textarea', { id: 'a-text', rows: 2, dir: 'auto', placeholder: 'What happened? What did they say?' });
  const next = h('input', { type: 'date', id: 'a-next' });
  const quick = function (n, t) { return h('button', { class: 'btn ghost', onclick: function () { next.value = addDays(TODAY, n); } }, t); };
  const btn = h('button', { class: 'btn primary' }, 'Log');
  btn.addEventListener('click', async function () {
    if (type.value === 'note' && !text.value.trim() && !next.value) { toast('Write what happened or pick the next follow-up', 'err'); return; }
    btn.disabled = true;
    try {
      const r = await api('api_addActivity', l.id, { type: type.value, text: text.value.trim(), nextFollowUp: next.value });
      text.value = ''; if (next.value) { const f = $('f-fu'); if (f) f.value = next.value; } next.value = '';
      applySync(r); toast('Logged');
    } catch (e) { toast(errText(e), 'err'); }
    btn.disabled = false;
  });
  return h('div', { class: 'addact' }, h('span', { class: 'lbl', style: 'margin:0' }, 'Log contact'),
    h('div', { class: 'row' }, type), text,
    h('div', { class: 'row' }, h('label', { for: 'a-next', class: 'meta' }, 'Next follow-up'), next, quick(1, 'Tomorrow'), quick(3, 'In 3 days'), quick(7, 'In a week')),
    h('div', { class: 'acts' }, btn));
}
function dangerZone(l) {
  const box = h('div', { class: 'danger-zone' });
  const draw = function () {
    put(box, h('button', { class: 'btn danger', onclick: function () {
      put(box, [h('span', {}, 'Delete for good, with its activity and tasks?'),
        h('button', { class: 'btn danger', onclick: async function () {
          try { const r = await api('api_deleteLead', l.id); closeDrawer(); applySync(r); toast('Deleted'); }
          catch (e) { toast(errText(e), 'err'); }
        } }, 'Delete'),
        h('button', { class: 'btn ghost', onclick: draw }, 'Keep')]);
    } }, 'Delete lead'));
  };
  draw();
  return box;
}
async function changeStage(id, k, extra) {
  try { applySync(await api('api_changeStage', id, k, extra || {})); toast('Moved to ' + SL[k]); }
  catch (e) { toast(errText(e), 'err'); if (D && D.kind === 'lead') refreshLead(); }
}

/* ---------- unit drawer ---------- */
function openUnit(code) {
  const head = h('div', { class: 'd-head' });
  const status = h('div', { style: 'display:grid;gap:12px' });
  const u0 = code ? unitOf(code) : null;
  const body = h('div', { class: 'd-body' }, status, isMgr() ? unitForm(u0) : null);
  const panel = openDrawer(code ? 'Unit ' + code : 'New unit', head, body);
  D = { kind: 'unit', code: code, panel: panel };
  D.refresh = function () {
    if (!D.code) { put(head, [h('h2', {}, 'New unit'), closeBtn()]); return; }
    const u = unitOf(D.code);
    if (!u) { closeDrawer(); return; }
    put(head, [h('h2', {}, u.code, h('div', { class: 'sub' }, [u.project, u.type].filter(Boolean).join(' · '))), closeBtn()]);
    const facts = h('div', { class: 'facts' },
      [['Status', ustPill(u.status)], ['Price', money(u.price, u.currency) || '—'], ['Area', u.area ? nf.format(u.area) + ' m²' : '—'], ['Floor', u.floor || '—']]
        .map(function (f) { return h('div', { class: 'fact' }, h('span', {}, f[0]), h('b', {}, f[1])); }));
    const parts = [facts];
    if (u.notes) parts.push(h('p', { class: 'meta', style: 'margin:0;white-space:pre-wrap' }, u.notes));
    if (u.status === 'reserved') {
      parts.push(h('div', { class: 'unit-box' },
        h('div', { class: 'row' }, 'Reserved', u.leadName ? [' for ', h('button', { class: 'lead-link', style: 'font-size:14px', onclick: function () { openLead(u.leadId); } }, u.leadName)] : ' for another agent\'s client',
          ' until ', h('b', {}, fmtDay(u.reservedUntil))),
        u.reservedByName ? h('div', { class: 'meta' }, 'By ' + u.reservedByName + (u.reservedAt ? ' on ' + df.format(new Date(u.reservedAt)) : '')) : null,
        (isMgr() || u.mine) ? h('div', { class: 'row' }, h('button', { class: 'btn ghost danger', onclick: function () { releaseUnit(u.code); } }, 'Release reservation')) : null));
    }
    if (u.status === 'sold') {
      parts.push(h('div', { class: 'unit-box' }, h('div', { class: 'row' }, 'Sold', u.leadName ? [' to ', h('button', { class: 'lead-link', style: 'font-size:14px', onclick: function () { openLead(u.leadId); } }, u.leadName)] : '',
        u.soldAt ? ' on ' + df.format(new Date(u.soldAt)) : '')));
    }
    if (u.status === 'available') {
      const mine = LEADS.filter(function (l) { return OPEN(l.stage) && (isMgr() || l.ownerEmail === ME.email); })
        .sort(function (a, b) { const pa = a.project === u.project ? 0 : 1, pb = b.project === u.project ? 0 : 1; return pa - pb || (a.name || '').localeCompare(b.name || ''); });
      if (mine.length) {
        const sel = h('select', { id: 'u-res-lead', 'aria-label': 'Client' }, mine.map(function (l) { return h('option', { value: l.id }, (l.name || l.phone) + (l.project ? ' · ' + l.project : '') + (isMgr() ? ' · ' + nm(l.ownerEmail) : '')); }));
        const days = h('input', { type: 'number', id: 'u-res-days', min: 1, max: 90, value: CFG.reservationDays, style: 'width:80px', 'aria-label': 'Days' });
        parts.push(h('div', { class: 'unit-box' }, h('span', { class: 'lbl', style: 'margin:0' }, 'Reserve for a client'), h('div', { class: 'row' }, sel),
          h('div', { class: 'row' }, h('span', { class: 'meta' }, 'For'), days, h('span', { class: 'meta' }, 'days'),
            h('button', { class: 'btn primary', onclick: function () { reserve(sel.value, u.code, days.value); } }, 'Reserve'))));
      }
    }
    put(status, parts);
  };
  D.refresh();
}
function unitForm(u) {
  const isNew = !u;
  const x = u || { currency: 'EGP', status: 'available' };
  const f = {};
  const inp = function (k, type, ph) { f[k] = h('input', { type: type || 'text', id: 'uf-' + k, value: x[k] || '', placeholder: ph || '', dir: 'auto' }); return f[k]; };
  const projOpts = projectNames(); if (x.project && projOpts.indexOf(x.project) < 0) projOpts.push(x.project);
  f.project = h('select', { id: 'uf-project' }, h('option', { value: '' }, '—'), projOpts.map(function (p) { return h('option', { value: p, selected: x.project === p }, p); }));
  f.currency = h('select', { id: 'uf-currency' }, C.currencies.map(function (c) { return h('option', { value: c, selected: x.currency === c }, c); }));
  f.status = h('select', { id: 'uf-status' }, C.unitStatuses.map(function (s) { return h('option', { value: s[0], selected: x.status === s[0], disabled: s[0] === 'reserved' && x.status !== 'reserved' }, s[1]); }));
  f.notes = h('textarea', { id: 'uf-notes', rows: 2, dir: 'auto', value: x.notes || '' });
  const save = h('button', { class: 'btn primary' }, isNew ? 'Add unit' : 'Save unit');
  save.addEventListener('click', async function () {
    const d = { originalCode: isNew ? '' : u.code, code: f.code.value.trim(), project: f.project.value, type: f.type.value.trim(), floor: f.floor.value.trim(),
      area: f.area.value, price: f.price.value, currency: f.currency.value, status: f.status.value, notes: f.notes.value };
    if (!d.code) { toast('Unit code is required', 'err'); return; }
    if (!isNew && u.status === 'reserved' && d.status !== 'reserved') { if (!confirmStep(save, 'This releases the reservation. Save again to confirm.')) return; }
    save.disabled = true;
    try {
      applySync(await api('api_saveUnit', d));
      toast(isNew ? 'Unit added' : 'Unit saved');
      if (isNew) openUnit(d.code.toUpperCase()); else { D.code = d.code.toUpperCase(); D.refresh(); save.disabled = false; }
    } catch (e) { toast(errText(e), 'err'); save.disabled = false; }
  });
  const del = isAdmin() && !isNew ? h('button', { class: 'btn danger', onclick: async function (e) {
    if (!confirmStep(e.target, 'Click again to delete this unit.')) return;
    try { applySync(await api('api_deleteUnit', u.code)); closeDrawer(); toast('Unit deleted'); } catch (er) { toast(errText(er), 'err'); }
  } }, 'Delete unit') : null;
  return h('div', {}, h('span', { class: 'lbl' }, isNew ? 'Unit details' : 'Edit unit'),
    h('div', { class: 'form' },
      field('Code', 'uf-code', inp('code', 'text', 'e.g. EW-101')), field('Project', 'uf-project', f.project),
      field('Type', 'uf-type', inp('type', 'text', 'Shop, apartment, office…')), field('Floor', 'uf-floor', inp('floor', 'text', 'e.g. GF, 1, 2')),
      field('Area (m²)', 'uf-area', inp('area', 'number')), field('Price', 'uf-price', inp('price', 'number')),
      field('Currency', 'uf-currency', f.currency), field('Status', 'uf-status', f.status),
      field('Notes', 'uf-notes', f.notes, true),
      h('div', { class: 'full acts' }, del, save)));
}
function confirmStep(btn, msg) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; toast(msg);
  setTimeout(function () { delete btn.dataset.armed; }, 5000);
  return false;
}
function openUnitImport() {
  const ta = h('textarea', { id: 'ui-text', rows: 10, placeholder: 'code,project,type,floor,area,price,currency\nEW-101,Eden Walk,Shop,GF,45,3500000,EGP' });
  const info = h('p', { class: 'status', style: 'margin:0' });
  const btn = h('button', { class: 'btn primary', disabled: true }, 'Import units');
  const parse = function () {
    const rows = parseCSV(ta.value); if (rows.length < 2) return [];
    const H = rows[0].map(function (x) { return x.trim().toLowerCase(); });
    const ix = function (keys) { return H.findIndex(function (x) { return keys.indexOf(x) >= 0; }); };
    const ci = { code: ix(['code', 'unit', 'unit code', 'كود', 'الكود']), project: ix(['project', 'المشروع']), type: ix(['type', 'النوع']), floor: ix(['floor', 'الدور']),
      area: ix(['area', 'size', 'm2', 'المساحة']), price: ix(['price', 'السعر']), currency: ix(['currency', 'العملة']), status: ix(['status', 'الحالة']), notes: ix(['notes', 'ملاحظات']) };
    if (ci.code < 0) return [];
    return rows.slice(1).map(function (r) { const o = {}; Object.keys(ci).forEach(function (k) { o[k] = ci[k] >= 0 ? (r[ci[k]] || '').trim() : ''; }); return o; }).filter(function (o) { return o.code; });
  };
  const preview = function () { const n = parse().length; info.textContent = n ? 'Found ' + n + ' units. Existing codes are updated (their status is kept).' : (ta.value.trim() ? 'No "code" column found in the first row.' : ''); btn.disabled = !n; };
  ta.addEventListener('input', preview);
  btn.addEventListener('click', async function () {
    btn.disabled = true; info.textContent = 'Importing…';
    try { const r = await api('api_importUnits', parse()); applySync(r); closeDrawer(); toast('Added ' + r.added + ' units, updated ' + r.updated); }
    catch (e) { info.textContent = errText(e); info.className = 'status err'; btn.disabled = false; }
  });
  openDrawer('Import units', h('div', { class: 'd-head' }, h('h2', {}, 'Import units'), closeBtn()),
    h('div', { class: 'd-body' }, h('p', { class: 'hint', style: 'margin:0' }, 'Paste from Excel or upload a CSV. Columns: code (required), project, type, floor, area, price, currency, status (available / blocked / sold).'),
      readFileInto(ta, preview), ta, info, h('div', { class: 'acts' }, btn)));
  D = { kind: 'import' };
}

/* ---------- refresh ---------- */
let refreshing = false;
async function refresh(manual) {
  if (refreshing) return; refreshing = true;
  try {
    const r = await api('api_sync');
    LEADS = r.leads; TASKS = r.tasks; UNITS = r.units; TODAY = r.today || TODAY;
    if (manual) ACT = null;
    if (!settingsDirty) render();
    refreshDrawer(true);
    if (manual) toast('Up to date');
  } catch (e) { if (manual) toast(errText(e), 'err'); }
  refreshing = false;
}
setInterval(function () { if (document.visibilityState === 'visible' && ME) refresh(false); }, 60000);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ME) refresh(false); });

/* ---------- toolbar ---------- */
$('q').addEventListener('input', function (e) { F.q = e.target.value; render(); });
$('f-owner').addEventListener('change', function (e) { F.owner = e.target.value; render(); });
$('f-source').addEventListener('change', function (e) { F.source = e.target.value; render(); });
$('f-project').addEventListener('change', function (e) { F.project = e.target.value; render(); });
$('f-rating').addEventListener('change', function (e) { F.rating = e.target.value; render(); });
$('add-btn').addEventListener('click', function () { openLead('new'); });
$('refresh-btn').addEventListener('click', function () { refresh(true); });

/* ---------- boot (called by auth.js once signed in) ---------- */
function boot() {
  put($('view'), h('div', { class: 'skeleton' }, 'Loading EDEN CRM…'));
  api('api_bootstrap').then(function (b) {
    ME = b.me; PEOPLE = b.people; PROJECTS = b.projects; LEADS = b.leads; TASKS = b.tasks; UNITS = b.units;
    C = b.consts; ADMIN = b.admin || null; TEMPLATES = b.templates || []; CFG = b.cfg || {};
    TODAY = b.today || localYmd();
    SL = Object.fromEntries(C.stages); SRC = Object.fromEntries(C.sources); RL = Object.fromEntries(C.ratings);
    USL = Object.fromEntries(C.unitStatuses); TTL = Object.fromEntries(C.taskTypes);
    F.owner = isMgr() ? 'all' : 'me';
    INV = null; ACT = null;
    render();
  }).catch(function (e) {
    if (e && e.auth) return;
    put($('view'), h('div', { class: 'err-page' }, h('h2', {}, 'EDEN CRM could not load'), h('p', {}, errText(e)),
      h('button', { class: 'btn primary', onclick: boot }, 'Try again')));
  });
}
window.EdenApp = { boot: boot };
