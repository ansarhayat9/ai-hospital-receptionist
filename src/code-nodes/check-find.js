// Find Slots: check the doctor or department first, then apply the hospital rules and return open slots
const prep = $('Prepare Request').first().json;
const settings = readSettings($('Get Settings').all().map(i => i.json));
const doctors = $('Get Doctors').all().map(i => i.json).filter(d => clean(d.doctor_id) && clean(d.name));
const holidays = readHolidays($('Get Holidays').all().map(i => i.json));
const events = $input.all().map(i => i.json);

const minLead = intSetting(settings, 'min_lead_minutes', 120);
const maxAdvance = intSetting(settings, 'max_advance_days', 30);
const howMany = intSetting(settings, 'slots_offered', 3);
const now = nowKarachi();
const maxDate = addDays(now.date, maxAdvance);

const reply = obj => [{ json: { response: obj } }];
const allDepartments = Array.from(new Set(doctors.map(d => clean(d.department))));

const norm = s => clean(s).toLowerCase().replace(/\bdr\b\.?/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const deptMatch = (a, b) => {
  const x = clean(a).toLowerCase();
  const y = clean(b).toLowerCase();
  return x.includes(y) || y.includes(x) || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5));
};

// 1) Who? Check the doctor or department BEFORE looking at the date
let pool = doctors;
const wantedDoc = norm(prep.doctor_name);
if (wantedDoc) {
  pool = doctors.filter(d => norm(d.name).includes(wantedDoc));
  if (pool.length === 0) {
    return reply({ status: 'unknown_doctor', available_departments: allDepartments, message: 'There is no doctor with that name. Tell the caller, and ask which department they need. Departments: ' + allDepartments.join(', ') + '.' });
  }
  if (pool.length > 1) {
    return reply({ status: 'ambiguous_doctor', matching_doctors: pool.map(d => clean(d.name)), message: 'More than one doctor matches. Ask the caller which one: ' + pool.map(d => clean(d.name)).join(' or ') + '.' });
  }
} else if (clean(prep.department)) {
  pool = doctors.filter(d => deptMatch(d.department, prep.department));
  if (pool.length === 0) {
    return reply({ status: 'unknown_department', available_departments: allDepartments, message: 'There is no such department. Tell the caller, and list these departments: ' + allDepartments.join(', ') + '.' });
  }
} else {
  return reply({ status: 'invalid', available_departments: allDepartments, message: 'Ask the caller for a department or a doctor name. Departments: ' + allDepartments.join(', ') + '.' });
}

// 2) When? Check the date only if the caller gave one
if (!prep.no_date) {
  if (!prep.date) return reply({ status: 'invalid_date', message: 'I could not understand that date. Ask the caller for a specific day.' });
  if (prep.date < now.date) return reply({ status: 'invalid_date', message: 'That date is in the past. Ask for a date from today onwards.' });
  if (prep.date > maxDate) return reply({ status: 'invalid_date', message: 'Appointments can only be booked up to ' + maxAdvance + ' days ahead. Ask for an earlier date.' });
}

const ctx = { holidays: holidays, events: events, nowMs: now.ms, minLead: minLead };
const slotsOn = d => pool.flatMap(doc => slotsForDay(doc, d, ctx)).sort((a, b) => a.minutes - b.minutes);
const byTime = (list, tod) => tod === 'morning' ? list.filter(s => s.minutes < 720) : tod === 'afternoon' ? list.filter(s => s.minutes >= 720) : list;

// 3a) No date given: find the earliest openings from today
if (prep.no_date) {
  const search = tod => {
    for (let i = 0; i <= 13; i++) {
      const d = addDays(now.date, i);
      if (d > maxDate) break;
      const day = byTime(slotsOn(d), tod);
      if (day.length > 0) return day;
    }
    return null;
  };
  let hit = search(prep.time_of_day);
  if (!hit && prep.time_of_day !== 'any') hit = search('any');
  if (hit) {
    const offer = hit.slice(0, howMany);
    return reply({ status: 'ok', earliest: true, slots: offer.map(publicSlot), message: 'Earliest openings: ' + describeSlots(offer) + '. The caller did not choose a day yet, so ask if one of these works or if they prefer another day.' });
  }
  return reply({ status: 'no_availability', message: 'No free slots in the next two weeks for this doctor or department. Offer to take a callback request.' });
}

// 3b) Date given: slots on that day, else the next day with openings
const all = slotsOn(prep.date);
let chosen = byTime(all, prep.time_of_day);
let relaxed = false;
if (chosen.length === 0 && all.length > 0 && prep.time_of_day !== 'any') { chosen = all; relaxed = true; }

if (chosen.length > 0) {
  const offer = chosen.slice(0, howMany);
  let msg = 'Open slots: ' + describeSlots(offer) + '.';
  if (relaxed) msg += ' Nothing was free in the requested part of the day, so these are other times that day.';
  return reply({ status: 'ok', slots: offer.map(publicSlot), message: msg });
}

for (let i = 1; i <= 13; i++) {
  const d2 = addDays(prep.date, i);
  if (d2 > maxDate) break;
  const s2 = slotsOn(d2);
  if (s2.length > 0) {
    const offer = s2.slice(0, howMany);
    return reply({
      status: 'no_availability',
      next_available_date: d2,
      next_available_slots: offer.map(publicSlot),
      message: 'No free slots on ' + niceDate(prep.date) + '. The next day with openings is ' + niceDate(d2) + ': ' + describeSlots(offer) + '.'
    });
  }
}
return reply({ status: 'no_availability', message: 'No free slots on ' + niceDate(prep.date) + ' or in the following two weeks. Offer to take a callback request.' });
