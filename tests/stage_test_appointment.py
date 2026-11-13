"""
Stage a test appointment WITHOUT spending ElevenLabs credits, then print the exact words to say
when you test find / reschedule / cancel with the voice agent.

Why: booking by voice costs several minutes of credits. This script books the appointment through
your n8n webhook instead (free), so the agent test can start directly at "I want to move my appointment".

Setup:
  pip install requests
  set N8N_WEBHOOK_BASE=https://YOUR-NAME.app.n8n.cloud/webhook      (PowerShell: $env:N8N_WEBHOOK_BASE="...")
  set TEST_EMAIL=you@example.com                                     (optional)

Usage:
  python tests/stage_test_appointment.py                      create a test appointment and print the script
  python tests/stage_test_appointment.py --find ID PHONE      check what n8n currently has for that appointment
  python tests/stage_test_appointment.py --cancel ID PHONE    clean up (cancel) a leftover test appointment

"""
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = os.environ.get("N8N_WEBHOOK_BASE", "").strip().rstrip("/")
EMAIL = os.environ.get("TEST_EMAIL", "")      # leave empty if you do not want notice emails
DOCTOR_DEPARTMENT = "Cardiology"
KARACHI = timezone(timedelta(hours=5))


def call(path, payload):
    try:
        r = requests.post(f"{BASE_URL}/{path}", json=payload, timeout=60)
        return r.status_code, r.json()
    except Exception as e:  # noqa: BLE001
        return 0, {"status": "request_failed", "message": str(e)}


def spaced(text):
    """'03041234567' -> '0 3 0 4 1 2 3 4 5 6 7' (easy to read out loud)."""
    return " ".join(ch for ch in text if ch.isalnum())


def spoken_id(appointment_id):
    """'APT-20261117-988' -> 'A P T, 2 0 2 6 1 1 1 7, 9 8 8'."""
    _, date_part, seq = appointment_id.split("-")
    return f"A P T, {spaced(date_part)}, {spaced(seq)}"


def stage():
    today = datetime.now(KARACHI).date()
    code, body = call("check-availability", {"department": DOCTOR_DEPARTMENT, "preferred_date": str(today + timedelta(days=3)), "time_of_day": "any"})
    slots = body.get("slots") or body.get("next_available_slots") or []
    if not slots:
        print("Could not find a free slot. Response was:", body)
        sys.exit(1)
    slot = slots[0]
    phone = "0304" + "".join(random.choice("0123456789") for _ in range(7))
    code, made = call("book-appointment", {
        "doctor_id": slot["doctor_id"], "date": slot["date"], "start_time": slot["start"],
        "patient_name": "Test Caller", "phone": phone, "email": EMAIL,
        "patient_type": "new", "visit_category": "general consultation"})
    if made.get("status") != "booked":
        print("Booking failed. Response was:", made)
        sys.exit(1)
    appt_id = made["appointment_id"]
    code, found = call("manage-appointment?action=find", {"appointment_id": appt_id, "phone": phone})
    print(f"Staged with n8n (free): {made['message']}")
    print(f"Sanity check through the manage workflow: {found.get('status')} -> {found.get('message')}\n")
    print("=" * 70)
    print("YOUR TEST DETAILS (write these down)")
    print("=" * 70)
    print(f"  Appointment ID : {appt_id}")
    print(f"  Phone number   : {phone}")
    print(f"  Doctor         : {slot['doctor_name']} ({slot['department']})")
    print(f"  Booked for     : {slot['date_display']} at {slot['start_display']}")
    print()
    print("SAY THIS (one short call, about 3 minutes)")
    print("-" * 70)
    print('  1. "Hi, I need to move my appointment."')
    print(f'  2. "My appointment ID is {spoken_id(appt_id)}. My phone number is {spaced(phone)}."')
    print('  3. "Move it, please."          (only if it asks cancel or move)')
    print('  4. "The earliest other time you have."')
    print('  5. "The first one."')
    print('  6. "Yes."                      (to the read-back of the move)')
    print('  7. "Actually, please cancel it instead."')
    print('  8. "Yes."                      (to "Shall I cancel it?")')
    print('  9. "No, thank you. Goodbye."   then hang up')
    print()
    print("SHORT VERSION (about 30 seconds, tests only that it hears the ID and phone)")
    print("-" * 70)
    print('  1. "Hi, I need to move my appointment."')
    print(f'  2. "My appointment ID is {spoken_id(appt_id)}. My phone number is {spaced(phone)}."')
    print("  Hang up as soon as it reads your appointment back.")
    print()
    print("AFTER THE CALL: if the appointment is still there, clean it up with:")
    print(f"  python tests/stage_test_appointment.py --cancel {appt_id} {phone}")


def main():
    if not BASE_URL or "YOUR-NAME" in BASE_URL:
        print("Set N8N_WEBHOOK_BASE to your n8n production webhook base, for example https://YOUR-NAME.app.n8n.cloud/webhook")
        sys.exit(1)
    if len(sys.argv) >= 4 and sys.argv[1] in ("--find", "--cancel"):
        action = "find" if sys.argv[1] == "--find" else "cancel"
        code, body = call(f"manage-appointment?action={action}", {"appointment_id": sys.argv[2], "phone": sys.argv[3]})
        print(f"HTTP {code}: {body.get('status')} -> {body.get('message')}")
        return
    if len(sys.argv) > 1:
        print(__doc__)
        return
    stage()


if __name__ == "__main__":
    main()
