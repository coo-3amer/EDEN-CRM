/**
 * Automations (time-driven triggers):
 * runAutomations — every 10 minutes: website inbox, Meta leads, first-contact alerts,
 *                  auto-reassign, task reminders, expired reservations
 * morningDigest  — every morning: each agent's day by email, plus a summary for managers
 */
function runAutomations() {
  const props = PropertiesService.getScriptProperties();
  const errors = [];
  withLock_(function () {
    try { processInbox_(); } catch (e) { errors.push('Website inbox: ' + e.message); }
    try { syncMetaLeads_(); } catch (e) { errors.push(e.message); }
    try { checkSla_(); } catch (e) { errors.push('First-contact check: ' + e.message); }
    try { remindTasks_(); } catch (e) { errors.push('Task reminders: ' + e.message); }
    try { expireReservations_(); } catch (e) { errors.push('Reservations: ' + e.message); }
    try { pruneNotifications_(); } catch (e) { errors.push('Notifications: ' + e.message); }
  });
  props.setProperty('LAST_AUTOMATION_RUN', nowIso_());
  props.setProperty('LAST_AUTOMATION_ERROR', errors.join(' | '));
  if (errors.length) console.error(errors.join('\n'));
}

/** New lead with no logged contact: alert after SLA hours, move to another agent after AUTO_REASSIGN hours */
function checkSla_() {
  const s = settings_();
  const sla = Number(s.SLA_FIRST_CONTACT_HOURS) || 0;
  const re = Number(s.AUTO_REASSIGN_HOURS) || 0;
  const maxRe = Number(s.MAX_REASSIGNS || 2);
  const stale = rows_('Leads').filter(function (l) {
    return (l.stage || 'new') === 'new' && !l.firstContactAt && l.ownerEmail && l.assignedAt;
  });
  const forManagers = [];
  stale.forEach(function (l) {
    const age = hoursSince_(l.assignedAt);
    if (re && age >= re && Number(l.reassignCount || 0) < maxRe) {
      const to = nextAssignee_([l.ownerEmail]);
      if (to) {
        const from = l.ownerEmail;
        const updated = update_('Leads', leadById_(l.id), {
          ownerEmail: to, assignedAt: nowIso_(), slaAlertedAt: '', updatedAt: nowIso_(),
          reassignCount: String(Number(l.reassignCount || 0) + 1),
        });
        logAct_(l.id, 'system', 'assign', 'Moved automatically: no contact logged within ' + re + ' hours', from, to);
        rows_('Tasks').filter(function (t) { return t.leadId === l.id && t.status === 'open' && t.ownerEmail === from; })
          .forEach(function (t) { reassignTask_(t, to, updated); });
        notifyNewLead_(updated);
        mail_(from, 'Lead moved away from you: ' + (l.name || l.phone),
          '<p>This lead was moved to a colleague because no contact was logged within ' + re + ' hours:</p><p>' + leadLine_(l) + '</p>', { type: 'moved', leadId: l.id });
        forManagers.push({ l: updated, note: 'moved from ' + displayName_(from) + ' to ' + displayName_(to) });
        return;
      }
    }
    if (sla && age >= sla && !l.slaAlertedAt) {
      update_('Leads', leadById_(l.id), { slaAlertedAt: nowIso_() });
      mail_(l.ownerEmail, 'Lead waiting for your call: ' + (l.name || l.phone),
        '<p>This lead has been waiting more than ' + sla + ' hours with no logged contact:</p><p>' + leadLine_(l) + '</p>' +
        (re ? '<p>If there is still no contact ' + re + ' hours after assignment, it will move to a colleague.</p>' : ''), { type: 'sla', leadId: l.id });
      forManagers.push({ l: l, note: 'with ' + displayName_(l.ownerEmail) + ' for ' + Math.floor(age) + ' hours' });
    }
  });
  if (forManagers.length) {
    mail_(managers_(), forManagers.length + ' new lead(s) not contacted in time',
      '<p>These leads passed the first-contact time with no logged contact:</p><ul>' +
      forManagers.map(function (x) { return '<li>' + leadLine_(x.l) + ' — ' + esc_(x.note) + '</li>'; }).join('') + '</ul>');
  }
}

/** Morning digest */
function morningDigest() {
  const today = today_();
  const leads = rows_('Leads').filter(function (l) { return isOpen_(l.stage); });
  const lm = leadMap_();
  const openTasks = rows_('Tasks').filter(function (t) { return t.status === 'open'; });
  const users = activeUsers_();
  const leadList = function (arr) {
    return '<ul>' + arr.slice(0, 40).map(function (l) {
      return '<li>' + leadLine_(l) + ' · <span style="color:#5B6A62">' + esc_(STAGE_LABEL[l.stage] || '') +
        (l.nextFollowUp && l.nextFollowUp < today ? ' · overdue since ' + esc_(l.nextFollowUp) : '') + '</span></li>';
    }).join('') + (arr.length > 40 ? '<li>and ' + (arr.length - 40) + ' more…</li>' : '') + '</ul>';
  };
  const taskList = function (arr) {
    return '<ul>' + arr.slice(0, 40).map(function (t) {
      const l = lm[t.leadId];
      return '<li><b>' + esc_(Utilities.formatDate(new Date(t.dueAt), TZ, ymdOf_(t.dueAt) === today ? 'HH:mm' : 'd MMM HH:mm')) + '</b> ' +
        esc_(TASK_LABEL[t.type] || '') + ' — ' + esc_(t.title) + (l ? ' · ' + esc_(l.phone || '') : '') + '</li>';
    }).join('') + '</ul>';
  };
  const summary = [];
  users.forEach(function (u) {
    const mine = leads.filter(function (l) { return String(l.ownerEmail).toLowerCase() === u.email; });
    const tasks = openTasks.filter(function (t) { return t.ownerEmail === u.email; }).sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : 1; });
    const tLate = tasks.filter(function (t) { return ymdOf_(t.dueAt) < today; });
    const tToday = tasks.filter(function (t) { return ymdOf_(t.dueAt) === today; });
    const late = mine.filter(function (l) { return l.nextFollowUp && l.nextFollowUp < today; });
    const tod = mine.filter(function (l) { return l.nextFollowUp === today; });
    const fresh = mine.filter(function (l) { return (l.stage || 'new') === 'new' && !l.firstContactAt; });
    if (mine.length || tasks.length) summary.push({ u: u, open: mine.length, late: late.length + tLate.length, tod: tod.length + tToday.length, fresh: fresh.length });
    if (!late.length && !tod.length && !fresh.length && !tLate.length && !tToday.length) return;
    let html = '<p>Good morning ' + esc_(u.name || '') + ', here is your day:</p>';
    if (tToday.length) html += '<h3 style="margin-bottom:4px">Today\'s tasks (' + tToday.length + ')</h3>' + taskList(tToday);
    if (tLate.length) html += '<h3 style="color:#B0412D;margin-bottom:4px">Overdue tasks (' + tLate.length + ')</h3>' + taskList(tLate);
    if (fresh.length) html += '<h3 style="margin-bottom:4px">New leads not contacted yet (' + fresh.length + ')</h3>' + leadList(fresh);
    if (late.length) html += '<h3 style="color:#B0412D;margin-bottom:4px">Overdue follow-ups (' + late.length + ')</h3>' + leadList(late);
    if (tod.length) html += '<h3 style="margin-bottom:4px">Follow-ups today (' + tod.length + ')</h3>' + leadList(tod);
    mail_(u.email, 'Your day: ' + (tToday.length + tod.length) + ' due today' + (late.length + tLate.length ? ', ' + (late.length + tLate.length) + ' overdue' : ''), html);
  });

  // Managers' summary
  const y = addDays_(today, -1);
  const all = rows_('Leads');
  const newY = all.filter(function (l) { return ymdOf_(l.createdAt) === y; }).length;
  const wonY = all.filter(function (l) { return l.stage === 'won' && ymdOf_(l.stageAt) === y; });
  const unassigned = leads.filter(function (l) { return !l.ownerEmail; }).length;
  const units = rows_('Units');
  const reserved = units.filter(function (x) { return x.status === 'reserved'; });
  const expiring = reserved.filter(function (x) { return x.reservedUntil && x.reservedUntil <= addDays_(today, 2); });
  let html = '<p>Yesterday (' + y + '): <b>' + newY + '</b> new leads, <b>' + wonY.length + '</b> sales.</p>';
  if (unassigned) html += '<p style="color:#B0412D">' + unassigned + ' open lead(s) have no owner.</p>';
  if (units.length) html += '<p>Inventory: ' + units.filter(function (x) { return x.status === 'available'; }).length + ' available, ' +
    reserved.length + ' reserved' + (expiring.length ? ' (' + expiring.length + ' expiring within 2 days)' : '') + ', ' +
    units.filter(function (x) { return x.status === 'sold'; }).length + ' sold.</p>';
  html += '<h3 style="margin-bottom:4px">Team today</h3><table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#F3F5F1"><th align="left">Agent</th><th>Open leads</th><th>Overdue</th><th>Due today</th><th>New, not contacted</th></tr>' +
    summary.sort(function (a, b) { return b.late - a.late; }).map(function (r) {
      return '<tr><td>' + esc_(r.u.name || r.u.email) + '</td><td align="center">' + r.open + '</td><td align="center" style="' + (r.late ? 'color:#B0412D;font-weight:bold' : '') + '">' + r.late + '</td><td align="center">' + r.tod + '</td><td align="center">' + r.fresh + '</td></tr>';
    }).join('') + '</table>';
  html += '<h3 style="margin-bottom:4px">Yesterday\'s activity</h3>' + activityTableHtml_(activityReport_(y, y, null));
  mail_(managers_(), 'Sales summary — ' + today, html);
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runAutomations', 'morningDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAutomations').timeBased().everyMinutes(10).create();
  const h = Math.min(23, Math.max(0, Number(settings_().DIGEST_HOUR) || 9));
  ScriptApp.newTrigger('morningDigest').timeBased().atHour(h).everyDays(1).inTimezone(TZ).create();
}
