/**
 * EDEN CRM — constants
 */
const APP_NAME = 'EDEN CRM';
const TZ = 'Africa/Cairo';
const DEFAULT_SITE_URL = 'https://crm.edenalkhalij.com';
const SESSION_HOURS = 12; // how long a sign-in lasts before Google sign-in is needed again

const STAGES = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['qualified', 'Qualified'],
  ['visit', 'Site visit'],
  ['negotiation', 'Negotiation'],
  ['won', 'Won'],
  ['lost', 'Lost'],
];
const STAGE_LABEL = Object.fromEntries(STAGES);
const OPEN_STAGES = ['new', 'contacted', 'qualified', 'visit', 'negotiation'];

const SOURCES = [
  ['manual', 'Manual entry'],
  ['meta', 'Meta Ads'],
  ['website', 'Website'],
  ['whatsapp', 'WhatsApp'],
  ['call', 'Phone call'],
  ['walkin', 'Walk-in'],
  ['referral', 'Referral'],
  ['broker', 'Broker'],
];
const SOURCE_LABEL = Object.fromEntries(SOURCES);

const RATINGS = [['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']];
const RATING_LABEL = Object.fromEntries(RATINGS);

const UNIT_STATUSES = [['available', 'Available'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['blocked', 'Blocked']];
const UNIT_STATUS_LABEL = Object.fromEntries(UNIT_STATUSES);

const TASK_TYPES = [['call', 'Call'], ['whatsapp', 'WhatsApp'], ['visit', 'Site visit'], ['meeting', 'Meeting'], ['todo', 'To-do']];
const TASK_LABEL = Object.fromEntries(TASK_TYPES);

// Activity types that count as real contact with the client
const CONTACT_TYPES = ['call', 'whatsapp', 'visit', 'meeting'];
const ACT_LABEL = {
  call: 'Call', whatsapp: 'WhatsApp', visit: 'Site visit', meeting: 'Meeting', note: 'Note',
  stage: 'Stage', assign: 'Assigned', created: 'Created', system: 'System', unit: 'Unit', task: 'Task',
};
const LOST_REASONS = ['Price', 'Not interested', 'Bought elsewhere', 'No answer', 'Location', 'Financing / payment plan', 'Wrong number', 'Other'];
const CURRENCIES = ['EGP', 'USD', 'GEL'];
const ROLES = ['admin', 'manager', 'sales'];

// Sheet columns. Only ever ADD columns at the end — never reorder.
const SCHEMA = {
  Leads: ['id', 'createdAt', 'updatedAt', 'name', 'phone', 'phoneKey', 'email', 'source', 'campaign',
    'project', 'unit', 'budget', 'stage', 'ownerEmail', 'assignedAt', 'nextFollowUp', 'firstContactAt',
    'lastContactAt', 'stageAt', 'dealValue', 'currency', 'lostReason', 'note', 'createdBy',
    'slaAlertedAt', 'reassignCount', 'externalId', 'rating', 'tags'],
  Activities: ['id', 'leadId', 'at', 'by', 'type', 'text', 'fromVal', 'toVal'],
  Users: ['email', 'name', 'role', 'active', 'receivesLeads', 'phone'],
  Projects: ['name', 'country', 'units', 'active'],
  Units: ['code', 'project', 'type', 'floor', 'area', 'price', 'currency', 'status', 'leadId', 'reservedBy',
    'reservedAt', 'reservedUntil', 'soldAt', 'notes', 'updatedAt'],
  Tasks: ['id', 'leadId', 'title', 'type', 'dueAt', 'ownerEmail', 'status', 'createdAt', 'createdBy', 'doneAt',
    'remindedAt', 'calendarEventId', 'notes'],
  Settings: ['key', 'value', 'description'],
  Inbox: ['receivedAt', 'source', 'payload', 'status', 'leadId', 'error'],
};

const DEFAULT_TEMPLATES = [
  { name: 'Intro (Arabic)', text: 'أهلاً {name}، معاك {agent} من EDEN Developments. شكرًا لاهتمامك بمشروع {project}. إمتى وقت مناسب أكلمك وأبعتلك التفاصيل والأسعار؟' },
  { name: 'Intro (English)', text: 'Hi {name}, this is {agent} from EDEN Developments. Thank you for your interest in {project}. When is a good time to call you with the details and prices?' },
  { name: 'Visit confirmation', text: 'أهلاً {name}، بأكد معاد المعاينة في {project} يوم {visit}. لو محتاج اللوكيشن أو تغيير المعاد ابعتلي.' },
  { name: 'Unit offer', text: 'أهلاً {name}، الوحدة {unit} في {project} لسه متاحة بسعر {price}. تحب أحجزهالك؟' },
  { name: 'Follow-up', text: 'أهلاً {name}، حبيت أطمن عليك بخصوص {project}. لو عندك أي سؤال أنا موجود.' },
];

const DEFAULT_SETTINGS = {
  SLA_FIRST_CONTACT_HOURS: ['2', 'Alert the agent and managers if a new lead has no logged contact after this many hours (0 = off)'],
  AUTO_REASSIGN_HOURS: ['24', 'Move the lead to another agent if there is still no contact after this many hours (0 = off)'],
  MAX_REASSIGNS: ['2', 'Maximum automatic reassignments per lead'],
  DIGEST_HOUR: ['9', 'Hour of the morning digest email, Cairo time (0-23)'],
  RESERVATION_DAYS: ['7', 'Default unit reservation length in days'],
  VISIT_DURATION_MIN: ['60', 'Length of site visits / meetings on the calendar, in minutes'],
  TASK_REMINDER_MIN: ['60', 'Email a reminder this many minutes before a task is due (0 = off)'],
  CALENDAR_SYNC: ['TRUE', 'Put site visits and meetings on the shared EDEN CRM calendar and invite the agent'],
  ALLOW_SALES_EXPORT: ['FALSE', 'Let sales agents export their own leads to Excel'],
  WA_TEMPLATES: [JSON.stringify(DEFAULT_TEMPLATES), 'WhatsApp message templates (JSON)'],
  META_FORM_IDS: ['', 'Meta Lead Ads forms, one per line: FormID:Project name'],
  META_API_VERSION: ['v21.0', 'Graph API version'],
  APP_URL: ['', 'Link used in emails (leave empty for https://crm.edenalkhalij.com)'],
};
