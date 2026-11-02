# Setup guide

You need accounts for **n8n** (Cloud or self-hosted, with a public HTTPS address), **Google** (Sheets, Calendar, Gmail), and **ElevenLabs**. Allow about 60 to 90 minutes the first time.

## 1. Google Sheet

1. Create a blank Google Sheet named `City Care Hospital Data`.
2. **File → Import → Upload** `data/city-care-hospital-sheet-template.xlsx`, then choose **Replace spreadsheet**.
3. You should see the tabs Doctors, Appointments, Callbacks, Holidays, Settings (delete READ ME if you like).
4. In **Settings**, edit the two yellow cells: `emergency_number` (verify it for your region) and `reception_email` (your email).
5. Do not rename tabs or the headers in row 1. Keep dates and times as plain text.

## 2. Google Calendar

Create a new calendar named exactly `Hospital Appointments`. All bookings are written there.

## 3. Import the three workflows into n8n

For each file in `workflows/`: **Create workflow → ⋯ menu → Import from file**. Then open the nodes in the tables below and connect your accounts. Every node that needs a choice has a note saying what to pick.

| Workflow | Google Sheets nodes (pick document + tab) | Google Calendar nodes (pick `Hospital Appointments`) | Gmail nodes |
|---|---|---|---|
| 1. Check availability | Get Settings → Settings, Get Doctors → Doctors, Get Holidays → Holidays | Get Calendar Events | none |
| 2. Book appointment | Get Settings, Get Doctors, Get Holidays (as above), Log Appointment → Appointments | Get Calendar Events, Create Calendar Event | Send Confirmation |
| 3. Request callback | Get Settings → Settings, Log Callback → Callbacks | none | Notify Reception |

In **Log Appointment** and **Log Callback**, if n8n complains that column names changed, set the mapping mode to "Map Each Column Manually" and back to "Map Automatically" so the node reloads the column list.

Leave the **Execute Once** and **Always Output Data** node settings as they are (see [architecture](architecture.md)).

Finally, **activate** (publish) all three workflows. Each Webhook node then has a **Production URL** such as `https://YOUR-N8N-HOST/webhook/check-availability`.

## 4. Run the free tests

```bash
pip install -r requirements.txt
node tests/logic/harness.js                      # offline logic checks, no setup needed

export N8N_WEBHOOK_BASE=https://YOUR-N8N-HOST/webhook
export TEST_EMAIL=you@example.com
python tests/test_tools.py                       # live tests against your workflows
```

On Windows PowerShell use `$env:N8N_WEBHOOK_BASE="https://YOUR-N8N-HOST/webhook"` and `$env:TEST_EMAIL="you@example.com"`. Details are in [testing.md](testing.md). Do not continue until the live tests pass.

## 5. Create the ElevenLabs agent

Follow [`agent/agent-config.md`](../agent/agent-config.md): create a blank agent, paste [`agent/system-prompt.txt`](../agent/system-prompt.txt), add the first message, and create the three webhook tools with your production URLs. Save, check that all three tools are listed, then publish.

## 6. Test the agent

1. **Text chat first** (it costs far fewer credits than voice): "Book a dentist", "Book Dr Sana", "I have stomach pain, book Dr Sana", "My father has chest pain", "I want a human".
2. **A few short voice calls**, with the calendar, the Appointments sheet, and your inbox open.
3. Delete test events and rows before recording a demo.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| HTTP 404 from the tests | A workflow is not active, or the URL contains `/webhook-test/` |
| A node shows a credentials error | Pick your account in that node |
| Calendar node permission or API error | Enable the Google Calendar API for your Google account and reconnect the credential |
| Always `no_availability` | Doctor times or dates are not plain text (`09:00`, `2026-10-27`), or the test date is not a working day |
| Holiday is ignored | Holidays are read from the **Holidays tab**, not from calendar events; the date must be plain text |
| HTTP 500 | Open **Executions** in n8n, click the red node, and read the error |
| No emails | Check spam, and check that `reception_email` is your own address |
| Agent sends empty values | Parameter names must match exactly and use value type LLM Prompt; try a stronger model |
