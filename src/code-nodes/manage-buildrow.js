// Build Update Row: the columns to change in the Appointments sheet (matched on appointment_id)
const info = $('Process Request').first().json;
if (info.route === 'cancel') return [{ json: info.row }];
const created = $('Create New Event').first().json;
return [{ json: Object.assign({}, info.row, { calendar_event_id: created.id || '' }) }];
