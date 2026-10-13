/**
 * الأتمتة (Triggers بتشتغل لوحدها):
 * runAutomations — كل 10 دقايق: Inbox + Meta + تنبيه الليدز اللي محدش كلمها + النقل التلقائي
 * morningDigest  — كل يوم الصبح: إيميل لكل سيلز بمتابعاته، وملخص للمديرين
 */
function runAutomations() {
  const props = PropertiesService.getScriptProperties();
  const errors = [];
  withLock_(function () {
    try { processInbox_(); } catch (e) { errors.push('Inbox: ' + e.message); }
    try { syncMetaLeads_(); } catch (e) { errors.push(e.message); }
    try { checkSla_(); } catch (e) { errors.push('SLA: ' + e.message); }
  });
  props.setProperty('LAST_AUTOMATION_RUN', nowIso_());
  props.setProperty('LAST_AUTOMATION_ERROR', errors.join(' | '));
  if (errors.length) console.error(errors.join('\n'));
}

/** ليد جديد محدش سجّل تواصل معاه: تنبيه بعد SLA ساعة، ونقل لسيلز تاني بعد AUTO_REASSIGN ساعة */
function checkSla_() {
  const s = settings_();
  const sla = Number(s.SLA_FIRST_CONTACT_HOURS) || 0;
  const re = Number(s.AUTO_REASSIGN_HOURS) || 0;
  const maxRe = Number(s.MAX_REASSIGNS || 2);
  const stale = rows_('Leads').filter(function (l) {
    return (l.stage || 'new') === 'new' && !l.firstContactAt && l.ownerEmail && l.assignedAt;
  });
  const lateForManagers = [];
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
        logAct_(l.id, 'system', 'assign', 'اتنقل أوتوماتيك: محدش سجّل تواصل خلال ' + re + ' ساعة', from, to);
        notifyNewLead_(updated);
        mail_(from, 'ليد اتسحب منك: ' + (l.name || l.phone),
          '<p>الليد ده اتنقل لزميل لأن مفيش تواصل اتسجل عليه خلال ' + re + ' ساعة:</p><p>' + leadLine_(l) + '</p>');
        lateForManagers.push({ l: updated, note: 'اتنقل من ' + displayName_(from) + ' لـ ' + displayName_(to) });
        return;
      }
    }
    if (sla && age >= sla && !l.slaAlertedAt) {
      update_('Leads', leadById_(l.id), { slaAlertedAt: nowIso_() });
      mail_(l.ownerEmail, '⏰ ليد مستني تكلمه: ' + (l.name || l.phone),
        '<p>الليد ده عنده أكتر من ' + sla + ' ساعة ومحدش سجّل تواصل معاه:</p><p>' + leadLine_(l) + '</p>' +
        (re ? '<p>لو مفيش تواصل خلال ' + re + ' ساعة من الإسناد هيتنقل لزميل.</p>' : ''));
      lateForManagers.push({ l: l, note: 'مع ' + displayName_(l.ownerEmail) + ' من ' + Math.floor(age) + ' ساعة' });
    }
  });
  if (lateForManagers.length) {
    mail_(managers_(), '⏰ ' + lateForManagers.length + ' ليد جديد محدش كلمهم',
      '<p>ليدز عدّت وقت الرد الأول من غير تواصل:</p><ul>' +
      lateForManagers.map(function (x) { return '<li>' + leadLine_(x.l) + ' — ' + esc_(x.note) + '</li>'; }).join('') + '</ul>');
  }
}

/** الإيميل الصباحي */
function morningDigest() {
  const today = today_();
  const leads = rows_('Leads').filter(function (l) { return isOpen_(l.stage); });
  const users = activeUsers_();
  const list = function (arr) {
    return '<ul>' + arr.slice(0, 40).map(function (l) {
      return '<li>' + leadLine_(l) + ' · <span style="color:#5B6A62">' + esc_(STAGE_LABEL[l.stage] || '') +
        (l.nextFollowUp && l.nextFollowUp < today ? ' · متأخر من ' + esc_(l.nextFollowUp) : '') + '</span></li>';
    }).join('') + (arr.length > 40 ? '<li>و ' + (arr.length - 40) + ' كمان...</li>' : '') + '</ul>';
  };
  const summary = [];
  users.forEach(function (u) {
    const mine = leads.filter(function (l) { return String(l.ownerEmail).toLowerCase() === u.email; });
    const late = mine.filter(function (l) { return l.nextFollowUp && l.nextFollowUp < today; });
    const tod = mine.filter(function (l) { return l.nextFollowUp === today; });
    const fresh = mine.filter(function (l) { return (l.stage || 'new') === 'new' && !l.firstContactAt; });
    const none = mine.filter(function (l) { return !l.nextFollowUp; });
    if (mine.length) summary.push({ u: u, open: mine.length, late: late.length, tod: tod.length, fresh: fresh.length });
    if (!late.length && !tod.length && !fresh.length) return;
    let html = '<p>صباح الخير ' + esc_(u.name || '') + '، دي متابعاتك النهارده:</p>';
    if (late.length) html += '<h3 style="color:#B0412D;margin-bottom:4px">متأخرة (' + late.length + ')</h3>' + list(late);
    if (tod.length) html += '<h3 style="margin-bottom:4px">النهارده (' + tod.length + ')</h3>' + list(tod);
    if (fresh.length) html += '<h3 style="margin-bottom:4px">ليدز جديدة لسه محدش كلمها (' + fresh.length + ')</h3>' + list(fresh);
    if (none.length) html += '<p style="color:#5B6A62">وعندك ' + none.length + ' ليد مفتوح من غير ميعاد متابعة.</p>';
    mail_(u.email, 'متابعات النهارده: ' + (late.length + tod.length) + (late.length ? ' (' + late.length + ' متأخرة)' : ''), html);
  });

  // ملخص المديرين
  const y = addDays_(today, -1);
  const all = rows_('Leads');
  const newY = all.filter(function (l) { return String(l.createdAt).slice(0, 10) === y; }).length;
  const wonY = all.filter(function (l) { return l.stage === 'won' && String(l.stageAt).slice(0, 10) === y; });
  const unassigned = leads.filter(function (l) { return !l.ownerEmail; }).length;
  let html = '<p>ملخص امبارح (' + y + '): <b>' + newY + '</b> ليد جديد، و<b>' + wonY.length + '</b> بيعة.</p>';
  if (unassigned) html += '<p style="color:#B0412D">في ' + unassigned + ' ليد مفتوح من غير مسؤول.</p>';
  html += '<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#F3F5F1"><th align="right">السيلز</th><th>مفتوحة</th><th>متأخرة</th><th>النهارده</th><th>جديدة محدش كلمها</th></tr>' +
    summary.sort(function (a, b) { return b.late - a.late; }).map(function (r) {
      return '<tr><td>' + esc_(r.u.name || r.u.email) + '</td><td align="center">' + r.open + '</td><td align="center" style="' + (r.late ? 'color:#B0412D;font-weight:bold' : '') + '">' + r.late + '</td><td align="center">' + r.tod + '</td><td align="center">' + r.fresh + '</td></tr>';
    }).join('') + '</table>';
  mail_(managers_(), 'ملخص المبيعات — ' + today, html);
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runAutomations', 'morningDigest'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAutomations').timeBased().everyMinutes(10).create();
  const h = Math.min(23, Math.max(0, Number(settings_().DIGEST_HOUR) || 9));
  ScriptApp.newTrigger('morningDigest').timeBased().atHour(h).everyDays(1).inTimezone(TZ).create();
}
