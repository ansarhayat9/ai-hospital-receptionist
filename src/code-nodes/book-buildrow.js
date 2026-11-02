// Build Row: combine the booking details with the calendar event ID, in the exact order of the sheet columns
const info = $('Check Slot and Build').first().json;
const eventId = $input.first().json.id || '';
const r = info.row;
return [{
  json: {
    appointment_id: r.appointment_id,
    created_at: r.created_at,
    patient_name: r.patient_name,
    phone: r.phone,
    email: r.email,
    patient_type: r.patient_type,
    visit_category: r.visit_category,
    doctor_id: r.doctor_id,
    doctor_name: r.doctor_name,
    department: r.department,
    date: r.date,
    start: r.start,
    end: r.end,
    calendar_event_id: eventId,
    status: r.status,
    source: r.source
  }
}];
