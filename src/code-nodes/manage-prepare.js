// Prepare Request: which action (from the URL), clean the inputs, and decide which days to read from Google Calendar
const input = $input.first().json;
const raw = input.body || {};
const query = input.query || {};
let action = clean(query.action || raw.action).toLowerCase();
if (['find', 'cancel', 'reschedule'].indexOf(action) < 0) action = '';

// Appointment ID: keep only the digits, then rebuild APT-YYYYMMDD-NNN (tolerates "A P T dash 2 0 2 6 ...")
const idDigits = digitsOnly(raw.appointment_id);
let appointment_id = '';
let idDate = '';
if (idDigits.length === 11) {
  const d = idDigits.slice(0, 4) + '-' + idDigits.slice(4, 6) + '-' + idDigits.slice(6, 8);
  if (isRealDate(d)) {
    appointment_id = 'APT-' + idDigits.slice(0, 8) + '-' + idDigits.slice(8);
    idDate = d;
  }
}
const phone = digitsOnly(raw.phone);
const newDate = clean(raw.new_date);
const newDateOk = isRealDate(newDate);
const newMin = parseHM(raw.new_start_time);

// The calendar window: from today to WINDOW_DAYS ahead (or the new date, if later).
// The appointment's own date is NOT used, because a reschedule moves the event but keeps the ID.
const WINDOW_DAYS = 45; // keep this at least max_advance_days + 1
const today = nowKarachi().date;
let hi = addDays(today, WINDOW_DAYS);
if (action === 'reschedule' && newDateOk && newDate > hi) hi = newDate;

return [{
  json: {
    action: action,
    appointment_id: appointment_id,
    id_date: idDate,
    phone: phone,
    new_date: newDateOk ? newDate : '',
    new_start: newMin === null ? '' : hm(newMin),
    timeMin: today + 'T00:00:00+05:00',
    timeMax: addDays(hi, 1) + 'T00:00:00+05:00'
  }
}];
