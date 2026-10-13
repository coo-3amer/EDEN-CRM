/**
 * Pulls Meta Lead Ads leads from the Graph API every 10 minutes.
 * Needs a Page Access Token with leads_retrieval + the form IDs.
 * Polling instead of webhooks, because Apps Script cannot answer Meta's webhook handshake reliably.
 */
function metaFormList_() {
  return String(settings_().META_FORM_IDS || '').split(/\n+/).map(function (line) {
    const t = line.trim();
    if (!t) return null;
    const i = t.indexOf(':');
    return i > 0 ? { id: t.slice(0, i).trim(), project: t.slice(i + 1).trim() } : { id: t, project: '' };
  }).filter(function (x) { return x && /^\d+$/.test(x.id); });
}

function metaFetch_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) { throw new Error('Unreadable reply from Meta (HTTP ' + res.getResponseCode() + ')'); }
  if (j.error) throw new Error('Meta: ' + (j.error.message || JSON.stringify(j.error)));
  return j;
}

function parseMetaTime_(s) {
  return Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
}

function metaLeadToData_(x, project) {
  const f = {};
  (x.field_data || []).forEach(function (fd) { f[String(fd.name).toLowerCase()] = (fd.values || []).join(', '); });
  const name = f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' ') || f['الاسم'] || '';
  const phone = (f.phone_number || f.phone || f['رقم_الهاتف'] || '').replace(/^p:/i, '');
  const known = ['full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'email'];
  const extras = Object.keys(f).filter(function (k) { return known.indexOf(k) < 0 && f[k]; })
    .map(function (k) { return k.replace(/_/g, ' ') + ': ' + f[k]; });
  return {
    name: name, phone: phone, email: f.email || '', source: 'meta', project: project || '',
    campaign: x.campaign_name || x.ad_name || '', note: [x.ad_name ? 'Ad: ' + x.ad_name : '', extras.join(' · ')].filter(Boolean).join('\n'),
    externalId: 'meta:' + x.id,
  };
}

function syncMetaLeads_() {
  const token = secret_('META_PAGE_TOKEN');
  const forms = metaFormList_();
  if (!token || !forms.length) return 0;
  const s = settings_();
  const ver = s.META_API_VERSION || 'v21.0';
  const props = PropertiesService.getScriptProperties();
  // look back one extra hour as a safety margin; duplicates are blocked by externalId
  const since = Number(props.getProperty('META_SINCE') || 0) || Math.floor(Date.now() / 1000) - 3 * 86400;
  const from = since - 3600;
  let maxTs = since, count = 0;
  forms.forEach(function (form) {
    let url = 'https://graph.facebook.com/' + ver + '/' + form.id + '/leads?limit=100' +
      '&fields=' + encodeURIComponent('id,created_time,field_data,campaign_name,ad_name') +
      '&filtering=' + encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: from }])) +
      '&access_token=' + encodeURIComponent(token);
    let pages = 0;
    while (url && pages < 20) {
      const j = metaFetch_(url);
      (j.data || []).forEach(function (x) {
        const ts = Math.floor(parseMetaTime_(x.created_time) / 1000);
        if (ts > maxTs) maxTs = ts;
        const res = createLead_(metaLeadToData_(x, form.project), 'system', { system: true });
        if (res.lead) count++;
      });
      url = j.paging && j.paging.next ? j.paging.next : null;
      pages++;
    }
  });
  props.setProperty('META_SINCE', String(maxTs));
  setSetting_('META_LAST_SYNC_AT', nowIso_());
  return count;
}

function testMeta_() {
  const token = secret_('META_PAGE_TOKEN');
  const forms = metaFormList_();
  if (!token) return { ok: false, message: 'No Page Access Token saved.' };
  if (!forms.length) return { ok: false, message: 'No form IDs saved.' };
  const ver = settings_().META_API_VERSION || 'v21.0';
  const results = forms.map(function (f) {
    try {
      const j = metaFetch_('https://graph.facebook.com/' + ver + '/' + f.id + '?fields=name,status,leads_count&access_token=' + encodeURIComponent(token));
      return '✓ ' + (j.name || f.id) + (j.leads_count != null ? ' (' + j.leads_count + ' leads)' : '') + (f.project ? ' → ' + f.project : '');
    } catch (e) {
      return '✗ ' + f.id + ': ' + e.message;
    }
  });
  return { ok: results.every(function (r) { return r.indexOf('✓') === 0; }), message: results.join('\n') };
}
