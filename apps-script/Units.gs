/**
 * Unit inventory and reservations.
 * Status: available → reserved (for one lead, until a date) → sold (when the lead is Won)
 *         blocked = off market
 */
function normCode_(c) { return String(c || '').trim().toUpperCase(); }

function unitByCode_(code) {
  const k = normCode_(code);
  if (!k) return null;
  return rows_('Units').find(function (u) { return normCode_(u.code) === k; }) || null;
}

function assertUnitSellable_(u, leadId) {
  if (u.status === 'sold' && u.leadId !== leadId) throw new Error('Unit ' + u.code + ' is already sold.');
  if (u.status === 'reserved' && u.leadId !== leadId) throw new Error('Unit ' + u.code + ' is reserved for another client until ' + u.reservedUntil + '. Release it first.');
  if (u.status === 'blocked') throw new Error('Unit ' + u.code + ' is blocked (off market).');
}

function reserveUnit_(lead, code, days, actor, note) {
  let u = unitByCode_(code);
  if (!u) throw new Error('Unit ' + code + ' is not in the inventory.');
  if (u.status === 'sold') throw new Error('Unit ' + u.code + ' is already sold.');
  if (u.status === 'blocked') throw new Error('Unit ' + u.code + ' is blocked (off market).');
  if (u.status === 'reserved' && u.leadId !== lead.id) {
    throw new Error('Unit ' + u.code + ' is already reserved for another client until ' + u.reservedUntil + '.');
  }
  // one reserved unit per client: switching releases the old one
  rows_('Units').filter(function (x) { return x.status === 'reserved' && x.leadId === lead.id && normCode_(x.code) !== normCode_(u.code); })
    .forEach(function (x) { releaseUnit_(x, actor, 'switched to ' + u.code); });
  u = unitByCode_(u.code);
  const n = Math.max(1, Math.min(90, Number(days) || Number(settings_().RESERVATION_DAYS) || 7));
  const until = addDays_(today_(), n);
  const extend = u.status === 'reserved';
  const saved = update_('Units', u, {
    status: 'reserved', leadId: lead.id, reservedBy: extend ? u.reservedBy : actor,
    reservedAt: extend ? u.reservedAt : nowIso_(), reservedUntil: until, updatedAt: nowIso_(),
  });
  const updatedLead = update_('Leads', leadById_(lead.id), { unit: u.code, project: u.project || lead.project, updatedAt: nowIso_() });
  logAct_(lead.id, actor, 'unit', (extend ? 'Extended reservation of ' : 'Reserved ') + u.code + ' until ' + until + (note ? '\n' + note : ''));
  if (!extend) notifyReservation_(saved, updatedLead, actor);
  return updatedLead;
}

function releaseUnit_(u, actor, reason) {
  const leadId = u.leadId;
  const r = update_('Units', u, { status: 'available', leadId: '', reservedBy: '', reservedAt: '', reservedUntil: '', updatedAt: nowIso_() });
  if (leadId && leadById_(leadId)) logAct_(leadId, actor, 'unit', 'Released ' + u.code + (reason ? ' — ' + reason : ''));
  return r;
}

function sellUnit_(u, lead, actor) {
  return update_('Units', unitByCode_(u.code), { status: 'sold', leadId: lead.id, soldAt: nowIso_(), reservedUntil: '', updatedAt: nowIso_() });
}

function releaseUnitsForLead_(leadId, actor, reason) {
  rows_('Units').filter(function (u) { return u.status === 'reserved' && u.leadId === leadId; })
    .forEach(function (u) { releaseUnit_(u, actor, reason); });
}

function expireReservations_() {
  const t = today_();
  rows_('Units').filter(function (u) { return u.status === 'reserved' && u.reservedUntil && u.reservedUntil < t; })
    .forEach(function (u) {
      const lead = u.leadId ? leadById_(u.leadId) : null;
      releaseUnit_(u, 'system', 'reservation expired');
      mail_([lead && lead.ownerEmail, u.reservedBy].concat(managers_()), 'Reservation expired: ' + u.code,
        '<p>The reservation of unit <b>' + esc_(u.code) + '</b>' + (u.project ? ' (' + esc_(u.project) + ')' : '') +
        ' ended on ' + esc_(u.reservedUntil) + ' and the unit is available again.</p>' +
        (lead ? '<p>Client: ' + leadLine_(lead) + '</p>' : ''), { type: 'unit', leadId: lead ? lead.id : '', text: 'Reservation of ' + u.code + ' expired — the unit is available again' });
    });
}

const UNIT_FIELDS_ = ['project', 'type', 'floor', 'area', 'price', 'currency', 'notes'];

function unitFields_(d) {
  const o = {};
  UNIT_FIELDS_.forEach(function (f) { if (d[f] !== undefined) o[f] = String(d[f] == null ? '' : d[f]).trim(); });
  if (o.price !== undefined) o.price = o.price ? String(Number(String(o.price).replace(/[^\d.]/g, '')) || '') : '';
  if (o.area !== undefined) o.area = o.area ? String(Number(String(o.area).replace(/[^\d.]/g, '')) || '') : '';
  if (o.currency !== undefined && CURRENCIES.indexOf(o.currency) < 0) o.currency = 'EGP';
  return o;
}

/** Manager: add or edit one unit */
function saveUnit_(d, actor) {
  const code = normCode_(d.code);
  if (!code) throw new Error('Unit code is required.');
  const orig = d.originalCode ? unitByCode_(d.originalCode) : null;
  const clash = unitByCode_(code);
  if (clash && (!orig || clash._row !== orig._row)) throw new Error('Unit ' + code + ' already exists.');
  const fields = unitFields_(d);
  if (!orig) {
    const st = ['available', 'blocked', 'sold'].indexOf(d.status) >= 0 ? d.status : 'available';
    return insert_('Units', Object.assign({ code: code, currency: 'EGP', status: st, soldAt: st === 'sold' ? nowIso_() : '', updatedAt: nowIso_() }, fields));
  }
  let u = orig;
  const want = d.status && UNIT_STATUS_LABEL[d.status] ? d.status : u.status;
  if (want !== u.status) {
    if (want === 'reserved') throw new Error('To reserve a unit, open the client and use Reserve.');
    if (u.status === 'reserved') u = releaseUnit_(u, actor, 'status changed to ' + UNIT_STATUS_LABEL[want]);
    if (u.status === 'sold' && u.leadId) logAct_(u.leadId, actor, 'unit', 'Unit ' + u.code + ' changed from Sold to ' + UNIT_STATUS_LABEL[want]);
    fields.status = want;
    if (want === 'sold') fields.soldAt = nowIso_();
    if (want === 'available' || want === 'blocked') { fields.leadId = ''; fields.soldAt = ''; }
  }
  fields.code = code;
  fields.updatedAt = nowIso_();
  const saved = update_('Units', u, fields);
  if (normCode_(orig.code) !== code && saved.leadId) {
    const l = leadById_(saved.leadId);
    if (l && normCode_(l.unit) === normCode_(orig.code)) update_('Leads', l, { unit: code });
  }
  return saved;
}

/** Manager: bulk add/update from pasted rows. Existing units keep their status. */
function importUnits_(list) {
  let added = 0, updated = 0;
  (list || []).slice(0, 3000).forEach(function (r) {
    const code = normCode_(r.code);
    if (!code) return;
    const fields = unitFields_(r);
    Object.keys(fields).forEach(function (k) { if (fields[k] === '') delete fields[k]; });
    const u = unitByCode_(code);
    if (u) { update_('Units', u, Object.assign(fields, { updatedAt: nowIso_() })); updated++; }
    else {
      const st = ['blocked', 'sold'].indexOf(String(r.status || '').toLowerCase()) >= 0 ? String(r.status).toLowerCase() : 'available';
      insert_('Units', Object.assign({ code: code, currency: 'EGP', status: st, updatedAt: nowIso_() }, fields));
      added++;
    }
  });
  return { added: added, updated: updated };
}

function deleteUnit_(code) {
  const u = unitByCode_(code);
  if (!u) return;
  if (u.status === 'reserved' || (u.status === 'sold' && u.leadId)) throw new Error('Release or unsell unit ' + u.code + ' before deleting it.');
  deleteRow_('Units', u);
}

function publicUnits_(viewer) {
  const lm = leadMap_();
  return rows_('Units').map(function (u) {
    const c = clean_(u);
    const lead = u.leadId ? lm[u.leadId] : null;
    const vis = canSee_(viewer, lead);
    c.leadName = vis ? (lead.name || lead.phone) : '';
    c.leadId = vis ? u.leadId : '';
    c.mine = !!(lead && lead.ownerEmail === viewer.email);
    c.reservedByName = isManager_(viewer) && u.reservedBy ? displayName_(u.reservedBy) : '';
    if (!isManager_(viewer)) delete c.reservedBy;
    return c;
  });
}

/** One-time move of unit codes typed into Projects (v1) into the Units sheet */
function migrateProjectUnits_() {
  rows_('Projects').forEach(function (p) {
    const codes = String(p.units || '').split(/[\n,،]+/).map(normCode_).filter(String);
    if (!codes.length) return;
    codes.forEach(function (c) {
      if (!unitByCode_(c)) insert_('Units', { code: c, project: p.name, currency: 'EGP', status: 'available', updatedAt: nowIso_() });
    });
    update_('Projects', p, { units: '' });
  });
}
