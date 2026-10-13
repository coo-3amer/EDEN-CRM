/**
 * استقبال الليدز من برة:
 * - فورم الموقع → مشروع Intake الصغير (intake/) بيكتب في شيت Inbox
 * - الـ Trigger بيقرا Inbox كل 10 دقايق ويحوّل كل صف لليد
 */
function processInbox_() {
  const pending = rows_('Inbox').filter(function (r) { return !r.status; });
  pending.forEach(function (r) {
    try {
      const p = JSON.parse(r.payload || '{}');
      const name = p.name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
      const phone = p.phone || p.phone_number || p.mobile || '';
      if (!name && !phone) throw new Error('مفيش اسم ولا موبايل');
      const extras = Object.keys(p).filter(function (k) {
        return ['name', 'full_name', 'first_name', 'last_name', 'phone', 'phone_number', 'mobile', 'email', 'project', 'source', 'campaign', 'utm_campaign', 'message', 'secret'].indexOf(k) < 0 && p[k];
      }).map(function (k) { return k + ': ' + p[k]; });
      const note = [p.message, extras.join(' · ')].filter(Boolean).join('\n');
      const res = createLead_({
        name: name, phone: phone, email: p.email || '', project: p.project || '',
        source: SOURCE_LABEL[p.source] ? p.source : (r.source && SOURCE_LABEL[r.source] ? r.source : 'website'),
        campaign: p.campaign || p.utm_campaign || '', note: note,
      }, 'system', { system: true });
      update_('Inbox', r, { status: res.lead ? 'done' : res.duplicate ? 'duplicate' : 'skipped', leadId: (res.lead || res.duplicate || {}).id || '', error: '' });
    } catch (e) {
      update_('Inbox', r, { status: 'error', error: String(e && e.message || e) });
    }
  });
  return pending.length;
}
