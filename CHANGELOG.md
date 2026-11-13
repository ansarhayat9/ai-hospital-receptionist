# Changelog

## 2.0.3 - 2026-11-12

- Workflows renamed to match their files (1 to 6) and re-exported clean, with no credentials
- Added `tests/stage_test_appointment.py`: stage a test appointment through n8n so agent tests spend no credits on setup
- Docs: explained why the three appointment tools must end with `?action=...`, and how to check it; screenshot placeholders for the README

## 2.0.2 - 2026-11-11

- Fix: after a reschedule to a **different day**, find and cancel could no longer locate the appointment, because they looked only at the date inside the ID. The appointment is now found by searching the next 45 days of the calendar. Same-day reschedules had hidden the problem in the earlier live tests
- Tests: 92 offline logic checks and 43 live tests, with regression tests for cross-day reschedules

## 2.0.1 - 2026-11-10

Fixes found by the first full live run.

- Hospital info: a short keyword such as "er" could match inside another word ("helicopter"). Keywords now match whole words only
- Reschedule: when the chosen slot is taken, the alternatives no longer include the caller's own current time
- Tests: 88 offline logic checks, with regression tests for both fixes

## 2.0.0 - 2026-11-03

Cancel, reschedule, and hospital information.

- New workflow **manage-appointment**: find, cancel, and reschedule an appointment from its ID and phone number (one webhook, action in the URL)
- New workflow **get-hospital-info**: answers (visiting hours, location, timings, and so on) only from a `Hospital_Info` sheet tab
- New workflow **error-alert**: emails the developer when a workflow fails
- Bookings now store the patient's email in the calendar event so change notices can be emailed
- Agent prompt: sections for changing or cancelling and for hospital information; seven webhook tools
- New setting `change_cutoff_minutes`; new sheet tab `Hospital_Info`
- Tests: 85 offline logic checks (was 50) and 38 live tests (was 23)

## 1.0.0 - 2026-10-31

First complete version.

- Voice agent with three n8n tools: check availability, book appointment, request callback
- Earliest-openings lookup when the caller has not chosen a day
- Doctor or department validated before the date; no doctor list in the prompt
- Grouped detail collection with a single read-back before booking
- Emergency handling, no medical advice, callback fallback
- Google Calendar as the source of truth; Sheets for rules and records; Gmail confirmations
- English and Urdu configuration (Urdu numerals normalised to digits)
- 50 offline logic checks and 23 live integration tests
