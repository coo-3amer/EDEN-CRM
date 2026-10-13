/**
 * EDEN CRM — Intake
 * مشروع صغير منفصل بيستقبل ليدز فورم الموقع (أو أي مصدر خارجي) ويكتبها في شيت Inbox.
 * لازم يتنشر Anyone (من غير تسجيل دخول) عشان الموقع يقدر يبعتله،
 * وده سبب إنه منفصل عن البرنامج الأساسي اللي متاح لحسابات الشركة بس.
 *
 * حط القيمتين دول من نتيجة setup() في المشروع الأساسي:
 */
const SPREADSHEET_ID = 'PUT_SPREADSHEET_ID_HERE';
const INTAKE_SECRET = 'PUT_INTAKE_SECRET_HERE';

function doPost(e) {
  let p = {};
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    p = (e && e.parameter) || {};
  }
  if (!p || p.secret !== INTAKE_SECRET) return json_({ ok: false, error: 'unauthorized' });
  delete p.secret;
  // تنظيف وحدود بسيطة ضد السبام
  const clean = {};
  Object.keys(p).slice(0, 30).forEach(function (k) {
    clean[String(k).slice(0, 40)] = String(p[k] == null ? '' : p[k]).slice(0, 1000);
  });
  if (!clean.name && !clean.full_name && !clean.phone && !clean.phone_number) return json_({ ok: false, error: 'name or phone required' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Inbox');
    const row = sh.getLastRow() + 1;
    const r = sh.getRange(row, 1, 1, 6);
    r.setNumberFormat('@');
    r.setValues([[new Date().toISOString(), clean.source || 'website', JSON.stringify(clean), '', '', '']]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function doGet() {
  return json_({ ok: true, service: 'EDEN CRM intake' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
