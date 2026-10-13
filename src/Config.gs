/**
 * EDEN CRM — ثوابت النظام
 */
const APP_NAME = 'EDEN CRM';
const TZ = 'Africa/Cairo';

const STAGES = [
  ['new', 'جديد'],
  ['contacted', 'تم التواصل'],
  ['qualified', 'مهتم'],
  ['visit', 'معاينة'],
  ['negotiation', 'تفاوض'],
  ['won', 'تم البيع'],
  ['lost', 'خسارة'],
];
const STAGE_LABEL = Object.fromEntries(STAGES);
const OPEN_STAGES = ['new', 'contacted', 'qualified', 'visit', 'negotiation'];

const SOURCES = [
  ['manual', 'إدخال يدوي'],
  ['meta', 'Meta Ads'],
  ['website', 'فورم الموقع'],
  ['whatsapp', 'واتساب'],
  ['call', 'مكالمة'],
  ['walkin', 'زيارة للمكتب'],
  ['referral', 'ترشيح'],
  ['broker', 'بروكر'],
];
const SOURCE_LABEL = Object.fromEntries(SOURCES);

// أنواع النشاط اللي بتعتبر "تواصل فعلي" مع العميل
const CONTACT_TYPES = ['call', 'whatsapp', 'visit', 'meeting'];
const ACT_LABEL = {
  call: 'مكالمة', whatsapp: 'واتساب', visit: 'معاينة', meeting: 'اجتماع', note: 'ملاحظة',
  stage: 'المرحلة', assign: 'إسناد', created: 'إضافة', system: 'النظام',
};
const LOST_REASONS = ['السعر', 'مش مهتم', 'اشترى من مكان تاني', 'مش بيرد', 'الموقع مش مناسب', 'التمويل/التقسيط', 'رقم غلط', 'تاني'];
const CURRENCIES = ['EGP', 'USD', 'GEL'];
const ROLES = ['admin', 'manager', 'sales'];

// أعمدة كل شيت. ممكن تضيف أعمدة جديدة في الآخر بس، متغيرش الترتيب.
const SCHEMA = {
  Leads: ['id', 'createdAt', 'updatedAt', 'name', 'phone', 'phoneKey', 'email', 'source', 'campaign',
    'project', 'unit', 'budget', 'stage', 'ownerEmail', 'assignedAt', 'nextFollowUp', 'firstContactAt',
    'lastContactAt', 'stageAt', 'dealValue', 'currency', 'lostReason', 'note', 'createdBy',
    'slaAlertedAt', 'reassignCount', 'externalId'],
  Activities: ['id', 'leadId', 'at', 'by', 'type', 'text', 'fromVal', 'toVal'],
  Users: ['email', 'name', 'role', 'active', 'receivesLeads', 'phone'],
  Projects: ['name', 'country', 'units', 'active'],
  Settings: ['key', 'value', 'description'],
  Inbox: ['receivedAt', 'source', 'payload', 'status', 'leadId', 'error'],
};

const DEFAULT_SETTINGS = {
  SLA_FIRST_CONTACT_HOURS: ['2', 'الليد الجديد لو محدش سجّل تواصل معاه في عدد الساعات دي، بيتبعت تنبيه للسيلز والمديرين (0 = إيقاف)'],
  AUTO_REASSIGN_HOURS: ['24', 'لو محدش سجّل تواصل في عدد الساعات دي، الليد بيتنقل أوتوماتيك لسيلز تاني (0 = إيقاف)'],
  MAX_REASSIGNS: ['2', 'أقصى عدد مرات نقل أوتوماتيك لنفس الليد'],
  DIGEST_HOUR: ['9', 'ساعة إيميل المتابعات الصباحي بتوقيت القاهرة (0-23)'],
  META_FORM_IDS: ['', 'فورمات Meta Lead Ads: كل سطر بالشكل FormID:اسم المشروع'],
  META_API_VERSION: ['v21.0', 'نسخة Graph API'],
  APP_URL: ['', 'لينك البرنامج — بيتسجل أوتوماتيك أول ما الأدمن يفتحه'],
};
