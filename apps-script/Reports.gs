/**
 * Activity report: what each agent did between two dates (Cairo time).
 */
function activityReport_(from, to, viewer) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Pick a valid date range.');
  if (from > to) { const x = from; from = to; to = x; }
  const only = viewer && !isManager_(viewer) ? viewer.email : null;
  const inRange = function (ymd) { return ymd && ymd >= from && ymd <= to; };
  const by = {}, days = {};
  const row = function (e) {
    if (!by[e]) by[e] = { email: e, name: displayName_(e), newLeads: 0, call: 0, whatsapp: 0, visit: 0, meeting: 0, note: 0, stage: 0, tasksDone: 0, won: 0, wonValue: {}, resp: [] };
    return by[e];
  };
  rows_('Activities').forEach(function (a) {
    if (!a.by || a.by === 'system') return;
    if (only && a.by !== only) return;
    if (['call', 'whatsapp', 'visit', 'meeting', 'note', 'stage'].indexOf(a.type) < 0) return;
    const d = ymdOf_(a.at);
    if (!inRange(d)) return;
    row(a.by)[a.type]++;
    if (CONTACT_TYPES.indexOf(a.type) >= 0) {
      if (!days[d]) days[d] = { date: d, call: 0, whatsapp: 0, visit: 0, meeting: 0 };
      days[d][a.type]++;
    }
  });
  rows_('Tasks').forEach(function (t) {
    if (t.status !== 'done' || (only && t.ownerEmail !== only)) return;
    if (inRange(ymdOf_(t.doneAt))) row(t.ownerEmail).tasksDone++;
  });
  rows_('Leads').forEach(function (l) {
    const o = String(l.ownerEmail || '').toLowerCase();
    if (!o || (only && o !== only)) return;
    if (inRange(ymdOf_(l.assignedAt))) row(o).newLeads++;
    if (l.stage === 'won' && inRange(ymdOf_(l.stageAt))) {
      const r = row(o);
      r.won++;
      if (Number(l.dealValue)) { const c = l.currency || 'EGP'; r.wonValue[c] = (r.wonValue[c] || 0) + Number(l.dealValue); }
    }
    if (l.firstContactAt && l.assignedAt && inRange(ymdOf_(l.firstContactAt))) {
      const hrs = (Date.parse(l.firstContactAt) - Date.parse(l.assignedAt)) / 36e5;
      if (hrs >= 0) row(o).resp.push(hrs);
    }
  });
  const rows = Object.keys(by).map(function (k) {
    const r = by[k];
    r.avgFirstResponseHrs = r.resp.length ? r.resp.reduce(function (a, b) { return a + b; }, 0) / r.resp.length : null;
    delete r.resp;
    r.contacts = r.call + r.whatsapp + r.visit + r.meeting;
    return r;
  }).sort(function (a, b) { return b.contacts - a.contacts || b.won - a.won; });
  return { from: from, to: to, rows: rows, days: Object.keys(days).sort().map(function (k) { return days[k]; }) };
}

function activityTableHtml_(rep) {
  if (!rep.rows.length) return '<p style="color:#5B6A62">No logged activity.</p>';
  const th = 'style="text-align:left;padding:6px 8px;background:#F3F5F1"';
  const td = 'style="padding:6px 8px;border-top:1px solid #E1E6DE"';
  return '<table style="border-collapse:collapse;font-size:13px"><tr>' +
    ['Agent', 'New leads', 'Calls', 'WhatsApp', 'Visits', 'Meetings', 'Tasks done', 'Won'].map(function (h) { return '<th ' + th + '>' + h + '</th>'; }).join('') + '</tr>' +
    rep.rows.map(function (r) {
      return '<tr><td ' + td + '>' + esc_(r.name) + '</td>' +
        [r.newLeads, r.call, r.whatsapp, r.visit, r.meeting, r.tasksDone, r.won].map(function (v) { return '<td ' + td + ' align="center">' + v + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table>';
}
