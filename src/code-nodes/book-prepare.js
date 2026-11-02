// Prepare Request: clean and check what the voice agent sent before we touch any calendar
const raw = ($input.first().json.body) || {};
const errors = [];

const doctor_id = clean(raw.doctor_id).toUpperCase();
if (!doctor_id) errors.push('doctor_id is missing');

const date = clean(raw.date);
const dateOk = isRealDate(date);
if (!dateOk) errors.push('date must be a real date like 2026-10-20');

const startMin = parseHM(raw.start_time);
if (startMin === null) errors.push('start_time must look like 10:20');

const patient_name = clean(raw.patient_name).replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
if (patient_name.length < 2) errors.push('patient_name is missing');

const phone = clean(raw.phone).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
if (phone.length < 10 || phone.length > 13) errors.push('phone must have 10 to 13 digits');

let email = clean(raw.email).toLowerCase();
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = '';

const pt = clean(raw.patient_type).toLowerCase();
const patient_type = (pt.includes('return') || pt.includes('follow')) ? 'returning' : 'new';
const visit_category = (clean(raw.visit_category) || 'general consultation').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60);

const base = dateOk ? date : nowKarachi().date;
return [{
  json: {
    errors: errors,
    doctor_id: doctor_id,
    date: dateOk ? date : '',
    start_time: startMin === null ? '' : hm(startMin),
    patient_name: patient_name,
    phone: phone,
    email: email,
    patient_type: patient_type,
    visit_category: visit_category,
    timeMin: base + 'T00:00:00+05:00',
    timeMax: addDays(base, 1) + 'T00:00:00+05:00'
  }
}];
