/**
 * Tasks: calls, WhatsApp, site visits, meetings and to-dos with a date and time.
 * Site visits and meetings go on the shared "EDEN CRM — Visits & Meetings" calendar,
 * with the agent invited, so they show up in the agent's own Google Calendar.
 */
function taskById_(id) {
  return rows_('Tasks').find(function (t) { return t.id === id; }) || null;
}

function publicTasks_(viewer) {
  const cutoff = addDays_(today_(), -14);
  const lm = leadMap_();
  return rows_('Tasks').filter(function (t) {
    if (!(isManager_(viewer) || t.ownerEmail === viewer.email)) return false;
    return t.status === 'open' || (t.status === 'done' && ymdOf_(t.doneAt) >= cutoff);
  }).map(function (t) {
    const c = clean_(t);
    const l = lm[t.leadId];
    c.leadName = l ? (l.name || l.phone) : '';
    c.ownerName = displayName_(t.ownerEmail);
    c.onCalendar = !!t.calendarEventId;
    delete c.calendarEventId; delete c.remindedAt;
    return c;
  });
}

function parseDue_(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) throw new Error('Pick a date and time for the task.');
  return d;
}

function createTask_(lead, d, actor, mgr) {
  const type = TASK_LABEL[d.type] ? d.type : 'todo';
  const due = parseDue_(d.dueAt);
  const owner = String(mgr ? (d.ownerEmail || lead.ownerEmail || actor) : actor).toLowerCase();
  const title = String(d.title || '').trim() || (TASK_LABEL[type] + ' — ' + (lead.name || lead.phone));
  let t = insert_('Tasks', {
    id: uid_(), leadId: lead.id, title: title, type: type, dueAt: due.toISOString(), ownerEmail: owner,
    status: 'open', createdAt: nowIso_(), createdBy: actor, doneAt: '', remindedAt: '', calendarEventId: '', notes: d.notes || '',
  });
  const ev = syncTaskEvent_(t, lead, '');
  if (ev) t = update_('Tasks', t, { calendarEventId: ev });
  const ymd = ymdOf_(t.dueAt);
  const fresh = leadById_(lead.id);
  if (isOpen_(fresh.stage) && (!fresh.nextFollowUp || ymd < fresh.nextFollowUp || fresh.nextFollowUp < today_())) {
    update_('Leads', fresh, { nextFollowUp: ymd, updatedAt: nowIso_() });
  }
  logAct_(lead.id, actor, 'task', 'Scheduled: ' + title + ' — ' + fmtDateTime_(due) + (owner !== actor ? ' (for ' + displayName_(owner) + ')' : ''));
  if (owner !== actor) notifyTask_(t, lead, actor);
  return t;
}

function updateTask_(t, d, actor, mgr) {
  const lead = leadById_(t.leadId);
  const patch = {};
  if (d.title !== undefined && String(d.title).trim()) patch.title = String(d.title).trim();
  if (d.notes !== undefined) patch.notes = String(d.notes || '');
  if (d.type !== undefined && TASK_LABEL[d.type]) patch.type = d.type;
  let moved = false;
  if (d.dueAt !== undefined) {
    const iso = parseDue_(d.dueAt).toISOString();
    if (iso !== t.dueAt) { patch.dueAt = iso; patch.remindedAt = ''; moved = true; }
  }
  const prevOwner = t.ownerEmail;
  if (mgr && d.ownerEmail && d.ownerEmail.toLowerCase() !== t.ownerEmail) patch.ownerEmail = d.ownerEmail.toLowerCase();
  let saved = update_('Tasks', t, patch);
  if (lead) {
    const ev = syncTaskEvent_(saved, lead, prevOwner);
    if (ev !== saved.calendarEventId) saved = update_('Tasks', saved, { calendarEventId: ev });
    if (moved) logAct_(lead.id, actor, 'task', 'Rescheduled: ' + saved.title + ' — ' + fmtDateTime_(saved.dueAt));
    if (patch.ownerEmail && patch.ownerEmail !== actor) notifyTask_(saved, lead, actor);
  }
  return saved;
}

function reassignTask_(t, to, lead) {
  const prev = t.ownerEmail;
  let saved = update_('Tasks', t, { ownerEmail: to || prev });
  if (to) {
    const ev = syncTaskEvent_(saved, lead, prev);
    if (ev !== saved.calendarEventId) saved = update_('Tasks', saved, { calendarEventId: ev });
  }
  return saved;
}

function completeTask_(t, outcome, actor) {
  if (t.status !== 'open') return t;
  const done = update_('Tasks', t, { status: 'done', doneAt: nowIso_() });
  const lead = leadById_(t.leadId);
  if (lead) {
    const text = String(outcome || '').trim();
    if (CONTACT_TYPES.indexOf(t.type) >= 0) addActivity_(lead, { type: t.type, text: text || t.title }, actor);
    else logAct_(lead.id, actor, 'task', 'Done: ' + t.title + (text ? '\n' + text : ''));
  }
  return done;
}

function cancelTask_(t, actor, quiet) {
  if (t.status !== 'open') return t;
  deleteTaskEvent_(t);
  const r = update_('Tasks', t, { status: 'cancelled', doneAt: nowIso_(), calendarEventId: '' });
  if (!quiet) logAct_(t.leadId, actor, 'task', 'Cancelled: ' + t.title);
  return r;
}

function cancelOpenTasksForLead_(leadId, actor, onlyTypes) {
  rows_('Tasks').filter(function (t) {
    return t.leadId === leadId && t.status === 'open' && (!onlyTypes || onlyTypes.indexOf(t.type) >= 0);
  }).forEach(function (t) { cancelTask_(t, actor, true); });
}

/* ---------- Google Calendar ---------- */
function calendarOn_() { return truthy_(settings_().CALENDAR_SYNC); }

function calendar_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CALENDAR_ID');
  let cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar('EDEN CRM — Visits & Meetings', { timeZone: TZ, color: CalendarApp.Color.TEAL });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  return cal;
}

function syncTaskEvent_(t, lead, prevOwner) {
  if (!calendarOn_() || ['visit', 'meeting'].indexOf(t.type) < 0 || t.status !== 'open') return t.calendarEventId || '';
  try {
    const cal = calendar_();
    const start = new Date(t.dueAt);
    const end = new Date(start.getTime() + (Number(settings_().VISIT_DURATION_MIN) || 60) * 60000);
    const title = TASK_LABEL[t.type] + ': ' + (lead.name || lead.phone) + (lead.project ? ' · ' + lead.project : '');
    const desc = ['Client: ' + (lead.name || ''), 'Phone: ' + (lead.phone || ''), lead.unit ? 'Unit: ' + lead.unit : '',
      'Agent: ' + displayName_(t.ownerEmail), t.notes || '', appUrl_()].filter(String).join('\n');
    let ev = t.calendarEventId ? cal.getEventById(t.calendarEventId) : null;
    if (ev) {
      ev.setTime(start, end);
      ev.setTitle(title);
      ev.setDescription(desc);
      if (prevOwner && prevOwner !== t.ownerEmail) {
        try { ev.removeGuest(prevOwner); } catch (e) { /* ignore */ }
        ev.addGuest(t.ownerEmail);
      }
      return ev.getId();
    }
    ev = cal.createEvent(title, start, end, { description: desc, location: lead.project || '', guests: t.ownerEmail, sendInvites: true });
    return ev.getId();
  } catch (e) {
    console.error('calendar sync failed', e);
    return t.calendarEventId || '';
  }
}

function deleteTaskEvent_(t) {
  if (!t.calendarEventId) return;
  try {
    const ev = calendar_().getEventById(t.calendarEventId);
    if (ev) ev.deleteEvent();
  } catch (e) { console.error('calendar delete failed', e); }
}

/** Email the agent shortly before a task is due */
function remindTasks_() {
  const mins = Number(settings_().TASK_REMINDER_MIN) || 0;
  if (!mins) return;
  const now = Date.now();
  rows_('Tasks').filter(function (t) { return t.status === 'open' && !t.remindedAt; }).forEach(function (t) {
    const due = Date.parse(t.dueAt);
    if (isNaN(due)) return;
    const left = due - now;
    if (left > mins * 60000 || left < -30 * 60000) return;
    update_('Tasks', t, { remindedAt: nowIso_() });
    const lead = leadById_(t.leadId);
    mail_(t.ownerEmail, 'Reminder: ' + t.title + ' at ' + Utilities.formatDate(new Date(due), TZ, 'HH:mm'),
      '<p><b>' + esc_(TASK_LABEL[t.type] || 'Task') + '</b> — ' + esc_(t.title) + '</p>' +
      '<p>Due: ' + esc_(fmtDateTime_(new Date(due))) + '</p>' + (lead ? '<p>' + leadLine_(lead) + '</p>' : '') +
      (t.notes ? '<p>' + esc_(t.notes) + '</p>' : ''), { type: 'reminder', leadId: t.leadId, text: 'Soon: ' + t.title + ' at ' + Utilities.formatDate(new Date(due), TZ, 'HH:mm') });
  });
}
