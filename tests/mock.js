// Minimal Apps Script runtime mock (works in Node vm and in a browser page)
(function (root) {
  function makeEnv(opts) {
    opts = opts || {};
    const st = { cache: {}, activeEmail: '', mails: [], fetches: [], props: {}, triggers: [], events: {}, evSeq: 0, meta: null };
    const RealDate = Date;
    const now = () => (opts.now ? opts.now() : RealDate.now());
    function makeSheet(name) {
      const data = [];
      return {
        name, data, maxRows: 1000, maxCols: 26,
        getLastRow() { let n = data.length; while (n > 0 && data[n - 1].every(v => v === '' || v == null)) n--; return n; },
        getLastColumn() { return data.reduce((m, r) => Math.max(m, r.reduce((k, v, i) => (v !== '' && v != null ? i + 1 : k), 0)), 0); },
        getMaxRows() { return this.maxRows; }, getMaxColumns() { return this.maxCols; },
        insertColumnsAfter(a, n) { this.maxCols += n; },
        getRange(r, c, nr = 1, nc = 1) {
          return {
            getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
            setValues(v) { for (let i = 0; i < nr; i++) { while (data.length < r + i) data.push([]); for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = String(v[i][j]).replace(/^'/, ''); } return this; },
            clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; return this; },
            setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; },
          };
        },
        deleteRow(r) { data.splice(r - 1, 1); },
        setFrozenRows() {}, appendRow(row) { data.push(row.map(String)); },
      };
    }
    const ss = { sheets: { Sheet1: makeSheet('Sheet1') }, getId: () => 'SSID', getUrl: () => 'https://docs.google.com/spreadsheets/d/SSID',
      getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return (this.sheets[n] = makeSheet(n)); },
      getSheets() { return Object.values(this.sheets); }, deleteSheet(s) { delete this.sheets[s.name]; }, setSpreadsheetTimeZone() {} };
    const pad = n => String(n).padStart(2, '0');
    const utf8 = (s) => Array.from(new TextEncoder().encode(s));
    const fromUtf8 = (b) => new TextDecoder().decode(new Uint8Array(b.map(x => x & 255)));
    const b64 = (bytes) => (typeof Buffer !== 'undefined' ? Buffer.from(bytes.map(x => x & 255)).toString('base64') : btoa(String.fromCharCode.apply(null, bytes.map(x => x & 255))));
    const unb64 = (s) => (typeof Buffer !== 'undefined' ? Array.from(Buffer.from(s, 'base64')) : Array.from(atob(s), c => c.charCodeAt(0)));
    const hmac = opts.hmac || ((v, k) => { if (typeof require === 'function') return Array.from(require('crypto').createHmac('sha256', k).update(v).digest()); let h = 0; const s = k + '|' + v; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return utf8(String(h)); });
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function formatDate(d, tz, f) {
      const x = new RealDate(d.getTime() + 3 * 3600e3);
      const tok = { yyyy: x.getUTCFullYear(), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()), ss: pad(x.getUTCSeconds()),
        EEE: DAYS[x.getUTCDay()], MMM: MON[x.getUTCMonth()], d: x.getUTCDate() };
      return f.replace(/'([^']*)'|yyyy|MMM|MM|dd|HH|mm|ss|EEE|d/g, (m, lit) => lit !== undefined ? lit : tok[m]);
    }
    function makeEvent(id, title, start, end, o) {
      const ev = { id, title, start, end, guests: [].concat(o.guests ? String(o.guests).split(',') : []), desc: o.description, deleted: false,
        getId: () => id, setTime(s, e) { ev.start = s; ev.end = e; }, setTitle(t) { ev.title = t; }, setDescription(t) { ev.desc = t; },
        addGuest(g) { ev.guests.push(g); }, removeGuest(g) { ev.guests = ev.guests.filter(x => x !== g); }, deleteEvent() { ev.deleted = true; delete st.events[id]; } };
      return ev;
    }
    const cal = { getId: () => 'CAL1', createEvent(t, s, e, o) { const id = 'ev' + (++st.evSeq); st.events[id] = makeEvent(id, t, s, e, o || {}); return st.events[id]; }, getEventById: id => st.events[id] || null };
    const ctx = {
      SpreadsheetApp: { create: () => ss, openById: () => ss },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in st.props ? st.props[k] : null), setProperty: (k, v) => { st.props[k] = String(v); }, deleteProperty: k => { delete st.props[k]; } }) },
      Session: { getActiveUser: () => ({ getEmail: () => st.activeEmail }), getEffectiveUser: () => ({ getEmail: () => 'coo@edenalkhalij.com' }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Utilities: {
        getUuid: () => 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, () => (Math.random() * 16 | 0).toString(16)), formatDate,
        Charset: { UTF_8: 'UTF-8' },
        base64EncodeWebSafe: (v) => b64(typeof v === 'string' ? utf8(v) : v).replace(/\+/g, '-').replace(/\//g, '_'),
        base64DecodeWebSafe: (s) => unb64(String(s).replace(/-/g, '+').replace(/_/g, '/')),
        computeHmacSha256Signature: (v, k) => hmac(v, k),
        newBlob: (bytes, mime, name) => ({ getDataAsString: () => fromUtf8(bytes), getBytes: () => bytes, getContentType: () => mime || 'application/octet-stream', getName: () => name }),
        base64Decode: (s) => unb64(String(s)),
        base64Encode: (b) => b64(Array.from(b)),
      },
      DriveApp: (function () {
        const files = st.drive = {}; let seq = 0;
        const mk = (blob) => { const id = 'f' + (++seq); const f = { id, blob, trashed: false, desc: '', getId: () => id, getBlob: () => blob, setDescription(d) { f.desc = d; }, setTrashed(v) { f.trashed = v; } }; files[id] = f; return f; };
        const folder = { getId: () => 'FOLDER', createFile: (blob) => mk(blob) };
        return { createFolder: () => folder, getFolderById: () => folder, getFileById: (id) => { if (!files[id]) throw new Error('no file'); return files[id]; } };
      })(),
      CacheService: { getScriptCache: () => ({ get: k => { const v = st.cache[k]; return v && v.exp > now() ? v.val : null; }, put: (k, v, s) => { st.cache[k] = { val: v, exp: now() + (s || 600) * 1000 }; }, remove: k => { delete st.cache[k]; } }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) },
      MailApp: { sendEmail: o => st.mails.push(o) },
      UrlFetchApp: { fetch: url => { st.fetches.push(url); return st.meta ? st.meta(url) : { getContentText: () => '{"data":[]}', getResponseCode: () => 200 }; } },
      CalendarApp: { getCalendarById: id => (id === 'CAL1' ? cal : null), createCalendar: () => cal, Color: { TEAL: 'teal' } },
      ScriptApp: { getProjectTriggers: () => st.triggers, deleteTrigger: t => { st.triggers = st.triggers.filter(x => x !== t); },
        newTrigger: fn => { const b = { timeBased: () => b, everyMinutes: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b, create: () => st.triggers.push({ getHandlerFunction: () => fn }) }; return b; },
        getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/edenalkhalij.com/s/X/exec' }) },
      HtmlService: {}, Logger: { log() {} },
    };
    return { ctx, st, ss };
  }
  if (typeof module !== 'undefined') module.exports = makeEnv; else root.makeEnv = makeEnv;
})(this);
