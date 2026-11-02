# ElevenLabs agent configuration

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

## 2. Tools (three webhook tools)

Create each with **Tools → Add tool → Webhook**, method **POST**. Replace `YOUR-N8N-HOST` with your n8n host and use the **production** URL (it contains `/webhook/`, not `/webhook-test/`). All parameters are type **String** with value type **LLM Prompt**. Fill in the top-level body description as well; the form will not save without it.

### Advanced settings

| Setting | check_availability | book_appointment | request_callback |
|---|---|---|---|
| Response timeout | 20 s | 30 s | 20 s |
| Interruptions | Allow | Block (if offered) | Allow |
| Error handling | Auto | Auto | Auto |
| Pre-tool speech | Force | Force | Force |
| Execution mode | Immediate | Immediate | Immediate |
| Response filtering | All fields | All fields | All fields |

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

## 3. Maintenance notes

- If you rename a tool parameter, change it in the matching n8n Prepare Request node too.
- The emergency number (1122) is written into the prompt. Change it for your region and verify it.
- After editing the agent: **Save**, confirm all three tools appear in the Tools list, then **Publish**.
