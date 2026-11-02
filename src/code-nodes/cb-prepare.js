// Prepare Request: check the callback details and prepare the sheet row and the staff email
const raw = ($input.first().json.body) || {};
const name = clean(raw.patient_name).replace(/[\u0000-\u001f<>]/g, '').slice(0, 80);
const phone = clean(raw.phone).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
const reason = clean(raw.reason).replace(/[\u0000-\u001f<>]/g, '').slice(0, 200);
const errors = [];
if (name.length < 2) errors.push('patient_name is missing');
if (phone.length < 10 || phone.length > 13) errors.push('phone must have 10 to 13 digits');
if (!reason) errors.push('reason is missing');

if (errors.length) {
  return [{ json: { valid: false, response: { status: 'invalid', message: 'Some details are missing or invalid: ' + errors.join('; ') + '.' } } }];
}

const now = nowKarachi();
const id = 'CB-' + now.date.replace(/-/g, '') + '-' + String(Math.floor(1000 + Math.random() * 9000));
return [{
  json: {
    valid: true,
    response: { status: 'logged', callback_id: id, message: 'Callback request saved. The reception team will call back.' },
    row: { callback_id: id, created_at: now.stamp, patient_name: name, phone: phone, reason: reason, status: 'new', handled_by: '' },
    email_subject: 'New callback request: ' + name,
    email_html: '<p>A caller asked for a callback.</p><ul><li><b>ID:</b> ' + id + '</li><li><b>Name:</b> ' + escapeHtml(name) + '</li><li><b>Phone:</b> ' + phone + '</li><li><b>Reason:</b> ' + escapeHtml(reason) + '</li><li><b>Time:</b> ' + now.stamp + ' (Asia/Karachi)</li></ul>'
  }
}];
