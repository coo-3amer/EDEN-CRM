/**
 * شغّل setup() مرة واحدة من محرر Apps Script (وبعد أي تحديث فيه أعمدة جديدة).
 * بيعمل شيت الداتا، الأعمدة، الإعدادات، يضيفك أدمن، ويركّب الـ Triggers.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('EDEN CRM — Data');
    ss.setSpreadsheetTimeZone(TZ);
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  SS_ = ss;

  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = SCHEMA[name];
    const lastCol = sh.getLastColumn();
    const cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String) : [];
    const prefixOk = cur.every(function (h, i) { return head[i] === h; });
    if (!prefixOk) throw new Error('أعمدة شيت ' + name + ' مختلفة عن المتوقع. متغيرش ترتيب الأعمدة يدوي.');
    if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#DCE9E2');
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.setFrozenRows(1);
    clearCache_(name);
  });
  ['Sheet1', 'ورقة1', 'Feuille 1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  const st = rows_('Settings');
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!st.find(function (x) { return x.key === k; })) insert_('Settings', { key: k, value: DEFAULT_SETTINGS[k][0], description: DEFAULT_SETTINGS[k][1] });
  });

  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && !rows_('Users').find(function (u) { return String(u.email).toLowerCase() === me; })) {
    insert_('Users', { email: me, name: 'الأدمن', role: 'admin', active: 'TRUE', receivesLeads: 'FALSE', phone: '' });
  }
  if (!props.getProperty('INTAKE_SECRET')) props.setProperty('INTAKE_SECRET', Utilities.getUuid().replace(/-/g, ''));

  installTriggers_();

  Logger.log('✅ EDEN CRM جاهز');
  Logger.log('شيت الداتا: ' + ss.getUrl());
  Logger.log('SPREADSHEET_ID (هتحطه في مشروع intake): ' + ss.getId());
  Logger.log('INTAKE_SECRET (هتحطه في مشروع intake وفي كود الموقع): ' + props.getProperty('INTAKE_SECRET'));
}

/** لو عايز توقف الأتمتة كلها */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('اتشالت كل الـ Triggers');
}
