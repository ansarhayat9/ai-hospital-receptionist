# Architecture

## Components

| Component | Responsibility |
|---|---|
| **ElevenLabs Agent** | Holds the phone conversation, understands speech, decides when to call a tool, and speaks the result. The only place a language model runs during a call. |
| **n8n webhooks (6 workflows)** | Receive tool calls, validate input, apply the hospital rules, and return clean JSON with a `status` and a `message`. |
| **Google Calendar** | Source of truth for what is booked (calendar `Hospital Appointments`). |
| **Google Sheets** | Hospital rules and records: doctors, holidays, settings, appointment log, callback list. |
| **Gmail** | Patient confirmation emails and reception callback alerts. |

## Call flow

```mermaid
sequenceDiagram
    participant P as Caller
    participant A as ElevenLabs Agent
    participant N as n8n
    participant G as Google Calendar / Sheets / Gmail
    P->>A: "I need a cardiologist"
    A->>N: check_availability(department)
    N->>G: read settings, doctors, holidays, calendar events
    N-->>A: earliest open slots (status: ok)
    A-->>P: offers up to three slots
    P->>A: picks a slot, gives details, says yes
    A->>N: book_appointment(slot, patient details)
    N->>G: re-check the slot, create the calendar event, log the row
    N-->>A: status: booked
    A-->>P: confirms the booking
    N->>G: send the confirmation email
```

## The workflows

| Workflow | Webhook path | Nodes | What it does |
|---|---|---|---|
| 1. Check availability | `POST /check-availability` | 8 | Prepare Request, read Settings, Doctors, Holidays, and Calendar events, then Find Slots returns open slots or a clear reason why not. |
| 2. Book appointment | `POST /book-appointment` | 15 | Validates, re-checks the slot against the calendar, creates the event, logs the row, responds, then emails the patient. |
| 3. Request callback | `POST /request-callback` | 9 | Validates, logs the request, responds, then alerts reception. |
| 4. Manage appointment | `POST /manage-appointment?action=find\|cancel\|reschedule` | 17 | Finds the appointment from its ID, verifies the phone number, then looks it up, cancels it, or moves it. Updates the sheet and sends a notice. |
| 5. Hospital info | `POST /get-hospital-info` | 5 | Answers general questions from the `Hospital_Info` tab only. |
| 6. Error alert | n8n Error Trigger | 2 | Emails the developer when any other workflow fails. |

### Changing an appointment (workflow 4)

```mermaid
flowchart TD
    W["Webhook<br/>(action in the URL)"] --> P["Prepare Request"]
    P --> R["Read Settings, Doctors, Holidays,<br/>Calendar events for the days involved"]
    R --> X["Process Request<br/>find by ID, verify phone, apply the rules"]
    X --> Q{"Needs a change?"}
    Q -->|"no: find, or any refusal"| A["Respond with status"]
    Q -->|"yes"| C{"Cancel?"}
    C -->|"cancel"| D["Delete the calendar event"]
    C -->|"reschedule"| N["Create the new event"] --> D
    D --> U["Update the Appointments row<br/>(matched on appointment_id)"] --> Z["Respond: cancelled or rescheduled"] --> E["Email a notice if an email is on file"]
```

A reschedule creates the new event **before** deleting the old one, so a failure never leaves the patient without an appointment. The appointment ID stays the same.

Implementation notes that matter when you edit the workflows:

- **Execute Once** is switched on for the sheet and calendar read nodes that follow another read. Without it, a node would run once per row of the previous node.
- **Always Output Data** is switched on for nodes that can legitimately return nothing (an empty Holidays tab, a day with no calendar events). Without it, the workflow would stop silently.
- The booking workflow sends its answer (**Respond Booked**) *before* the confirmation email, so the caller never waits for Gmail.
- All rule logic lives in Code nodes (readable copies in [`src/code-nodes`](../src/code-nodes)). There is no language model inside n8n.

## Data model

**Google Calendar event** (created by the booking workflow)

- Title: `<Doctor name> - <Patient name>`
- Description lines: `appointment_id`, `doctor_id`, `phone`, `email` (when given), `patient_type`, `visit`, `booked_by` (a reschedule adds `rescheduled_from`)
- A slot counts as busy for a doctor when an event overlaps it and its title contains the doctor's name or its description contains `doctor_id: <id>`. A manual event such as `Dr. Sana Malik - Leave` therefore blocks that doctor.

**Google Sheets tabs** (see `data/city-care-hospital-sheet-template.xlsx`)

| Tab | Columns |
|---|---|
| Doctors | doctor_id, name, department, working_days, start_time, end_time, slot_minutes |
| Appointments | appointment_id, created_at, patient_name, phone, email, patient_type, visit_category, doctor_id, doctor_name, department, date, start, end, calendar_event_id, status, source |
| Callbacks | callback_id, created_at, patient_name, phone, reason, status, handled_by |
| Holidays | date, description |
| Settings | key, value (hospital_name, timezone, min_lead_minutes, max_advance_days, change_cutoff_minutes, slots_offered, emergency_number, reception_email) |
| Hospital_Info | topic, keywords, answer |

All cells are plain text so phone numbers keep their leading zero and times stay as `09:00`.

## Business rules (as implemented)

- Time zone is fixed to Asia/Karachi (UTC+5, no daylight saving).
- Slots are generated per doctor from `working_days`, `start_time`, `end_time`, and `slot_minutes`.
- Nothing is offered or booked in the past, closer than `min_lead_minutes` (default 120), or beyond `max_advance_days` (default 30).
- Holidays listed in the Holidays tab are closed for everyone.
- Up to `slots_offered` (default 3) slots are returned. If the requested part of the day is full, other times that day are offered; if the day is full, the next day with openings (within the next two weeks) is returned.
- With no date, the earliest openings from today are returned.
- The same phone number cannot hold two appointments with the same doctor on the same day.
- Appointment IDs look like `APT-20261027-314`: the date plus a random three-digit number that is unique among that day's events.
- Phone numbers are reduced to digits (Urdu and Arabic numerals are converted) and must have 10 to 13 digits. Names are stripped of control characters and angle brackets. An invalid email is ignored and the booking still succeeds.
- **Changing appointments:** the appointment ID encodes its date (`APT-YYYYMMDD-NNN`), but a reschedule moves the event while keeping the ID, so the date inside the ID is only checked for format. The appointment is found by reading the next 45 days of calendar events (`WINDOW_DAYS` in the Prepare Request node; keep it above `max_advance_days`). The caller must give the ID and the phone number it was booked with (the last 10 digits are compared). A wrong ID and a wrong phone number produce the same `not_found` message, so nothing is revealed about which one was wrong.
- An appointment cannot be cancelled or moved when it starts within `change_cutoff_minutes` (default 120) or is in the past; the caller is offered a callback instead.
- A reschedule applies the same rules as a new booking (working day, holidays, slot grid, lead time, busy slots, duplicates), ignoring the appointment's own event.
- **Hospital information** comes only from the `Hospital_Info` tab. The best row is chosen by matching the caller's topic against each row's topic and keywords; if nothing matches well, the tool says so and the agent offers a callback.
