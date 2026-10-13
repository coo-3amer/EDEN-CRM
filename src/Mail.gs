/**
 * الإيميلات والتنبيهات (MailApp — من حساب صاحب السكريبت).
 */
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function mail_(to, subject, inner) {
  const list = [].concat(to || []).map(function (e) { return String(e || '').trim().toLowerCase(); })
    .filter(function (e) { return e && e !== 'system'; });
  const uniq = list.filter(function (e, i) { return list.indexOf(e) === i; });
  if (!uniq.length) return;
  const url = appUrl_();
  const html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#18221E;line-height:1.7;max-width:640px">' +
    inner +
    (url ? '<p style="margin-top:18px"><a href="' + esc_(url) + '" style="background:#2B5C4B;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">افتح EDEN CRM</a></p>' : '') +
    '<p style="color:#5B6A62;font-size:12px;margin-top:18px">' + APP_NAME + ' · إيميل أوتوماتيك</p></div>';
  try {
    MailApp.sendEmail({ to: uniq.join(','), subject: subject, htmlBody: html, name: APP_NAME });
  } catch (e) {
    console.error('mail failed', e);
  }
}

function leadLine_(l) {
  return '<b>' + esc_(l.name || 'بدون اسم') + '</b> — <span dir="ltr">' + esc_(l.phone || '') + '</span>' +
    (l.project ? ' · ' + esc_(l.project) : '') + (l.unit ? ' · ' + esc_(l.unit) : '');
}

function notifyNewLead_(l) {
  mail_(l.ownerEmail, 'ليد جديد: ' + (l.name || l.phone),
    '<p>اتسند لك ليد جديد:</p><p>' + leadLine_(l) + '</p>' +
    '<p>المصدر: ' + esc_(srcLabel_(l.source)) + (l.campaign ? ' · ' + esc_(l.campaign) : '') + '</p>' +
    (l.note ? '<p style="background:#F3F5F1;padding:8px 12px;border-radius:8px">' + esc_(l.note) + '</p>' : '') +
    '<p>كلّمه في أسرع وقت وسجّل التواصل في البرنامج.</p>');
}

function notifyUnassigned_(l) {
  mail_(managers_(), 'ليد جديد من غير مسؤول: ' + (l.name || l.phone),
    '<p>دخل ليد جديد ومفيش سيلز متاح للتوزيع التلقائي. وزّعه من البرنامج:</p><p>' + leadLine_(l) + '</p>');
}

function notifyReturningLead_(l, msg) {
  const to = l.ownerEmail ? [l.ownerEmail] : managers_();
  mail_(to, 'عميل رجع تاني: ' + (l.name || l.phone),
    '<p>' + leadLine_(l) + '</p><p>' + esc_(msg).replace(/\n/g, '<br>') + '</p><p>المرحلة الحالية: ' + esc_(STAGE_LABEL[l.stage] || '') + '</p>');
}

function notifyWon_(l, actor) {
  mail_(managers_().filter(function (e) { return e !== actor; }), '🎉 بيعة جديدة: ' + (l.name || l.phone),
    '<p>' + esc_(displayName_(actor)) + ' قفل بيعة:</p><p>' + leadLine_(l) + '</p>' +
    (l.dealValue ? '<p>القيمة: <b>' + esc_(Number(l.dealValue).toLocaleString('en-US')) + ' ' + esc_(l.currency) + '</b></p>' : ''));
}
