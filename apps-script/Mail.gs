/**
 * Emails and alerts (MailApp — sent from the script owner's account).
 */
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function mail_(to, subject, inner, note) {
  const list = [].concat(to || []).map(function (e) { return String(e || '').trim().toLowerCase(); })
    .filter(function (e) { return e && e !== 'system'; });
  const uniq = list.filter(function (e, i) { return list.indexOf(e) === i; });
  if (!uniq.length) return;
  if (note) notify_(uniq, note.type, note.text || subject, note.leadId);
  const url = appUrl_();
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18221E;line-height:1.6;max-width:640px">' +
    inner +
    (url ? '<p style="margin-top:18px"><a href="' + esc_(url) + '" style="background:#2B5C4B;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">Open EDEN CRM</a></p>' : '') +
    '<p style="color:#5B6A62;font-size:12px;margin-top:18px">' + APP_NAME + ' · automatic email</p></div>';
  try {
    MailApp.sendEmail({ to: uniq.join(','), subject: subject, htmlBody: html, name: APP_NAME });
  } catch (e) {
    console.error('mail failed', e);
  }
}

function leadLine_(l) {
  return '<b>' + esc_(l.name || 'No name') + '</b> — <span>' + esc_(l.phone || '') + '</span>' +
    (l.project ? ' · ' + esc_(l.project) : '') + (l.unit ? ' · ' + esc_(l.unit) : '');
}

function notifyNewLead_(l) {
  mail_(l.ownerEmail, 'New lead: ' + (l.name || l.phone),
    '<p>A new lead has been assigned to you:</p><p>' + leadLine_(l) + '</p>' +
    '<p>Source: ' + esc_(srcLabel_(l.source)) + (l.campaign ? ' · ' + esc_(l.campaign) : '') + '</p>' +
    (l.note ? '<p style="background:#F3F5F1;padding:8px 12px;border-radius:8px;white-space:pre-wrap">' + esc_(l.note) + '</p>' : '') +
    '<p>Contact them as soon as possible and log it in the CRM.</p>', { type: 'lead', leadId: l.id });
}

function notifyUnassigned_(l) {
  mail_(managers_(), 'New lead with no owner: ' + (l.name || l.phone),
    '<p>A new lead came in and no agent is available for auto-assignment. Assign it in the CRM:</p><p>' + leadLine_(l) + '</p>', { type: 'unassigned', leadId: l.id });
}

function notifyReturningLead_(l, msg) {
  const to = l.ownerEmail ? [l.ownerEmail] : managers_();
  mail_(to, 'Returning client: ' + (l.name || l.phone),
    '<p>' + leadLine_(l) + '</p><p>' + esc_(msg).replace(/\n/g, '<br>') + '</p><p>Current stage: ' + esc_(STAGE_LABEL[l.stage] || '') + '</p>', { type: 'returning', leadId: l.id });
}

function notifyWon_(l, actor) {
  mail_(managers_().filter(function (e) { return e !== actor; }), 'New sale: ' + (l.name || l.phone),
    '<p>' + esc_(displayName_(actor)) + ' closed a sale:</p><p>' + leadLine_(l) + '</p>' +
    (l.dealValue ? '<p>Value: <b>' + esc_(money_(l.dealValue, l.currency)) + '</b></p>' : ''), { type: 'won', leadId: l.id, text: displayName_(actor) + ' closed a sale: ' + (l.name || l.phone) + (l.dealValue ? ' · ' + money_(l.dealValue, l.currency) : '') });
}

function notifyReservation_(u, l, actor) {
  mail_(managers_().filter(function (e) { return e !== actor; }), 'Unit reserved: ' + u.code,
    '<p>' + esc_(displayName_(actor)) + ' reserved unit <b>' + esc_(u.code) + '</b>' + (u.project ? ' (' + esc_(u.project) + ')' : '') +
    ' until ' + esc_(u.reservedUntil) + '.</p><p>Client: ' + leadLine_(l) + '</p>' +
    (u.price ? '<p>List price: ' + esc_(money_(u.price, u.currency)) + '</p>' : ''), { type: 'unit', leadId: l.id, text: displayName_(actor) + ' reserved ' + u.code + ' for ' + (l.name || l.phone) });
}

function notifyTask_(t, l, actor) {
  mail_(t.ownerEmail, 'New task: ' + t.title,
    '<p>' + esc_(displayName_(actor)) + ' assigned you a task:</p>' +
    '<p><b>' + esc_(TASK_LABEL[t.type] || 'Task') + '</b> — ' + esc_(t.title) + '<br>Due: ' + esc_(fmtDateTime_(t.dueAt)) + '</p>' +
    '<p>' + leadLine_(l) + '</p>' + (t.notes ? '<p>' + esc_(t.notes) + '</p>' : ''), { type: 'task', leadId: l.id, text: displayName_(actor) + ' assigned you: ' + t.title + ' · ' + fmtDateTime_(t.dueAt) });
}
