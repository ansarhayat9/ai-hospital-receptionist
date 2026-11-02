# Changelog

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
