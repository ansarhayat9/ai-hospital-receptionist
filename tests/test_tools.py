"""
Live integration tests for the three n8n tools (no voice credits needed).

Setup
  1. pip install -r requirements.txt
  2. Import and ACTIVATE (publish) all three workflows in n8n.
  3. Set these environment variables (or edit the defaults below):
       N8N_WEBHOOK_BASE   production webhook base, e.g. https://YOUR-NAME.app.n8n.cloud/webhook
                          (no trailing slash, and NOT /webhook-test)
       TEST_EMAIL         your own email, so the confirmation email reaches you
       TEST_HOLIDAY       (optional) a near-future Mon-Sat date, YYYY-MM-DD, that is also listed in
                          the Holidays sheet. If it is missing or in the past, the holiday test is skipped.
  4. Run:  python tests/test_tools.py

Each test prints PASS or FAIL. Afterwards, check by hand:
  - Google Calendar: 2 new events on the chosen Tuesday
  - Appointments sheet: 2 new rows
  - Callbacks sheet: 1 new row (and an alert email in the reception inbox)
  - A confirmation email only for the booking that had an email address
A new random phone number is used on every run, so you can run it again.
The booked slots stay booked, so a re-run picks the next free slots. Delete test data when done.
"""
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = os.environ.get("N8N_WEBHOOK_BASE", "https://YOUR-NAME.app.n8n.cloud/webhook")
MY_EMAIL = os.environ.get("TEST_EMAIL", "YOUR-EMAIL@example.com")
HOLIDAY = os.environ.get("TEST_HOLIDAY", "")

BASE_URL = BASE_URL.strip().rstrip("/")
if "YOUR-NAME" in BASE_URL:
    print("STOP: set N8N_WEBHOOK_BASE to your n8n production webhook base, for example")
    print("      https://YOUR-NAME.app.n8n.cloud/webhook")
    sys.exit(1)
if "/webhook-test" in BASE_URL:
    BASE_URL = BASE_URL.replace("/webhook-test", "/webhook")
    print("NOTE: switched the test address (/webhook-test) to the production address (/webhook).")
    print("      This only works if all three workflows are active/published in n8n.\n")
if "YOUR-EMAIL" in MY_EMAIL:
    print("NOTE: TEST_EMAIL is not set, so the confirmation email will not reach you.\n")

KARACHI = timezone(timedelta(hours=5))
today = datetime.now(KARACHI).date()
tuesday = next(today + timedelta(days=i) for i in range(2, 30) if (today + timedelta(days=i)).weekday() == 1)
wednesday = tuesday + timedelta(days=1)
past = today - timedelta(days=5)
far = today + timedelta(days=90)
phone_a = "0300" + "".join(random.choice("0123456789") for _ in range(7))
phone_b = "0301" + "".join(random.choice("0123456789") for _ in range(7))

results = []


def call(path, payload):
    try:
        r = requests.post(f"{BASE_URL}/{path}", json=payload, timeout=60)
        return r.status_code, r.json()
    except Exception as e:  # noqa: BLE001
        return 0, {"status": "request_failed", "message": str(e)}


def test(name, path, payload, expect):
    code, body = call(path, payload)
    status = body.get("status") if isinstance(body, dict) else None
    ok = status == expect
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
    print(f"      expected status: {expect} | got: {status} (HTTP {code})")
    if isinstance(body, dict) and body.get("message"):
        print(f"      message: {body['message']}")
    if not ok:
        print(f"      full response: {json.dumps(body)[:400]}")
    return body


print(f"Testing against {BASE_URL}")

# Pre-flight: stop early with a clear message if the workflows are not active
_code, _body = call("check-availability", {"department": "Cardiology", "preferred_date": str(today), "time_of_day": "any"})
if _code == 404:
    print("\nSTOP: n8n says the webhook is not registered (HTTP 404).")
    print("Fix: switch all 3 workflows to Active (toggle at the top right), or click Publish, then run again.")
    sys.exit(1)
if _code == 0:
    print("\nSTOP: could not reach n8n. Check N8N_WEBHOOK_BASE and your internet connection.")
    print(_body.get("message", ""))
    sys.exit(1)

print(f"Using Tuesday {tuesday}, Wednesday {wednesday}\n")

print("=== Tool 1: check_availability ===")
slots_body = test("Cardiology, Tuesday morning", "check-availability",
                  {"department": "Cardiology", "preferred_date": str(tuesday), "time_of_day": "morning"}, "ok")
test("Doctor by surname (Qureshi), Tuesday morning", "check-availability",
     {"doctor_name": "Dr Qureshi", "preferred_date": str(tuesday), "time_of_day": "morning"}, "ok")
test("Department said as 'cardiologist'", "check-availability",
     {"department": "cardiologist", "preferred_date": str(tuesday), "time_of_day": "any"}, "ok")
test("Dr Sana on a day she does not work", "check-availability",
     {"doctor_name": "Sana", "preferred_date": str(wednesday), "time_of_day": "any"}, "no_availability")
if HOLIDAY and HOLIDAY >= str(today):
    test("Holiday date", "check-availability",
         {"doctor_name": "Hamza", "preferred_date": HOLIDAY, "time_of_day": "any"}, "no_availability")
else:
    print("SKIP  Holiday date test (set TEST_HOLIDAY to a future date that is listed in the Holidays sheet)")
test("Unknown department", "check-availability",
     {"department": "Dentistry", "preferred_date": str(tuesday)}, "unknown_department")
test("Unknown doctor", "check-availability",
     {"doctor_name": "Zed", "preferred_date": str(tuesday)}, "unknown_doctor")
test("No date given: earliest openings (department only)", "check-availability",
     {"department": "Cardiology"}, "ok")
test("Unknown department, no date given", "check-availability",
     {"department": "Dentistry"}, "unknown_department")
test("Unknown doctor, no date given", "check-availability",
     {"doctor_name": "Zed"}, "unknown_doctor")
test("Date in the past", "check-availability",
     {"department": "Cardiology", "preferred_date": str(past)}, "invalid_date")
test("Date too far ahead", "check-availability",
     {"department": "Cardiology", "preferred_date": str(far)}, "invalid_date")
test("No doctor and no department", "check-availability",
     {"preferred_date": str(tuesday)}, "invalid")

slots = slots_body.get("slots", []) if isinstance(slots_body, dict) else []
if len(slots) < 3:
    print("\nCould not get 3 slots from the first test, so the booking tests are skipped.")
    print("Check Tool 1 first (Executions tab in n8n).")
    sys.exit(1)

s1, s2, s3 = slots[0], slots[1], slots[2]


def booking(slot, phone, email, name="Test Patient"):
    return {"doctor_id": slot["doctor_id"], "date": slot["date"], "start_time": slot["start"],
            "patient_name": name, "phone": phone, "email": email,
            "patient_type": "new", "visit_category": "general consultation"}


print("\n=== Tool 2: book_appointment ===")
test("Book first slot (with email)", "book-appointment", booking(s1, phone_a, MY_EMAIL, "Ali Raza"), "booked")
test("Same slot again, different patient", "book-appointment", booking(s1, phone_b, ""), "slot_taken")
test("Same patient, same doctor, same day", "book-appointment", booking(s2, phone_a, ""), "duplicate")
test("Different patient, third slot, no email", "book-appointment", booking(s3, phone_b, "", "Sara Khan"), "booked")
test("Phone number too short", "book-appointment", booking(s2, "123", ""), "invalid")
test("Past date", "book-appointment", dict(booking(s2, phone_a, ""), date=str(past)), "invalid")
test("Unknown doctor id", "book-appointment", dict(booking(s2, phone_a, ""), doctor_id="D99"), "invalid")
test("Time that is not on the slot grid", "book-appointment", dict(booking(s2, phone_b, ""), start_time="10:25"), "invalid")

print("\n=== Tool 3: request_callback ===")
test("Valid callback", "request-callback",
     {"patient_name": "Test Caller", "phone": phone_a, "reason": "Question about billing"}, "logged")
test("Callback with missing details", "request-callback",
     {"patient_name": "", "phone": "1", "reason": ""}, "invalid")

passed = sum(results)
print(f"\n{passed} of {len(results)} tests passed.")
if passed != len(results):
    print("Open the failed workflow in n8n > Executions to see what happened.")
    sys.exit(1)
