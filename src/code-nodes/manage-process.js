// Process Request: find the appointment, verify the caller, and decide what to do
const prep = $('Prepare Request').first().json;
const settings = readSettings($('Get Settings').all().map(i => i.json));
const doctors = $('Get Doctors').all().map(i => i.json).filter(d => clean(d.doctor_id) && clean(d.name));
const holidays = readHolidays($('Get Holidays').all().map(i => i.json));
const events = $input.all().map(i => i.json);

const minLead = intSetting(settings, 'min_lead_minutes', 120);
const cutoff = intSetting(settings, 'change_cutoff_minutes', 120);
const maxAdvance = intSetting(settings, 'max_advance_days', 30);
const hospital = settings.hospital_name || 'the hospital';
const now = nowKarachi();

const reply = (status, message, extra) => [{ json: { route: 'reply', response: Object.assign({ status: status, message: message }, extra || {}) } }];

if (!prep.action) return reply('invalid', 'Unknown request.');
if (!prep.appointment_id) return reply('invalid', 'The appointment ID is incomplete. Ask the caller to say all of it again: the letters APT, then the date, then three more digits.');
if (prep.phone.length < 10 || prep.phone.length > 13) return reply('invalid', 'The phone number must have 10 to 13 digits. Ask the caller for the full number they booked with.');
if (prep.action === 'reschedule' && (!prep.new_date || !prep.new_start)) return reply('invalid', 'A new date and time are needed. Offer slots with check_availability first, then use the chosen slot.');

// Find the appointment in the calendar (upcoming days only) and verify the phone number (same message for either mismatch)
const wantedId = prep.appointment_id.toUpperCase();
const mine = events.find(e => {
  if (evTime(e.start) === null || e.status === 'cancelled') return false;
  return descField(e.description, 'appointment_id').toUpperCase() === wantedId &&
         tail10(descField(e.description, 'phone')) === tail10(prep.phone);
});
if (!mine) return reply('not_found', 'I could not find an appointment with that ID and phone number. Ask the caller to check both and try once more. Do not say which one was wrong.');

const startMs = evTime(mine.start);
const st = toKarachi(startMs);
const doctorId = descField(mine.description, 'doctor_id');
const doctor = doctors.find(d => clean(d.doctor_id).toLowerCase() === doctorId.toLowerCase());
const doctorName = doctor ? clean(doctor.name) : (clean(mine.summary).split(' - ')[0] || 'the doctor');
const dept = doctor ? clean(doctor.department) : '';
const details = {
  appointment_id: wantedId,
  doctor_id: doctorId,
  doctor_name: doctorName,
  department: dept,
  date: st.date,
  date_display: niceDate(st.date),
  start: hm(st.mins),
  start_display: display12(st.mins)
};
const canChange = startMs >= now.ms + cutoff * 60000;
const email = descField(mine.description, 'email');
const current = doctorName + ' on ' + details.date_display + ' at ' + details.start_display;

if (prep.action === 'find') {
  return reply('found', 'Found: appointment with ' + current + (dept ? ' (' + dept + ')' : '') + '.' + (canChange ? '' : ' It starts too soon to change online.'),
    Object.assign({ can_change: canChange }, details));
}
if (!canChange) return reply('too_late', 'That appointment starts too soon to change online. Offer a callback request so reception can help.');

const wrapEmail = (headline, lines) =>
  '<p>Hello,</p><p>' + headline + '</p><ul>' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul>' +
  '<p>If you need help, please call the hospital and quote your appointment ID.</p><p>' + escapeHtml(hospital) + '</p>';

if (prep.action === 'cancel') {
  return [{
    json: {
      route: 'cancel',
      response: Object.assign({ status: 'cancelled', message: 'The appointment with ' + current + ' has been cancelled.' }, details),
      event_id: mine.id,
      email: email,
      email_subject: 'Appointment cancelled (' + wantedId + ')',
      email_html: wrapEmail('Your appointment has been cancelled.', [
        '<b>Appointment ID:</b> ' + wantedId, '<b>Doctor:</b> ' + escapeHtml(doctorName), '<b>Was on:</b> ' + details.date_display + ' at ' + details.start_display]),
      row: { appointment_id: wantedId, status: 'cancelled' }
    }
  }];
}

// ----- reschedule -----
if (!doctor) return reply('error', 'The doctor schedule for this appointment could not be found. Offer a callback request.');
const nd = prep.new_date;
const nmin = parseHM(prep.new_start);
if (nd < now.date) return reply('invalid', 'The new date is in the past.');
if (nd > addDays(now.date, maxAdvance)) return reply('invalid', 'Appointments can only be booked up to ' + maxAdvance + ' days ahead.');
if (holidays.has(nd)) return reply('invalid', 'The hospital is closed on that date.');
if (!parseDays(doctor.working_days).has(weekday(nd))) return reply('invalid', doctorName + ' does not see patients on that day.');
const S = parseHM(doctor.start_time);
const E = parseHM(doctor.end_time);
const step = parseInt(doctor.slot_minutes, 10);
if (S === null || E === null || !step) return reply('error', 'The doctor schedule is not set up correctly.');
if (nmin < S || nmin + step > E || (nmin - S) % step !== 0) return reply('invalid', 'That time is not a valid appointment slot. Check availability again.');
if (nd === st.date && nmin === st.mins) return reply('invalid', 'That is the same time as the current appointment.');
const newStartMs = dateToMs(nd, nmin);
if (newStartMs < now.ms + minLead * 60000) return reply('invalid', 'That time is too soon to book. Offer a later slot.');

const others = events.filter(e => e.id !== mine.id);
const newEndMs = newStartMs + step * 60000;
if (blockingEvents(others, doctor).some(b => newStartMs < b.en && newEndMs > b.s)) {
  const alts = slotsForDay(doctor, nd, { holidays: holidays, events: others, nowMs: now.ms, minLead: minLead }).filter(a => !(a.date === st.date && a.minutes === st.mins)).slice(0, 3);
  return reply('slot_taken', 'That slot was just taken.' + (alts.length ? ' Other times that day: ' + describeSlots(alts) + '.' : ' No other times are free that day.'), { alternatives: alts.map(publicSlot) });
}
const dupe = others.some(e => {
  const s = evTime(e.start);
  if (s === null || e.status === 'cancelled') return false;
  return toKarachi(s).date === nd &&
         descField(e.description, 'doctor_id').toLowerCase() === doctorId.toLowerCase() &&
         tail10(descField(e.description, 'phone')) === tail10(prep.phone);
});
if (dupe) return reply('duplicate', 'This phone number already has another appointment with this doctor on that day.');

const newDateText = niceDate(nd);
const newTimeText = display12(nmin);
const description = clean(mine.description).split('\n').filter(l => !/^\s*rescheduled_from:/i.test(l))
  .concat('rescheduled_from: ' + st.date + ' ' + hm(st.mins)).join('\n');
return [{
  json: {
    route: 'reschedule',
    response: {
      status: 'rescheduled', appointment_id: wantedId, doctor_name: doctorName, department: dept,
      date: nd, date_display: newDateText, start: hm(nmin), start_display: newTimeText,
      message: 'Moved to ' + doctorName + ' on ' + newDateText + ' at ' + newTimeText + '. The appointment ID stays ' + wantedId + '.'
    },
    event_id: mine.id,
    new_event: {
      start: nd + 'T' + hm(nmin) + ':00+05:00',
      end: nd + 'T' + hm(nmin + step) + ':00+05:00',
      summary: clean(mine.summary),
      description: description
    },
    email: email,
    email_subject: 'Appointment rescheduled (' + wantedId + ')',
    email_html: wrapEmail('Your appointment has been moved.', [
      '<b>Appointment ID:</b> ' + wantedId, '<b>Doctor:</b> ' + escapeHtml(doctorName) + (dept ? ' (' + escapeHtml(dept) + ')' : ''),
      '<b>Was:</b> ' + details.date_display + ' at ' + details.start_display, '<b>Now:</b> ' + newDateText + ' at ' + newTimeText]),
    row: { appointment_id: wantedId, date: nd, start: hm(nmin), end: hm(nmin + step), status: 'rescheduled' }
  }
}];
