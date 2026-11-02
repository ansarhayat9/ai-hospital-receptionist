// ===== Helper functions (shared by the Code nodes in this workflow) =====
// Hospital timezone: Asia/Karachi = UTC+5 all year (no daylight saving)
const TZ_OFFSET_MIN = 300;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n) { return String(n).padStart(2, '0'); }
function clean(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// "09:00", "9:00:00", "9:00 AM" -> minutes since midnight (or null)
function parseHM(v) {
  const m = clean(v).toLowerCase().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function hm(mins) { return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60); }
function display12(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return h + ':' + pad(m) + ' ' + ap;
}
function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
function dateToMs(dateStr, mins) { // Karachi local date + minutes -> UTC milliseconds
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 0, 0) + mins * 60000 - TZ_OFFSET_MIN * 60000;
}
function weekday(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
}
function nowKarachi() {
  const ms = Date.now();
  const k = new Date(ms + TZ_OFFSET_MIN * 60000);
  return {
    ms: ms,
    date: k.getUTCFullYear() + '-' + pad(k.getUTCMonth() + 1) + '-' + pad(k.getUTCDate()),
    stamp: k.toISOString().slice(0, 19).replace('T', ' ')
  };
}
function niceDate(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return LONG_DAYS[dt.getUTCDay()] + ', ' + d + ' ' + LONG_MONTHS[mo - 1] + ' ' + y;
}
// "Mon-Sat", "Mon, Tue, Thu" -> Set of weekday numbers (0 = Sunday)
function parseDays(str) {
  const out = new Set();
  for (const part of clean(str).toLowerCase().split(',')) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes('-')) {
      const ab = p.split('-').map(x => DAY_NAMES.indexOf(x.trim().slice(0, 3)));
      if (ab[0] < 0 || ab[1] < 0) continue;
      let i = ab[0];
      out.add(i);
      while (i !== ab[1]) { i = (i + 1) % 7; out.add(i); }
    } else {
      const i = DAY_NAMES.indexOf(p.slice(0, 3));
      if (i >= 0) out.add(i);
    }
  }
  return out;
}
// Google Calendar event start/end -> milliseconds (null for all-day or empty items)
function evTime(v) {
  if (!v) return null;
  const s = typeof v === 'string' ? v : v.dateTime;
  if (!s) return null;
  const ms = Date.parse(s);
  return isNaN(ms) ? null : ms;
}
// Calendar events that block this doctor (title or description mentions the doctor)
function blockingEvents(events, doctor) {
  const name = clean(doctor.name).toLowerCase();
  const id = clean(doctor.doctor_id).toLowerCase();
  const out = [];
  for (const e of events) {
    const s = evTime(e.start);
    const en = evTime(e.end);
    if (s === null || en === null) continue;
    if (e.status === 'cancelled') continue;
    const text = (clean(e.summary) + ' ' + clean(e.description)).toLowerCase();
    if ((name && text.includes(name)) || (id && text.includes('doctor_id: ' + id))) out.push({ s: s, en: en });
  }
  return out;
}
// All free slots for one doctor on one date
function slotsForDay(doctor, dateStr, ctx) {
  if (ctx.holidays.has(dateStr)) return [];
  if (!parseDays(doctor.working_days).has(weekday(dateStr))) return [];
  const S = parseHM(doctor.start_time);
  const E = parseHM(doctor.end_time);
  const step = parseInt(doctor.slot_minutes, 10);
  if (S === null || E === null || !step || step <= 0) return [];
  const blocks = blockingEvents(ctx.events, doctor);
  const out = [];
  for (let t = S; t + step <= E; t += step) {
    const startMs = dateToMs(dateStr, t);
    const endMs = startMs + step * 60000;
    if (startMs < ctx.nowMs + ctx.minLead * 60000) continue;
    if (blocks.some(b => startMs < b.en && endMs > b.s)) continue;
    out.push({
      doctor_id: clean(doctor.doctor_id),
      doctor_name: clean(doctor.name),
      department: clean(doctor.department),
      date: dateStr,
      date_display: niceDate(dateStr),
      start: hm(t),
      start_display: display12(t),
      minutes: t
    });
  }
  return out;
}
function publicSlot(s) {
  return { doctor_id: s.doctor_id, doctor_name: s.doctor_name, department: s.department, date: s.date, date_display: s.date_display, start: s.start, start_display: s.start_display };
}
function describeSlots(slots) {
  const groups = new Map();
  for (const s of slots) {
    const k = s.doctor_name + '|' + s.date;
    if (!groups.has(k)) groups.set(k, { doc: s.doctor_name, date: s.date, times: [] });
    groups.get(k).times.push(s.start_display);
  }
  return Array.from(groups.values()).map(g => g.doc + ' on ' + niceDate(g.date) + ' at ' + g.times.join(', ')).join('; ');
}
function readSettings(rows) {
  const o = {};
  for (const r of rows) if (clean(r.key)) o[clean(r.key)] = clean(r.value);
  return o;
}
function intSetting(settings, key, def) {
  const v = parseInt(settings[key], 10);
  return isNaN(v) ? def : v;
}
function readHolidays(rows) {
  const set = new Set();
  for (const r of rows) {
    const m = clean(r.date).match(/\d{4}-\d{2}-\d{2}/);
    if (m) set.add(m[0]);
  }
  return set;
}
