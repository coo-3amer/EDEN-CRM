/**
 * Lead logic: create, assign, stages, activity.
 * Internal only — the browser talks to Api.gs.
 */

function leadById_(id) {
  return rows_('Leads').find(function (l) { return l.id === id; }) || null;
}

function leadMap_() {
  const m = {};
  rows_('Leads').forEach(function (l) { m[l.id] = l; });
  return m;
}

function activitiesFor_(leadId) {
  return rows_('Activities').filter(function (a) { return a.leadId === leadId; })
    .map(clean_)
    .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
}

function logAct_(leadId, by, type, text, fromVal, toVal) {
  return insert_('Activities', {
    id: uid_(), leadId: leadId, at: nowIso_(), by: by || 'system', type: type,
    text: text || '', fromVal: fromVal || '', toVal: toVal || '',
  });
}

/**
 * Auto-assignment: the active agent who receives leads and has the fewest open leads.
 * Tie-break: whoever received a lead longest ago.
 */
function nextAssignee_(exclude) {
  exclude = (exclude || []).map(function (e) { return String(e || '').toLowerCase(); });
  const pool = activeUsers_().filter(function (u) {
    return truthy_(u.receivesLeads) && exclude.indexOf(u.email) < 0;
  });
  if (!pool.length) return '';
  const leads = rows_('Leads');
  let best = null;
  pool.forEach(function (u) {
    const mine = leads.filter(function (l) { return String(l.ownerEmail).toLowerCase() === u.email; });
    const open = mine.filter(function (l) { return isOpen_(l.stage); }).length;
    const last = mine.reduce(function (m, l) { return l.assignedAt > m ? l.assignedAt : m; }, '');
    if (!best || open < best.open || (open === best.open && last < best.last)) best = { email: u.email, open: open, last: last };
  });
  return best.email;
}

/**
 * Create a lead.
 * opts.system = true → from Meta / website / import: a duplicate is logged on the existing lead and its owner is told.
 * opts.force  = true → add even if the phone number already exists.
 * Returns {lead} or {duplicate} or {skipped}
 */
function createLead_(d, actor, opts) {
  opts = opts || {};
  const all = rows_('Leads');
  if (d.externalId && all.some(function (l) { return l.externalId === d.externalId; })) return { skipped: true };

  const key = phoneKey_(d.phone);
  const dup = key ? all.find(function (l) { return l.phoneKey === key; }) : null;
  if (dup && !opts.force) {
    if (opts.system) {
      const msg = 'Client came back via ' + srcLabel_(d.source) + (d.campaign ? ' · ' + d.campaign : '') +
        (d.project && d.project !== dup.project ? ' · interested in ' + d.project : '') + (d.note ? '\n' + d.note : '');
      logAct_(dup.id, 'system', 'system', msg);
      const patch = { updatedAt: nowIso_() };
      if (isOpen_(dup.stage)) patch.nextFollowUp = today_();
      const updated = update_('Leads', dup, patch);
      notifyReturningLead_(updated, msg);
    }
    return { duplicate: dup };
  }

  const now = nowIso_();
  let owner = String(d.ownerEmail || '').toLowerCase();
  if (!owner || owner === 'auto') owner = nextAssignee_([]);
  if (!owner && actor && actor !== 'system') owner = actor;

  const lead = {
    id: uid_(), createdAt: now, updatedAt: now,
    name: String(d.name || '').trim(), phone: String(d.phone || '').trim(), phoneKey: key,
    email: String(d.email || '').trim(), source: d.source || 'manual', campaign: d.campaign || '',
    project: d.project || '', unit: d.unit || '', budget: d.budget || '',
    stage: 'new', ownerEmail: owner, assignedAt: owner ? now : '',
    nextFollowUp: d.nextFollowUp || today_(), firstContactAt: '', lastContactAt: '', stageAt: now,
    dealValue: '', currency: '', lostReason: '', note: d.note || '', createdBy: actor || 'system',
    slaAlertedAt: '', reassignCount: '0', externalId: d.externalId || '',
    rating: RATING_LABEL[d.rating] ? d.rating : '', tags: tagsNorm_(d.tags),
  };
  const saved = insert_('Leads', lead);
  logAct_(lead.id, actor || 'system', 'created',
    (d.note ? d.note : '') + (opts.system ? (d.note ? '\n' : '') + 'Source: ' + srcLabel_(lead.source) + (lead.campaign ? ' · ' + lead.campaign : '') : ''));
  if (owner && owner !== actor) {
    logAct_(lead.id, actor || 'system', 'assign', '', '', owner);
    notifyNewLead_(saved);
  }
  if (!owner) notifyUnassigned_(saved);
  return { lead: saved };
}

const EDITABLE_FIELDS_ = ['name', 'phone', 'email', 'source', 'campaign', 'project', 'unit', 'budget', 'nextFollowUp', 'note', 'rating', 'tags'];

function updateLeadFields_(lead, d, actor, canReassign) {
  const patch = { updatedAt: nowIso_() };
  EDITABLE_FIELDS_.forEach(function (f) { if (d[f] !== undefined) patch[f] = String(d[f] == null ? '' : d[f]).trim(); });
  if (patch.phone !== undefined) patch.phoneKey = phoneKey_(patch.phone);
  if (patch.rating !== undefined && !RATING_LABEL[patch.rating]) patch.rating = '';
  if (patch.tags !== undefined) patch.tags = tagsNorm_(patch.tags);
  let reassignedTo = null;
  if (canReassign && d.ownerEmail !== undefined) {
    let to = String(d.ownerEmail || '').toLowerCase();
    if (to === 'auto') to = nextAssignee_([lead.ownerEmail]);
    if (to !== String(lead.ownerEmail || '').toLowerCase()) {
      patch.ownerEmail = to; patch.assignedAt = to ? nowIso_() : ''; patch.slaAlertedAt = '';
      reassignedTo = to;
    }
  }
  if (patch.rating !== undefined && patch.rating !== (lead.rating || '')) {
    logAct_(lead.id, actor, 'system', 'Rating: ' + (RATING_LABEL[patch.rating] || 'none'));
  }
  const updated = update_('Leads', lead, patch);
  if (reassignedTo !== null) {
    logAct_(lead.id, actor, 'assign', '', lead.ownerEmail, reassignedTo);
    // open tasks follow the lead to its new owner
    rows_('Tasks').filter(function (t) { return t.leadId === lead.id && t.status === 'open' && t.ownerEmail === lead.ownerEmail; })
      .forEach(function (t) { reassignTask_(t, reassignedTo, updated); });
    if (reassignedTo && reassignedTo !== actor) notifyNewLead_(updated);
  }
  return updated;
}

function changeStage_(lead, stage, extra, actor) {
  if (!STAGE_LABEL[stage]) throw new Error('Unknown stage.');
  extra = extra || {};
  const now = nowIso_();
  const patch = { stage: stage, stageAt: now, updatedAt: now };
  let unit = null;
  if (stage === 'won') {
    const code = String(extra.unit || lead.unit || '').trim();
    unit = code ? unitByCode_(code) : null;
    if (unit) assertUnitSellable_(unit, lead.id);
    if (code) patch.unit = unit ? unit.code : code;
    if (unit && unit.project) patch.project = unit.project;
    patch.dealValue = extra.dealValue != null && extra.dealValue !== '' ? String(Number(extra.dealValue) || '') :
      (lead.dealValue || (unit && unit.price) || '');
    patch.currency = extra.currency || lead.currency || (unit && unit.currency) || 'EGP';
    patch.lostReason = '';
  }
  if (stage === 'lost') patch.lostReason = extra.lostReason || lead.lostReason || '';
  if (!isOpen_(stage)) patch.nextFollowUp = '';
  if (stage !== 'new' && !lead.firstContactAt) patch.firstContactAt = now;
  const updated = update_('Leads', lead, patch);
  let text = '';
  if (stage === 'won') text = [patch.dealValue ? 'Deal value ' + money_(patch.dealValue, patch.currency) : '', patch.unit ? 'Unit ' + patch.unit : ''].filter(String).join(' · ');
  if (stage === 'lost') text = patch.lostReason ? 'Reason: ' + patch.lostReason : '';
  if (extra.note) text = (text ? text + '\n' : '') + extra.note;
  logAct_(lead.id, actor, 'stage', text, lead.stage || 'new', stage);
  if (stage === 'won' && unit) sellUnit_(unit, updated, actor);
  if (stage === 'lost') {
    releaseUnitsForLead_(lead.id, actor, 'lead marked lost');
    cancelOpenTasksForLead_(lead.id, actor);
  }
  if (stage === 'won') {
    cancelOpenTasksForLead_(lead.id, actor, ['call', 'whatsapp', 'todo']);
    notifyWon_(updated, actor);
  }
  return updated;
}

function addActivity_(lead, a, actor) {
  const type = ['call', 'whatsapp', 'visit', 'meeting', 'note'].indexOf(a.type) >= 0 ? a.type : 'note';
  const text = String(a.text || '').trim();
  if (type === 'note' && !text && !a.nextFollowUp) throw new Error('Write what happened or pick the next follow-up date.');
  const now = nowIso_();
  if (text || type !== 'note') logAct_(lead.id, actor, type, text);
  const patch = { updatedAt: now };
  if (a.nextFollowUp) patch.nextFollowUp = a.nextFollowUp;
  let updated = update_('Leads', lead, patch);
  if (CONTACT_TYPES.indexOf(type) >= 0) {
    const p2 = { lastContactAt: now };
    if (!lead.firstContactAt) p2.firstContactAt = now;
    updated = update_('Leads', updated, p2);
    if ((lead.stage || 'new') === 'new') updated = changeStage_(updated, type === 'visit' ? 'visit' : 'contacted', {}, actor);
  }
  return updated;
}

/** Fields sent to the browser */
function publicLead_(l) {
  const c = clean_(l);
  delete c.phoneKey; delete c.slaAlertedAt;
  c.ownerName = displayName_(c.ownerEmail);
  return c;
}
