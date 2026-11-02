// Check Slot and Build: re-check everything right now, then prepare the booking
const prep = $('Prepare Request').first().json;
const settings = readSettings($('Get Settings').all().map(i => i.json));
const doctors = $('Get Doctors').all().map(i => i.json).filter(d => clean(d.doctor_id) && clean(d.name));
const holidays = readHolidays($('Get Holidays').all().map(i => i.json));
const events = $input.all().map(i => i.json);

const minLead = intSetting(settings, 'min_lead_minutes', 120);
const maxAdvance = intSetting(settings, 'max_advance_days', 30);
const hospital = settings.hospital_name || 'the hospital';
const now = nowKarachi();

const fail = (status, message, extra) => [{ json: { ok: false, response: Object.assign({ status: status, message: message }, extra || {}) } }];

if (prep.errors && prep.errors.length) return fail('invalid', 'Some details are missing or invalid: ' + prep.errors.join('; ') + '.');

const doctor = doctors.find(d => clean(d.doctor_id).toUpperCase() === prep.doctor_id);
if (!doctor) return fail('invalid', 'I could not find that doctor. Check availability again.');

if (prep.date < now.date) return fail('invalid', 'That date is in the past.');
if (prep.date > addDays(now.date, maxAdvance)) return fail('invalid', 'Appointments can only be booked up to ' + maxAdvance + ' days ahead.');
if (holidays.has(prep.date)) return fail('invalid', 'The hospital is closed on that date.');
if (!parseDays(doctor.working_days).has(weekday(prep.date))) return fail('invalid', clean(doctor.name) + ' does not see patients on that day.');

const S = parseHM(doctor.start_time);
const E = parseHM(doctor.end_time);
const step = parseInt(doctor.slot_minutes, 10);
const startMin = parseHM(prep.start_time);
if (S === null || E === null || !step) return fail('error', 'The doctor schedule is not set up correctly.');
if (startMin < S || startMin + step > E || (startMin - S) % step !== 0) return fail('invalid', 'That time is not a valid appointment slot. Check availability again.');

const startMs = dateToMs(prep.date, startMin);
const endMs = startMs + step * 60000;
if (startMs < now.ms + minLead * 60000) return fail('invalid', 'That time is too soon to book. Offer a later slot.');

const ctx = { holidays: holidays, events: events, nowMs: now.ms, minLead: minLead };
const blocks = blockingEvents(events, doctor);
if (blocks.some(b => startMs < b.en && endMs > b.s)) {
  const alts = slotsForDay(doctor, prep.date, ctx).slice(0, 3);
  return fail('slot_taken', 'That slot was just taken.' + (alts.length ? ' Other times that day: ' + describeSlots(alts) + '.' : ' No other times are free that day.'), { alternatives: alts.map(publicSlot) });
}

const did = clean(doctor.doctor_id).toLowerCase();
const duplicate = events.some(e => {
  if (evTime(e.start) === null) return false;
  const text = (clean(e.summary) + ' ' + clean(e.description)).toLowerCase();
  return text.includes('doctor_id: ' + did) && text.includes('phone: ' + prep.phone);
});
if (duplicate) return fail('duplicate', 'This phone number already has an appointment with this doctor on that day.');

const used = new Set();
for (const e of events) {
  const found = (clean(e.description)).match(/APT-\d{8}-\d{3}/g) || [];
  found.forEach(x => used.add(x));
}
const ymd = prep.date.replace(/-/g, '');
let id = '';
for (let i = 0; i < 50; i++) {
  id = 'APT-' + ymd + '-' + String(Math.floor(100 + Math.random() * 900));
  if (!used.has(id)) break;
}

const endMin = startMin + step;
const startText = hm(startMin);
const endText = hm(endMin);
const dateText = niceDate(prep.date);
const timeText = display12(startMin);
const dName = clean(doctor.name);
const dDept = clean(doctor.department);

const description = [
  'appointment_id: ' + id,
  'doctor_id: ' + clean(doctor.doctor_id),
  'phone: ' + prep.phone,
  'patient_type: ' + prep.patient_type,
  'visit: ' + prep.visit_category,
  'booked_by: voice agent'
].join('\n');

const response = {
  status: 'booked',
  appointment_id: id,
  doctor_name: dName,
  department: dDept,
  date: prep.date,
  date_display: dateText,
  start: startText,
  start_display: timeText,
  message: 'Booked with ' + dName + ' on ' + dateText + ' at ' + timeText + '. Appointment ID ' + id + '.'
};

const emailHtml =
  '<p>Hello ' + escapeHtml(prep.patient_name) + ',</p>' +
  '<p>Your appointment at ' + escapeHtml(hospital) + ' is confirmed.</p>' +
  '<ul>' +
  '<li><b>Appointment ID:</b> ' + id + '</li>' +
  '<li><b>Doctor:</b> ' + escapeHtml(dName) + ' (' + escapeHtml(dDept) + ')</li>' +
  '<li><b>Date:</b> ' + dateText + '</li>' +
  '<li><b>Time:</b> ' + timeText + '</li>' +
  '</ul>' +
  '<p>If you need to change or cancel this appointment, please call the hospital and quote your appointment ID.</p>' +
  '<p>' + escapeHtml(hospital) + '</p>';

return [{
  json: {
    ok: true,
    response: response,
    event: {
      start: prep.date + 'T' + startText + ':00+05:00',
      end: prep.date + 'T' + endText + ':00+05:00',
      summary: dName + ' - ' + prep.patient_name,
      description: description
    },
    email: prep.email,
    email_subject: 'Appointment confirmed: ' + dateText + ' at ' + timeText + ' (' + id + ')',
    email_html: emailHtml,
    row: {
      appointment_id: id,
      created_at: now.stamp,
      patient_name: prep.patient_name,
      phone: prep.phone,
      email: prep.email,
      patient_type: prep.patient_type,
      visit_category: prep.visit_category,
      doctor_id: clean(doctor.doctor_id),
      doctor_name: dName,
      department: dDept,
      date: prep.date,
      start: startText,
      end: endText,
      status: 'booked',
      source: 'voice-agent'
    }
  }
}];
