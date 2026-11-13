# ElevenLabs agent configuration (Version 2)

Everything needed to recreate the agent. The conversation prompt lives in [`system-prompt.txt`](system-prompt.txt); paste it into the agent's **System prompt** field.

> Keep the live agent and `system-prompt.txt` identical. This file is the single source of truth for the agent's behavior.

## 1. Basics

| Setting | Value |
|---|---|
| Agent name | `city-care-receptionist` |
| Primary language | English |
| Additional language | Urdu (the first message is translated by the platform; review it) |
| System tools | **End conversation** on; **Detect language** on, set to "only at start of conversation" if the option is shown |
| LLM | Pick a fast, mid-priced model from the picker (it shows cost and latency). Very small models often fill tool parameters incorrectly. Model names change, so read the live list. |
| Voice | Any clear voice. Use a language-specific voice for Urdu. |
| Max call duration | About 4 minutes, so a forgotten call cannot drain credits |
| Dynamic variable | `{{system__time}}` is used in the prompt for the current date and time |

**First message (English)**

```
Thank you for calling City Care Hospital. I'm an AI assistant. How can I help you today?
```

**First message (Urdu)** — adjust the verb ending to match the voice

```
سٹی کیئر ہسپتال کو کال کرنے کا شکریہ۔ میں ایک اے آئی اسسٹنٹ ہوں۔ میں آپ کی کیا مدد کر سکتی ہوں؟
```

## 2. Tools (seven webhook tools)

Create each with **Tools → Add tool → Webhook**, method **POST**. Replace `YOUR-N8N-HOST` with your n8n host and use the **production** URL (it contains `/webhook/`, not `/webhook-test/`). All parameters are type **String** with value type **LLM Prompt**. Fill in the top-level body description as well; the form will not save without it.

The three appointment tools below share one n8n webhook (`manage-appointment`). The action is part of the URL (`?action=find`, `?action=cancel`, `?action=reschedule`), so the agent never has to send it.

> **Do not skip the `?action=...` part.** If the three tools all use the plain `/manage-appointment` address, n8n cannot tell them apart and every request is answered with an "unknown request" (the agent then wrongly says it couldn't find the appointment). After saving, reopen each tool and check the URL kept its ending. If your ElevenLabs version drops it, add a body parameter named `action` with a **constant** value (`find`, `cancel`, or `reschedule`) instead; the workflow accepts either.

### Advanced settings

| Setting | Lookups: check_availability, find_appointment, get_hospital_info, request_callback | Changes data: book_appointment, cancel_appointment, reschedule_appointment |
|---|---|---|
| Response timeout | 20 s | 30 s |
| Interruptions | Allow | Block (if offered) |
| Error handling | Auto | Auto |
| Pre-tool speech | Force | Force |
| Execution mode | Immediate | Immediate |
| Response filtering | All fields | All fields |

### `check_availability`

- URL: `https://YOUR-N8N-HOST/webhook/check-availability`
- Description: `Checks open appointment slots for a doctor or department on a date. Use before offering any time to the caller.`
- Body description: `Details needed to look up open appointment slots.`

| Parameter | Required | Description |
|---|---|---|
| `department` | No | Department the caller wants, such as General Medicine, Pediatrics, Cardiology or Orthopedics. Leave empty if the caller named a doctor. |
| `doctor_name` | No | Doctor's name as the caller said it, for example Sana or Qureshi. Leave empty if the caller only named a department. |
| `preferred_date` | No | The date the caller wants, in YYYY-MM-DD format, worked out from today's date. Leave it EMPTY if the caller has not named a day yet; the tool then returns the earliest openings. |
| `time_of_day` | No | morning, afternoon, or any. Use any if the caller did not say. |

### `book_appointment`

- URL: `https://YOUR-N8N-HOST/webhook/book-appointment`
- Description: `Books an appointment in a slot returned by check_availability. Use only after the caller has clearly confirmed all details.`
- Body description: `Details of the appointment to book, copied from the chosen slot plus the patient's details.`

| Parameter | Required | Description |
|---|---|---|
| `doctor_id` | Yes | The doctor_id of the chosen slot, for example D03. |
| `date` | Yes | The date of the chosen slot, YYYY-MM-DD, copied from the slot. |
| `start_time` | Yes | The start time of the chosen slot in 24-hour HH:MM format, copied from the start field, for example 10:20. |
| `patient_name` | Yes | The caller's full name. |
| `phone` | Yes | The caller's phone number, digits only. |
| `email` | No | The caller's email if they want an emailed confirmation. Leave empty otherwise. |
| `patient_type` | Yes | new or returning. |
| `visit_category` | Yes | A short label such as general consultation, follow-up, or check-up. Never include symptoms or medical details. |

### `request_callback`

- URL: `https://YOUR-N8N-HOST/webhook/request-callback`
- Description: `Saves a callback request when the caller needs a human or the agent cannot help.`
- Body description: `Details of the person asking for a callback.`

| Parameter | Required | Description |
|---|---|---|
| `patient_name` | Yes | The caller's name. |
| `phone` | Yes | The caller's phone number, digits only. |
| `reason` | Yes | A short reason, for example billing question or wants to speak to reception. Never include medical details. |

### `find_appointment`

- URL: `https://YOUR-N8N-HOST/webhook/manage-appointment?action=find`
- Description: `Looks up an existing appointment from its appointment ID and the phone number it was booked with. Use before cancelling or moving an appointment.`
- Body description: `The appointment ID and phone number the caller gives to identify their appointment.`

| Parameter | Required | Description |
|---|---|---|
| `appointment_id` | Yes | The appointment ID the caller reads out: the letters APT, an eight-digit date, and three digits, for example APT-20261027-314. Use digits only after APT. |
| `phone` | Yes | The phone number the appointment was booked with, digits only. |

### `cancel_appointment`

- URL: `https://YOUR-N8N-HOST/webhook/manage-appointment?action=cancel`
- Description: `Cancels an appointment. Use only after find_appointment returned found and the caller clearly confirmed they want to cancel it.`
- Body description: `The appointment ID and phone number of the appointment to cancel.`
- Parameters: `appointment_id` and `phone`, exactly as for `find_appointment`.

### `reschedule_appointment`

- URL: `https://YOUR-N8N-HOST/webhook/manage-appointment?action=reschedule`
- Description: `Moves an appointment to a new slot returned by check_availability. Use only after find_appointment returned found and the caller clearly confirmed the new date and time.`
- Body description: `The appointment ID, phone number, and the chosen new slot.`

| Parameter | Required | Description |
|---|---|---|
| `appointment_id` | Yes | As for find_appointment. |
| `phone` | Yes | As for find_appointment. |
| `new_date` | Yes | The date of the chosen new slot, YYYY-MM-DD, copied from the slot. |
| `new_start_time` | Yes | The start time of the chosen new slot in 24-hour HH:MM format, copied from the slot's start field, for example 10:20. |

### `get_hospital_info`

- URL: `https://YOUR-N8N-HOST/webhook/get-hospital-info`
- Description: `Looks up general hospital information such as visiting hours, location, outpatient timings, and documents to bring. Use for these questions instead of answering from memory.`
- Body description: `The topic the caller is asking about.`

| Parameter | Required | Description |
|---|---|---|
| `topic` | Yes | A short topic phrase, for example visiting hours, location, outpatient timings, emergency, or documents to bring. |

## 3. Maintenance notes

- If you rename a tool parameter, change it in the matching n8n Prepare Request node too.
- The emergency number (1122) is written into the prompt. Change it for your region and verify it.
- After editing the agent: **Save**, confirm all seven tools appear in the Tools list, then **Publish**.
