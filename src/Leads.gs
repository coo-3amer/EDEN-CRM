/**
 * منطق الليدز: إضافة، توزيع، مراحل، نشاط.
 * كل الدوال هنا داخلية (مش متاحة للمتصفح) — المتصفح بيكلم Api.gs بس.
 */

function leadById_(id) {
  return rows_('Leads').find(function (l) { return l.id === id; }) || null;
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
 * التوزيع التلقائي: السيلز النشط اللي بيستقبل ليدز وعنده أقل عدد ليدز مفتوحة.
 * عند التعادل: اللي استلم آخر ليد من بدري.
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
 * إضافة ليد.
 * opts.system = true  → جاي من Meta/الموقع/الاستيراد: لو مكرر بنسجّل على الليد القديم وننبّه صاحبه.
 * opts.force  = true  → أضيفه حتى لو الرقم مكرر.
 * بيرجّع {lead} أو {duplicate} أو {skipped}
 */
function createLead_(d, actor, opts) {
  opts = opts || {};
  const all = rows_('Leads');
  if (d.externalId && all.some(function (l) { return l.externalId === d.externalId; })) return { skipped: true };

  const key = phoneKey_(d.phone);
  const dup = key ? all.find(function (l) { return l.phoneKey === key; }) : null;
  if (dup && !opts.force) {
    if (opts.system) {
      const msg = 'العميل رجع تاني من ' + srcLabel_(d.source) + (d.campaign ? ' · ' + d.campaign : '') +
        (d.project && d.project !== dup.project ? ' · مهتم بـ ' + d.project : '') + (d.note ? '\n' + d.note : '');
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
  };
  const saved = insert_('Leads', lead);
  logAct_(lead.id, actor || 'system', 'created',
    (d.note ? d.note : '') + (opts.system ? (d.note ? '\n' : '') + 'المصدر: ' + srcLabel_(lead.source) + (lead.campaign ? ' · ' + lead.campaign : '') : ''));
  if (owner && owner !== actor) {
    logAct_(lead.id, actor || 'system', 'assign', '', '', owner);
    notifyNewLead_(saved);
  }
  if (!owner) notifyUnassigned_(saved);
  return { lead: saved };
}

const EDITABLE_FIELDS_ = ['name', 'phone', 'email', 'source', 'campaign', 'project', 'unit', 'budget', 'nextFollowUp', 'note'];

function updateLeadFields_(lead, d, actor, canReassign) {
  const patch = { updatedAt: nowIso_() };
  EDITABLE_FIELDS_.forEach(function (f) { if (d[f] !== undefined) patch[f] = String(d[f] == null ? '' : d[f]).trim(); });
  if (patch.phone !== undefined) patch.phoneKey = phoneKey_(patch.phone);
  let reassignedTo = null;
  if (canReassign && d.ownerEmail !== undefined) {
    let to = String(d.ownerEmail || '').toLowerCase();
    if (to === 'auto') to = nextAssignee_([lead.ownerEmail]);
    if (to !== String(lead.ownerEmail || '').toLowerCase()) {
      patch.ownerEmail = to; patch.assignedAt = to ? nowIso_() : ''; patch.slaAlertedAt = '';
      reassignedTo = to;
    }
  }
  const updated = update_('Leads', lead, patch);
  if (reassignedTo !== null) {
    logAct_(lead.id, actor, 'assign', '', lead.ownerEmail, reassignedTo);
    if (reassignedTo && reassignedTo !== actor) notifyNewLead_(updated);
  }
  return updated;
}

function changeStage_(lead, stage, extra, actor) {
  if (!STAGE_LABEL[stage]) throw new Error('مرحلة مش معروفة');
  extra = extra || {};
  const now = nowIso_();
  const patch = { stage: stage, stageAt: now, updatedAt: now };
  if (stage === 'won') {
    patch.dealValue = extra.dealValue != null && extra.dealValue !== '' ? String(Number(extra.dealValue) || '') : lead.dealValue;
    patch.currency = extra.currency || lead.currency || 'EGP';
    if (extra.unit) patch.unit = extra.unit;
    patch.lostReason = '';
  }
  if (stage === 'lost') patch.lostReason = extra.lostReason || lead.lostReason || '';
  if (!isOpen_(stage)) patch.nextFollowUp = '';
  if (stage !== 'new' && !lead.firstContactAt) patch.firstContactAt = now;
  const updated = update_('Leads', lead, patch);
  let text = '';
  if (stage === 'won') text = (patch.dealValue ? 'قيمة الصفقة ' + patch.dealValue + ' ' + patch.currency : '') + (patch.unit ? ' · وحدة ' + patch.unit : '');
  if (stage === 'lost') text = patch.lostReason ? 'السبب: ' + patch.lostReason : '';
  if (extra.note) text = (text ? text + '\n' : '') + extra.note;
  logAct_(lead.id, actor, 'stage', text, lead.stage || 'new', stage);
  if (stage === 'won') notifyWon_(updated, actor);
  return updated;
}

function addActivity_(lead, a, actor) {
  const type = ACT_LABEL[a.type] && ['call', 'whatsapp', 'visit', 'meeting', 'note'].indexOf(a.type) >= 0 ? a.type : 'note';
  const text = String(a.text || '').trim();
  if (type === 'note' && !text && !a.nextFollowUp) throw new Error('اكتب حصل إيه أو حدد ميعاد المتابعة.');
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

/** الحقول اللي بتتبعت للمتصفح */
function publicLead_(l) {
  const c = clean_(l);
  delete c.phoneKey; delete c.slaAlertedAt;
  c.ownerName = displayName_(c.ownerEmail);
  return c;
}
