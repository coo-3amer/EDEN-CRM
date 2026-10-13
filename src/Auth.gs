/**
 * الصلاحيات: كل طلب من البرنامج بيتعرف على صاحبه من حساب Google Workspace،
 * والسيرفر هو اللي بيقرر يرجّع إيه. السيلز ملهمش صلاحية على الشيت نفسه.
 *
 * admin   : كل حاجة + المستخدمين والإعدادات والأتمتة
 * manager : يشوف كل الليدز، يوزّع، يستورد، يعدّل المشاريع
 * sales   : يشوف ويعدّل ليدزه هو بس
 */
function users_() {
  return rows_('Users').map(function (u) {
    return Object.assign({}, u, {
      email: String(u.email || '').trim().toLowerCase(),
      role: ROLES.indexOf(String(u.role || '').trim().toLowerCase()) >= 0 ? String(u.role).trim().toLowerCase() : 'sales',
    });
  }).filter(function (u) { return u.email; });
}

function activeUsers_() { return users_().filter(function (u) { return truthy_(u.active); }); }

function userByEmail_(email) {
  email = String(email || '').toLowerCase();
  return users_().find(function (u) { return u.email === email; }) || null;
}

function displayName_(email) {
  if (!email) return 'بدون مسؤول';
  if (email === 'system') return 'النظام';
  const u = userByEmail_(email);
  return (u && u.name) || email;
}

function me_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('مش قادر أتعرف على حسابك. افتح البرنامج بحساب الشركة (@edenalkhalij.com).');
  const u = userByEmail_(email);
  if (!u || !truthy_(u.active)) throw new Error('حسابك (' + email + ') مش متضاف في EDEN CRM أو متوقف. كلّم الأدمن يضيفك.');
  return { email: email, name: u.name || email, role: u.role };
}

function isManager_(u) { return u.role === 'admin' || u.role === 'manager'; }
function isAdmin_(u) { return u.role === 'admin'; }

function requireManager_(u) { if (!isManager_(u)) throw new Error('الصفحة دي للمديرين بس.'); }
function requireAdmin_(u) { if (!isAdmin_(u)) throw new Error('الإعداد ده للأدمن بس.'); }

function canSee_(u, lead) {
  return isManager_(u) || String(lead.ownerEmail || '').toLowerCase() === u.email;
}

function managers_() {
  return activeUsers_().filter(function (u) { return u.role === 'admin' || u.role === 'manager'; })
    .map(function (u) { return u.email; });
}
