# Tool API

All tools are `POST` requests with a JSON body to an n8n webhook. Every response is JSON with at least `status` and `message`. Replace `YOUR-N8N-HOST` with your own host and use the production URL (`/webhook/`).

## `POST /webhook/check-availability`

| Field | Required | Notes |
|---|---|---|
| `department` | One of department or doctor_name | Loose matching (`cardiologist` matches `Cardiology`) |
| `doctor_name` | One of department or doctor_name | Surname or first name is enough |
| `preferred_date` | No | `YYYY-MM-DD`. If empty, the earliest openings are returned |
| `time_of_day` | No | `morning`, `afternoon`, or `any` |

```json
{ "department": "Cardiology", "preferred_date": "2026-10-27", "time_of_day": "morning" }
```

```json
{
  "status": "ok",
  "slots": [
    { "doctor_id": "D03", "doctor_name": "Dr. Sana Malik", "department": "Cardiology",
      "date": "2026-10-27", "date_display": "Tuesday, 27 October 2026",
      "start": "10:00", "start_display": "10:00 AM" }
  ],
  "message": "Open slots: Dr. Sana Malik on Tuesday, 27 October 2026 at 10:00 AM, 10:20 AM, 10:40 AM."
}
```

| Status | Meaning |
|---|---|
| `ok` | Slots returned (`earliest: true` when no date was given) |
| `no_availability` | Nothing free; `next_available_date` and `next_available_slots` are included when found |
| `invalid_date` | Past date, beyond the booking window, or unreadable |
| `unknown_department` | Includes `available_departments` |
| `unknown_doctor` | Includes `available_departments` (doctor names are deliberately not listed) |
| `ambiguous_doctor` | Includes `matching_doctors` |
| `invalid` | Neither doctor nor department given; includes `available_departments` |

The doctor or department is validated before the date, so an unknown department is reported even when the date is also wrong.

## `POST /webhook/book-appointment`

| Field | Required | Notes |
|---|---|---|
| `doctor_id` | Yes | From the chosen slot, for example `D03` |
| `date` | Yes | `YYYY-MM-DD` |
| `start_time` | Yes | 24-hour `HH:MM`, on the doctor's slot grid |
| `patient_name` | Yes | At least 2 characters |
| `phone` | Yes | 10 to 13 digits; spaces, dashes, and Urdu numerals are accepted |
| `email` | No | Used for the confirmation email |
| `patient_type` | No | `new` (default) or `returning` |
| `visit_category` | No | Short label; defaults to `general consultation` |

```json
{ "status": "booked", "appointment_id": "APT-20261027-314", "doctor_name": "Dr. Sana Malik",
  "department": "Cardiology", "date": "2026-10-27", "start": "10:00",
  "message": "Booked with Dr. Sana Malik on Tuesday, 27 October 2026 at 10:00 AM. Appointment ID APT-20261027-314." }
```

| Status | Meaning |
|---|---|
| `booked` | Calendar event created, row logged |
| `slot_taken` | Someone else holds the slot; `alternatives` lists other times that day |
| `duplicate` | Same phone, doctor, and day already booked |
| `invalid` | Missing or malformed field, closed day, invalid slot time, or too soon |
| `error` | The doctor's schedule is not set up correctly |

## `POST /webhook/request-callback`

| Field | Required | Notes |
|---|---|---|
| `patient_name` | Yes | |
| `phone` | Yes | 10 to 13 digits |
| `reason` | Yes | Short; no medical details |

Responses: `{"status": "logged", "callback_id": "CB-20261027-1234", ...}` or `{"status": "invalid", ...}`.

## `POST /webhook/manage-appointment?action=find|cancel|reschedule`

One webhook, three actions chosen by the `action` query parameter. The caller identifies the appointment with its **ID and the phone number it was booked with**. The ID is tolerant of speech noise: only its digits are used (its date is checked for format only; the appointment is found by searching the next 45 days of the calendar) (`APT`, then an 8-digit date, then 3 digits), and Urdu or Arabic numerals are converted.

| Field | find | cancel | reschedule | Notes |
|---|---|---|---|---|
| `appointment_id` | yes | yes | yes | For example `APT-20261027-314` |
| `phone` | yes | yes | yes | 10 to 13 digits; the last 10 are compared |
| `new_date` | | | yes | `YYYY-MM-DD` |
| `new_start_time` | | | yes | 24-hour `HH:MM`, on the doctor's slot grid |

```json
{ "appointment_id": "APT-20261027-314", "phone": "03001234567" }
```

`find` success:

```json
{ "status": "found", "appointment_id": "APT-20261027-314", "doctor_id": "D03", "doctor_name": "Dr. Sana Malik",
  "department": "Cardiology", "date": "2026-10-27", "date_display": "Tuesday, 27 October 2026",
  "start": "10:00", "start_display": "10:00 AM", "can_change": true,
  "message": "Found: appointment with Dr. Sana Malik on Tuesday, 27 October 2026 at 10:00 AM (Cardiology)." }
```

| Status | Returned by | Meaning |
|---|---|---|
| `found` | find | Verified; `can_change` is false when the appointment starts within the cutoff |
| `cancelled` | cancel | The calendar event was deleted and the sheet row marked `cancelled` |
| `rescheduled` | reschedule | New event created, old one deleted, row updated; the ID is unchanged |
| `not_found` | all | No appointment matches that ID and phone number (same message for either mismatch) |
| `too_late` | cancel, reschedule | The appointment was found but starts within `change_cutoff_minutes` (or has already started) |
| `slot_taken` | reschedule | The new slot is busy; `alternatives` lists other times that day |
| `duplicate` | reschedule | The same phone already holds another appointment with that doctor that day |
| `invalid` | all | Incomplete ID, bad phone, missing new slot, closed day, off-grid time, too soon, or same time as now |
| `error` | reschedule | The doctor's schedule could not be found or is not set up correctly |

## `POST /webhook/get-hospital-info`

| Field | Required | Notes |
|---|---|---|
| `topic` | Yes | A short phrase, for example `visiting hours` or `what is your address` |

```json
{ "status": "ok", "topic": "visiting hours", "answer": "Visiting hours are 4 PM to 6 PM every day.", "message": "Visiting hours are 4 PM to 6 PM every day." }
```

Other statuses: `not_found` (includes `available_topics`) and `invalid` (empty topic). Answers come only from the `Hospital_Info` sheet.
