# Design decisions

| Decision | Why | Trade-off |
|---|---|---|
| **The AI talks, code decides.** The language model only converses; plain logic in n8n finds slots and books. | Slot math, double-booking checks, and date rules must be exact and repeatable, and can be tested. | Rules must be written as code instead of being "learned". |
| **One language model, inside ElevenLabs only.** No model in n8n. | A second model during the call adds cost, delay, and another failure point for no benefit. | Post-call analysis (summaries, tagging) is left for a later version, where a cheap model can run after the call. |
| **Three small tools, not one big one.** Check, book, callback. | Each tool is simple to test and to describe to the agent. | Check and book share rules, so some logic exists in two workflows (see limitations). |
| **Check first, then re-check at booking time.** | Another caller could take the slot between the offer and the booking. | Costs one more calendar read; there is still no lock for two truly simultaneous calls. |
| **Google Calendar is the source of truth; Sheets hold rules and the log.** | One place for each kind of data. Staff can block a doctor by adding a calendar event. | Doctors are matched by name or `doctor_id` in the event text. |
| **Rules live in Sheets, not in the prompt.** | Working hours, durations, and holidays change without touching the agent. | The agent never sees the doctor list (see next row). |
| **No doctor list in the prompt; validate through the tool.** | A hospital may have hundreds of doctors; a prompt list does not scale and goes stale. | An early tool call (about 4 to 5 seconds) covers the lookup. |
| **Look up the doctor or department first, even without a date.** | "Book a dentist" gets an immediate "we don't have that" instead of a wasted date question, and a known doctor returns the earliest openings. | The date is optional in the tool, and the validation order is doctor, then date. |
| **Collect details in two grouped messages and read back once.** | Cut a booking from 7 caller replies to 3, which saves voice minutes and patience. | Longer prompt rules for partial answers and reminders. |
| **Email is optional; the appointment ID is spoken only when there is no email.** | Many callers have no email, and reading a 15-character ID costs time. | Callers without email need another channel (SMS or WhatsApp is on the roadmap). |
| **Emergency handling overrides everything.** A fixed script, a fixed number, no booking. | Safety beats completion. | The wording is prompt-based, so it is tested with scripted phrases. |
| **No medical advice and no symptom storage.** | Out of scope and a privacy risk. | Callers with symptoms are told the department neutrally and decide themselves. |
| **Tool inputs are always English letters and ASCII digits, even in Urdu.** | n8n matching and validation work on Latin text and digits. | The agent must transliterate; the workflows also convert Urdu numerals as a safety net. |
| **Answer the caller first, send the email afterwards.** | The caller never waits for Gmail. | If Gmail fails, the caller has already heard "booked" (the booking itself is safe). |
| **Test the logic before spending voice minutes.** Offline checks, live script, text chat, then a few voice calls. | Voice credits are limited and expensive. | Voice-only problems (misheard names, interruptions) are found late. |

## Known limitations

- **No locking.** Two callers booking the same slot at the same instant could both succeed. Acceptable for one clinic; a database or a queue would fix it.
- **Latency.** Each tool call takes about 4 to 5 seconds, mostly from sequential Google Sheets reads. Merging the reads or a small backend service would help.
- **Duplicated logic.** The slot rules exist in the check and book workflows. A shared sub-workflow or a single backend would remove the duplication.
- **Calendar matching by text.** All-day events are ignored when blocking slots.
- **Urdu.** Configured and covered by logic tests (numerals), but voice quality is not yet validated end to end.
- **Licensing and compliance.** The ElevenLabs free plan has no commercial license. A real hospital deployment needs a paid plan in the hospital's own account and a privacy review. This project is a demo with fictional data, not a medical device.
