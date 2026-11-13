// Offline logic tests for the n8n Code nodes (no n8n, no internet, no credits needed).
// Run from the repository root:  node tests/logic/harness.js
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'src', 'code-nodes');
const lib = fs.readFileSync(path.join(DIR, 'lib.js'), 'utf8');

function run(file, ctx) {
  const extra = file.startsWith('manage-') ? '\n' + fs.readFileSync(path.join(DIR, 'lib-manage.js'), 'utf8') : '';
  const code = lib + extra + '\n' + fs.readFileSync(path.join(DIR, file), 'utf8');
  const fn = new Function('$input', '$', code);
  const wrap = rows => rows.map(r => ({ json: r }));
  const named = {};
  for (const k of Object.keys(ctx.nodes || {})) named[k] = wrap(ctx.nodes[k]);
  const dollar = name => ({ first: () => named[name][0], all: () => named[name] });
  const input = { first: () => wrap(ctx.input)[0], all: () => wrap(ctx.input) };
  return fn(input, dollar);
}

const settings = [
  { key: 'hospital_name', value: 'City Care Hospital' }, { key: 'min_lead_minutes', value: '120' },
  { key: 'max_advance_days', value: '30' }, { key: 'slots_offered', value: '3' }
];
const doctors = [
  { doctor_id: 'D01', name: 'Dr. Hamza Qureshi', department: 'General Medicine', working_days: 'Mon-Sat', start_time: '09:00', end_time: '14:00', slot_minutes: '15' },
  { doctor_id: 'D02', name: 'Dr. Ayesha Siddiqui', department: 'Pediatrics', working_days: 'Mon-Fri', start_time: '10:00', end_time: '15:00', slot_minutes: '20' },
  { doctor_id: 'D03', name: 'Dr. Sana Malik', department: 'Cardiology', working_days: 'Mon, Tue, Thu', start_time: '10:00', end_time: '13:00', slot_minutes: '20' },
  { doctor_id: 'D04', name: 'Dr. Imran Haider', department: 'Orthopedics', working_days: 'Tue, Wed, Sat', start_time: '11:00', end_time: '16:00', slot_minutes: '20' }
];
const holidays = [{ date: '2026-10-22' }];
let pass = 0, fail = 0;
function expect(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// Freeze "now" at Saturday 17 Oct 2026, 12:00 Karachi (= 07:00 UTC) so results are repeatable
const RealDate = Date;
const FIXED = RealDate.UTC(2026, 9, 17, 7, 0, 0);
global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } };

function check(body, events) {
  const prep = run('check-prepare.js', { input: [{ body }] })[0].json;
  const out = run('check-find.js', { input: events || [{}], nodes: { 'Prepare Request': [prep], 'Get Settings': settings, 'Get Doctors': doctors, 'Get Holidays': holidays } });
  return out[0].json.response;
}

// ---- Tool 1: check availability ----
let r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'morning' });
expect('cardiology tue morning ok', [r.status, r.slots.map(s => s.start)], ['ok', ['10:00', '10:20', '10:40']]);
r = check({ department: 'cardiologist', preferred_date: '2026-10-20', time_of_day: 'morning' });
expect('cardiologist maps to cardiology', r.status, 'ok');
r = check({ doctor_name: 'Dr Qureshi', preferred_date: '2026-10-20', time_of_day: 'morning' });
expect('qureshi tue morning', [r.status, r.slots.map(s => s.start)], ['ok', ['09:00', '09:15', '09:30']]);
const busy = [{ summary: 'Dr. Sana Malik - Busy', start: { dateTime: '2026-10-20T10:00:00+05:00' }, end: { dateTime: '2026-10-20T10:20:00+05:00' } }];
r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'morning' }, busy);
expect('busy slot hidden', r.slots.map(s => s.start), ['10:20', '10:40', '11:00']);
const busyUtc = [{ summary: 'Dr. Sana Malik - Busy', start: { dateTime: '2026-10-20T05:00:00Z' }, end: { dateTime: '2026-10-20T05:20:00Z' } }];
r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'morning' }, busyUtc);
expect('utc event blocks too', r.slots[0].start, '10:20');
const other = [{ summary: 'Dr. Hamza Qureshi - Busy', start: { dateTime: '2026-10-20T10:00:00+05:00' }, end: { dateTime: '2026-10-20T10:20:00+05:00' } }];
r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'morning' }, other);
expect('other doctor event ignored', r.slots[0].start, '10:00');
r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'afternoon' });
expect('afternoon slots', [r.status, r.slots[0].start], ['ok', '12:00']);
const pm = [{ summary: 'Dr. Sana Malik - Busy', start: { dateTime: '2026-10-20T12:00:00+05:00' }, end: { dateTime: '2026-10-20T13:00:00+05:00' } }];
r = check({ department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'afternoon' }, pm);
expect('relaxed time of day', [r.status, r.slots[0].start, /Nothing was free/.test(r.message)], ['ok', '10:00', true]);
r = check({ doctor_name: 'Sana', preferred_date: '2026-10-21', time_of_day: 'any' });
expect('skips non-working day and holiday', [r.status, r.next_available_date], ['no_availability', '2026-10-26']);
r = check({ doctor_name: 'Hamza', preferred_date: '2026-10-22', time_of_day: 'any' });
expect('holiday next day', [r.status, r.next_available_date], ['no_availability', '2026-10-23']);
r = check({ department: 'Cardiology', preferred_date: '2026-10-10' });
expect('past date', r.status, 'invalid_date');
r = check({ department: 'Cardiology', preferred_date: '2027-02-01' });
expect('beyond window', r.status, 'invalid_date');
r = check({ department: 'Cardiology', preferred_date: 'tomorrow' });
expect('bad date text', r.status, 'invalid_date');
r = check({ department: 'Dentistry', preferred_date: '2026-10-20' });
expect('unknown department', [r.status, r.available_departments.length], ['unknown_department', 4]);
r = check({ doctor_name: 'Zed', preferred_date: '2026-10-20' });
expect('unknown doctor', r.status, 'unknown_doctor');
r = check({ preferred_date: '2026-10-20' });
expect('nothing given', r.status, 'invalid');
r = check({ doctor_name: 'Hamza', preferred_date: '2026-10-17', time_of_day: 'any' });
expect('lead time today -> next day', [r.status, r.next_available_date], ['no_availability', '2026-10-19']);
const full = [{ summary: 'Dr. Sana Malik - Leave', start: { dateTime: '2026-10-20T00:00:00+05:00' }, end: { dateTime: '2026-10-20T23:00:00+05:00' } }];
r = check({ department: 'Cardiology', preferred_date: '2026-10-20' }, full);
expect('fully busy day', [r.status, r.next_available_date], ['no_availability', '2026-10-26']);
const weird = JSON.parse(JSON.stringify(doctors)); weird[2].start_time = '10:00:00 AM'; weird[2].end_time = '1:00:00 PM';
const prepW = run('check-prepare.js', { input: [{ body: { department: 'Cardiology', preferred_date: '2026-10-20', time_of_day: 'any' } }] })[0].json;
const outW = run('check-find.js', { input: [{}], nodes: { 'Prepare Request': [prepW], 'Get Settings': settings, 'Get Doctors': weird, 'Get Holidays': holidays } })[0].json.response;
expect('AM/PM time cells parse', outW.slots.map(s => s.start), ['10:00', '10:20', '10:40']);

// ---- Tool 1: early lookup without a date, validation order ----
r = check({ department: 'Cardiology' });
expect('no date -> earliest openings', [r.status, r.earliest, r.slots.length], ['ok', true, 3]);
r = check({ doctor_name: 'Qureshi' });
expect('no date, doctor -> earliest', [r.status, r.earliest], ['ok', true]);
r = check({ department: 'Dentistry' });
expect('no date, unknown department', [r.status, r.available_departments.length], ['unknown_department', 4]);
r = check({ doctor_name: 'Zed' });
expect('no date, unknown doctor -> departments, no doctor list', [r.status, r.available_departments.length, r.available_doctors === undefined], ['unknown_doctor', 4, true]);
r = check({ department: 'Dentistry', preferred_date: '2026-10-10' });
expect('unknown department beats past date', r.status, 'unknown_department');
r = check({});
expect('nothing at all lists departments', [r.status, r.available_departments.length], ['invalid', 4]);
r = check({ department: 'Cardiology', time_of_day: 'afternoon' });
expect('no date + afternoon', [r.status, r.slots[0].start], ['ok', '12:00']);
r = check({ department: 'Cardiology' }, [{ summary: 'Dr. Sana Malik - Leave', start: { dateTime: '2026-10-19T00:00:00+05:00' }, end: { dateTime: '2026-10-21T23:00:00+05:00' } }]);
expect('no date, early days blocked -> later day', [r.status, r.slots[0].date], ['ok', '2026-10-26']);
r = check({ department: 'Cardiology', preferred_date: '2026-10-20' });
expect('with date still works', [r.status, r.earliest], ['ok', undefined]);

// ---- Tool 2: book appointment ----
function book(body, events) {
  const prep = run('book-prepare.js', { input: [{ body }] })[0].json;
  const out = run('book-check.js', { input: events || [{}], nodes: { 'Prepare Request': [prep], 'Get Settings': settings, 'Get Doctors': doctors, 'Get Holidays': holidays } });
  return out[0].json;
}
const good = { doctor_id: 'D03', date: '2026-10-20', start_time: '10:20', patient_name: 'Ali Raza', phone: '0300 0000001', email: 'ali@example.com', patient_type: 'new', visit_category: 'general consultation' };
let b = book(good);
expect('book ok', [b.ok, b.response.status, b.response.start_display], [true, 'booked', '10:20 AM']);
expect('book id format', /^APT-20261020-\d{3}$/.test(b.response.appointment_id), true);
expect('event times', [b.event.start, b.event.end], ['2026-10-20T10:20:00+05:00', '2026-10-20T10:40:00+05:00']);
expect('row phone digits', b.row.phone, '03000000001');
const bookedEvent = [{ summary: b.event.summary, description: b.event.description, start: { dateTime: b.event.start }, end: { dateTime: b.event.end } }];
let b2 = book(good, bookedEvent);
expect('same slot -> slot_taken', [b2.ok, b2.response.status], [false, 'slot_taken']);
b2 = book(Object.assign({}, good, { start_time: '10:40' }), bookedEvent);
expect('same phone other time -> duplicate', b2.response.status, 'duplicate');
b2 = book(Object.assign({}, good, { start_time: '10:40', phone: '03111111111' }), bookedEvent);
expect('other patient other time -> booked', b2.response.status, 'booked');
expect('bad grid time', book(Object.assign({}, good, { start_time: '10:25' })).response.status, 'invalid');
expect('outside hours', book(Object.assign({}, good, { start_time: '16:00' })).response.status, 'invalid');
expect('holiday', book(Object.assign({}, good, { date: '2026-10-22' })).response.status, 'invalid');
expect('wrong weekday for doctor', book(Object.assign({}, good, { date: '2026-10-21' })).response.status, 'invalid');
expect('past date', book(Object.assign({}, good, { date: '2026-10-10' })).response.status, 'invalid');
expect('too soon', book({ doctor_id: 'D01', date: '2026-10-17', start_time: '13:00', patient_name: 'Ali Raza', phone: '03000000001' }).response.status, 'invalid');
expect('missing name', book(Object.assign({}, good, { patient_name: '' })).response.status, 'invalid');
expect('bad phone', book(Object.assign({}, good, { phone: '123' })).response.status, 'invalid');
expect('unknown doctor id', book(Object.assign({}, good, { doctor_id: 'D99' })).response.status, 'invalid');
b = book(Object.assign({}, good, { email: 'not-an-email' }));
expect('bad email ignored, still booked', [b.response.status, b.email], ['booked', '']);
b = book(Object.assign({}, good, { patient_name: 'Ali <b>Raza</b>' }));
expect('html stripped from name', b.row.patient_name, 'Ali bRaza/b');
b = book(Object.assign({}, good, { phone: '\u06F0\u06F3\u06F0\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7' }));
expect('urdu numerals converted to digits', b.row.phone, '03001234567');

// ---- Build row + Tool 3: callback ----
const br = run('book-buildrow.js', { input: [{ id: 'evt123' }], nodes: { 'Check Slot and Build': [book(good)] } })[0].json;
expect('row has event id and 16 columns', [br.calendar_event_id, Object.keys(br).length], ['evt123', 16]);
let c = run('cb-prepare.js', { input: [{ body: { patient_name: 'Sara Ali', phone: '03001234567', reason: 'billing question' } }] })[0].json;
expect('callback ok', [c.valid, c.response.status, Object.keys(c.row).length], [true, 'logged', 7]);
c = run('cb-prepare.js', { input: [{ body: { patient_name: '', phone: '1', reason: '' } }] })[0].json;
expect('callback invalid', [c.valid, c.response.status], [false, 'invalid']);


// ---- Version 2: manage appointment (find, cancel, reschedule) ----
function manage(action, body, events) {
  const prep = run('manage-prepare.js', { input: [{ query: { action }, body }] })[0].json;
  const out = run('manage-process.js', { input: events || [{}], nodes: { 'Prepare Request': [prep], 'Get Settings': settings, 'Get Doctors': doctors, 'Get Holidays': holidays } });
  return { prep, res: out[0].json };
}
const mineEv = { id: 'evt1', summary: 'Dr. Sana Malik - Ali Raza',
  description: 'appointment_id: APT-20261020-314\ndoctor_id: D03\nphone: 03001234567\nemail: ali@example.com\npatient_type: new\nvisit: general consultation\nbooked_by: voice agent',
  start: { dateTime: '2026-10-20T10:20:00+05:00' }, end: { dateTime: '2026-10-20T10:40:00+05:00' } };
const okIds = { appointment_id: 'APT-20261020-314', phone: '03001234567' };

let m = manage('find', okIds, [mineEv]);
expect('find: verified appointment', [m.res.response.status, m.res.response.doctor_name, m.res.response.start_display, m.res.response.can_change], ['found', 'Dr. Sana Malik', '10:20 AM', true]);
m = manage('find', { appointment_id: 'A P T dash 2 0 2 6 1 0 2 0 dash 3 1 4', phone: '+92 300 1234567' }, [mineEv]);
expect('find: spoken id and +92 phone still match', m.res.response.status, 'found');
m = manage('find', { appointment_id: 'APT-\u06F2\u06F0\u06F2\u06F6\u06F1\u06F0\u06F2\u06F0-\u06F3\u06F1\u06F4', phone: '\u06F0\u06F3\u06F0\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7' }, [mineEv]);
expect('find: Urdu numerals in id and phone', m.res.response.status, 'found');
m = manage('find', { appointment_id: 'APT-20261020-3144', phone: '03001234567' }, [mineEv]);
expect('find: too many digits -> invalid', m.res.response.status, 'invalid');
m = manage('find', { appointment_id: 'APT-20261020-314', phone: '03009999999' }, [mineEv]);
expect('find: wrong phone -> not_found', m.res.response.status, 'not_found');
m = manage('find', { appointment_id: 'APT-20261020-999', phone: '03001234567' }, [mineEv]);
expect('find: wrong id -> same not_found message', [m.res.response.status, m.res.response.message === manage('find', { appointment_id: 'APT-20261020-314', phone: '03009999999' }, [mineEv]).res.response.message], ['not_found', true]);
m = manage('find', { appointment_id: 'APT-2026', phone: '03001234567' }, [mineEv]);
expect('find: incomplete id -> invalid', m.res.response.status, 'invalid');
m = manage('find', { appointment_id: 'APT-20261020-314', phone: '123' }, [mineEv]);
expect('find: short phone -> invalid', m.res.response.status, 'invalid');
m = manage('delete', okIds, [mineEv]);
expect('unknown action -> invalid', m.res.response.status, 'invalid');
m = manage('find', { appointment_id: 'APT-20261010-100', phone: '03001234567' }, [mineEv]);
expect('find: old appointment with no upcoming event -> not_found', m.res.response.status, 'not_found');
const soonEv = Object.assign({}, mineEv, { description: mineEv.description.replace('20261020', '20261017'), start: { dateTime: '2026-10-17T13:00:00+05:00' }, end: { dateTime: '2026-10-17T13:15:00+05:00' } });
m = manage('cancel', { appointment_id: 'APT-20261017-314', phone: '03001234567' }, [soonEv]);
expect('cancel: inside the cutoff -> too_late', m.res.response.status, 'too_late');
m = manage('find', { appointment_id: 'APT-20261017-314', phone: '03001234567' }, [soonEv]);
expect('find: inside the cutoff shows can_change false', [m.res.response.status, m.res.response.can_change], ['found', false]);

m = manage('cancel', okIds, [mineEv]);
expect('cancel: ok', [m.res.route, m.res.response.status, m.res.event_id, m.res.row, m.res.email], ['cancel', 'cancelled', 'evt1', { appointment_id: 'APT-20261020-314', status: 'cancelled' }, 'ali@example.com']);
m = manage('cancel', { appointment_id: 'APT-20261020-314', phone: '03009999999' }, [mineEv]);
expect('cancel: wrong phone -> not_found, nothing deleted', [m.res.route, m.res.response.status], ['reply', 'not_found']);
m = manage('cancel', okIds, [Object.assign({}, mineEv, { status: 'cancelled' })]);
expect('cancel: already-cancelled event is ignored', m.res.response.status, 'not_found');

const rs = (extra) => manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:00' }, extra || {}), [mineEv].concat((extra && extra.__events) || []));
m = rs();
expect('reschedule: ok', [m.res.route, m.res.response.status, m.res.response.start_display, m.res.new_event.start, m.res.new_event.end, m.res.row.status], ['reschedule', 'rescheduled', '10:00 AM', '2026-10-27T10:00:00+05:00', '2026-10-27T10:20:00+05:00', 'rescheduled']);
expect('reschedule: description keeps id and notes the old time', [/appointment_id: APT-20261020-314/.test(m.res.new_event.description), /rescheduled_from: 2026-10-20 10:20/.test(m.res.new_event.description)], [true, true]);
expect('reschedule: window starts today and covers the next 45 days', [m.prep.timeMin, m.prep.timeMax], ['2026-10-17T00:00:00+05:00', '2026-12-02T00:00:00+05:00']);
const farRs = manage('reschedule', Object.assign({}, okIds, { new_date: '2027-03-01', new_start_time: '10:00' }), [mineEv]);
expect('reschedule: window extends to a later new date', farRs.prep.timeMax, '2027-03-02T00:00:00+05:00');
const movedEv = Object.assign({}, mineEv, { start: { dateTime: '2026-10-27T10:00:00+05:00' }, end: { dateTime: '2026-10-27T10:20:00+05:00' }, description: mineEv.description + '\nrescheduled_from: 2026-10-20 10:20' });
m = manage('find', okIds, [movedEv]);
expect('find after a cross-day reschedule: ID date differs from the event date', [m.res.response.status, m.res.response.date, m.res.response.start_display], ['found', '2026-10-27', '10:00 AM']);
m = manage('cancel', okIds, [movedEv]);
expect('cancel after a cross-day reschedule', [m.res.route, m.res.response.status, m.res.event_id], ['cancel', 'cancelled', 'evt1']);
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-29', new_start_time: '10:20' }), [movedEv]);
expect('second reschedule keeps a single rescheduled_from line', [m.res.response.status, (m.res.new_event.description.match(/rescheduled_from/g) || []).length, /rescheduled_from: 2026-10-27 10:00/.test(m.res.new_event.description)], ['rescheduled', 1, true]);
const takenEv = { id: 'evt2', summary: 'Dr. Sana Malik - Busy', description: 'doctor_id: D03', start: { dateTime: '2026-10-27T10:00:00+05:00' }, end: { dateTime: '2026-10-27T10:20:00+05:00' } };
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:00' }), [mineEv, takenEv]);
expect('reschedule: taken slot -> slot_taken with alternatives', [m.res.response.status, m.res.response.alternatives[0].start], ['slot_taken', '10:20']);
const takenSameDay = { id: 'evt4', summary: 'Dr. Sana Malik - Busy', description: 'doctor_id: D03', start: { dateTime: '2026-10-20T10:00:00+05:00' }, end: { dateTime: '2026-10-20T10:20:00+05:00' } };
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-20', new_start_time: '10:00' }), [mineEv, takenSameDay]);
expect('reschedule: same-day alternatives never include the current time', [m.res.response.status, m.res.response.alternatives.map(a => a.start)], ['slot_taken', ['10:40', '11:00', '11:20']]);
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-20', new_start_time: '10:20' }), [mineEv]);
expect('reschedule: same time -> invalid', m.res.response.status, 'invalid');
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-21', new_start_time: '10:00' }), [mineEv]);
expect('reschedule: doctor day off -> invalid', m.res.response.status, 'invalid');
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-22', new_start_time: '10:00' }), [mineEv]);
expect('reschedule: holiday -> invalid', m.res.response.status, 'invalid');
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:25' }), [mineEv]);
expect('reschedule: off the slot grid -> invalid', m.res.response.status, 'invalid');
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-10', new_start_time: '10:00' }), [mineEv]);
expect('reschedule: past new date -> invalid', m.res.response.status, 'invalid');
m = manage('reschedule', okIds, [mineEv]);
expect('reschedule: missing new slot -> invalid', m.res.response.status, 'invalid');
const otherMine = { id: 'evt3', summary: 'Dr. Sana Malik - Ali Raza', description: 'appointment_id: APT-20261027-500\ndoctor_id: D03\nphone: 03001234567', start: { dateTime: '2026-10-27T11:00:00+05:00' }, end: { dateTime: '2026-10-27T11:20:00+05:00' } };
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:00' }), [mineEv, otherMine]);
expect('reschedule: another booking same doctor same day -> duplicate', m.res.response.status, 'duplicate');
m = manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:00' }), [Object.assign({}, mineEv, { description: mineEv.description.replace('doctor_id: D03', 'doctor_id: D99') })]);
expect('reschedule: unknown doctor in the event -> error', m.res.response.status, 'error');
const br2 = run('manage-buildrow.js', { input: [{ id: 'newEvt' }], nodes: { 'Process Request': [manage('reschedule', Object.assign({}, okIds, { new_date: '2026-10-27', new_start_time: '10:00' }), [mineEv]).res], 'Create New Event': [{ id: 'newEvt' }] } })[0].json;
expect('build row (reschedule) carries the new calendar event id', [br2.appointment_id, br2.calendar_event_id, br2.date, br2.status], ['APT-20261020-314', 'newEvt', '2026-10-27', 'rescheduled']);
const br3 = run('manage-buildrow.js', { input: [{ success: true }], nodes: { 'Process Request': [manage('cancel', okIds, [mineEv]).res] } })[0].json;
expect('build row (cancel) only sets the status', br3, { appointment_id: 'APT-20261020-314', status: 'cancelled' });

// ---- Version 2: hospital info ----
const infoRows = [
  { topic: 'visiting hours', keywords: 'visitors, visiting time, attendants', answer: 'Visiting hours are 4 PM to 6 PM every day.' },
  { topic: 'location', keywords: 'address, where, directions, map', answer: 'City Care Hospital is on Example Road, Lahore.' },
  { topic: 'outpatient timings', keywords: 'opd, opening hours, timings, open', answer: 'Outpatient clinics run Monday to Saturday.' },
  { topic: 'emergency', keywords: 'emergency department, er, ambulance, urgent', answer: 'The emergency department is open 24 hours. Call 1122.' }
];
function info(topic, rows) {
  const prep = run('info-prepare.js', { input: [{ body: { topic } }] })[0].json;
  return run('info-find.js', { input: rows || infoRows, nodes: { 'Prepare Request': [prep] } })[0].json.response;
}
expect('info: exact topic', [info('visiting hours').status, info('Visiting Hours').answer], ['ok', 'Visiting hours are 4 PM to 6 PM every day.']);
expect('info: keyword match', info('what is your address').topic, 'location');
expect('info: opd timings', info('opd timings').topic, 'outpatient timings');
expect('info: unknown topic -> not_found', [info('helicopter landing').status, info('helicopter landing').available_topics.length], ['not_found', 4]);
expect('info: short keyword "er" does not match inside other words', [info('helicopter landing').status, info('computer repair').status], ['not_found', 'not_found']);
expect('info: short keyword "er" still matches as a whole word', info('the er').topic, 'emergency');
expect('info: empty topic -> invalid', info('').status, 'invalid');
expect('info: empty sheet -> not_found', info('visiting hours', [{}]).status, 'not_found');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
