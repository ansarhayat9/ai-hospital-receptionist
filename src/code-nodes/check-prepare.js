// Prepare Request: clean what the voice agent sent, and decide which days to ask Google Calendar about
const raw = ($input.first().json.body) || {};
const today = nowKarachi().date;
const date = clean(raw.preferred_date);
const noDate = date === '';                 // caller has not chosen a day yet -> we will find the earliest openings
const dateOk = !noDate && isRealDate(date);
let tod = clean(raw.time_of_day).toLowerCase();
if (['morning', 'afternoon', 'any'].indexOf(tod) < 0) tod = 'any';
const base = dateOk ? date : today;
return [{
  json: {
    department: clean(raw.department),
    doctor_name: clean(raw.doctor_name),
    date: dateOk ? date : '',
    no_date: noDate,
    time_of_day: tod,
    timeMin: base + 'T00:00:00+05:00',
    timeMax: addDays(base, 14) + 'T00:00:00+05:00'
  }
}];
