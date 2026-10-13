/**
 * Run setup() once from the Apps Script editor — and again after any update that adds columns.
 * It creates the data spreadsheet, columns, settings, makes you admin, and installs the triggers.
 * Running it again never deletes data.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
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
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = SCHEMA[name];
    const lastCol = sh.getLastColumn();
    const cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String) : [];
    const prefixOk = cur.every(function (h, i) { return head[i] === h; });
    if (!prefixOk) throw new Error('Columns of sheet "' + name + '" are not what EDEN CRM expects. Do not reorder columns by hand.');
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
    const row = st.find(function (x) { return x.key === k; });
    if (!row) insert_('Settings', { key: k, value: DEFAULT_SETTINGS[k][0], description: DEFAULT_SETTINGS[k][1] });
    else if (row.description !== DEFAULT_SETTINGS[k][1]) update_('Settings', row, { description: DEFAULT_SETTINGS[k][1] });
  });

  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && !rows_('Users').find(function (u) { return String(u.email).toLowerCase() === me; })) {
    insert_('Users', { email: me, name: 'Admin', role: 'admin', active: 'TRUE', receivesLeads: 'FALSE', phone: '' });
  }
  if (!props.getProperty('INTAKE_SECRET')) props.setProperty('INTAKE_SECRET', Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('SESSION_SECRET')) props.setProperty('SESSION_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));

  migrateProjectUnits_();
  if (calendarOn_()) {
    try { calendar_(); } catch (e) { Logger.log('Calendar not created: ' + e.message); }
  }
  installTriggers_();

  Logger.log('✅ EDEN CRM is ready');
  Logger.log('Data spreadsheet: ' + ss.getUrl());
  Logger.log('Website: ' + siteUrl_());
  Logger.log('INTAKE_SECRET (for the website form): ' + props.getProperty('INTAKE_SECRET'));
}

/** Stop all automations */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('All triggers removed');
}
