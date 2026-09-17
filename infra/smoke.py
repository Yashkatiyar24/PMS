#!/usr/bin/env python3
"""
Post-deploy smoke test: runs a desk's whole day against a live server and checks the guarantees that matter.

    python3 infra/smoke.py [base-url] [email] [password]

It creates one guest and one stay, then checks out, invoices and credit-notes them, so it leaves a small
amount of real data behind. Point it at staging, or at production immediately after a deploy while the desk
is closed. Exits non-zero if anything fails, so CI can gate on it.
"""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
EMAIL = sys.argv[2] if len(sys.argv) > 2 else "manager@pms.local"
PASSWORD = sys.argv[3] if len(sys.argv) > 3 else "password123"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
failures: list[str] = []


def call(method, path, body=None, csrf=True):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if csrf and method != "GET":
        request.add_header("X-Requested-With", "pms")
    try:
        with opener.open(request) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text.strip() else None)
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except json.JSONDecodeError:
            return error.code, text[:150]


def fetch(path):
    return opener.open(urllib.request.Request(BASE + path)).read()


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  [' + str(detail) + ']') if detail else ''}")
    if not ok:
        failures.append(label)


def due_on(folio):
    return folio["totalPaise"] + folio["depositHeldPaise"] - folio["paidPaise"]


print(f"Smoke test against {BASE}\n")
print("— identity and access —")
check("the server is healthy", call("GET", "/api/health")[0] == 200)
check("a manager can sign in", call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD, "deviceName": "smoke"})[0] == 200)
_, me = call("GET", "/api/auth/me")
check("the session carries a property and a role", bool(me and me["propertyId"] and me["role"]), f"{me['name']} / {me['role']}")
check("a write without the CSRF header is forbidden", call("POST", "/api/bookings/check-in", {}, csrf=False)[0] == 403)

print("\n— the desk's day —")
_, rooms = call("GET", "/api/rooms")
candidates = [r for r in rooms if r["status"] != "blocked" and not r["beds"]]
check("there is inventory to sell", bool(candidates), f"{len(rooms)} rooms")


def check_in(room):
    return call("POST", "/api/bookings/check-in", {
        "newGuest": {"name": "Smoke Test Guest", "phone": "9000099999", "city": "Haridwar", "address": "Test",
                     "nationality": "IN", "idType": "other", "idLast4": "0000", "notes": "smoke test"},
        "units": [{"roomId": room["id"], "bedId": None, "ratePaise": None}],
        "nights": 1, "adults": 1, "children": 0, "purpose": "pilgrimage", "notes": "",
        "consent": True, "whatsappOptIn": False, "idPhotoSkippedReason": "smoke test",
        "advancePaise": 10000, "advanceMode": "cash", "depositPaise": 0})


# On a live property most rooms are occupied, so try until one is actually free tonight.
room, status, booking = None, 0, None
for candidate in candidates:
    status, booking = check_in(candidate)
    if status == 200:
        room = candidate
        break
    if status != 409:
        break
check("a walk-in check-in creates the stay", status == 200 and booking["state"] == "checked_in",
      f"room {room['number']}" if room else (booking.get("error") if isinstance(booking, dict) else booking))
if status != 200:
    print("\nCannot continue without a stay.")
    sys.exit(1)

folio_id, booking_id = booking["folioId"], booking["id"]
_, folio = call("GET", f"/api/folios/{folio_id}")
check("the night is charged", folio["totalPaise"] > 0, folio["totalPaise"])
check("the advance is recorded", folio["paidPaise"] == 10000)

status, problem = check_in(room)
check("the same room cannot be sold twice", status == 409, problem.get("error") if isinstance(problem, dict) else problem)

status, problem = call("POST", "/api/guests", {"name": "Smoke", "phone": "9000099997", "city": "X",
    "address": "1234 5678 9012", "nationality": "IN", "idType": "aadhaar", "idLast4": "9012", "notes": ""})
check("a full Aadhaar number is refused", status == 400)

print("\n— money and documents —")
_, folio = call("GET", f"/api/folios/{folio_id}")
_, folio = call("POST", f"/api/folios/{folio_id}/payments", {"mode": "cash", "amountPaise": due_on(folio), "reference": "smoke"})
check("the balance settles to zero", due_on(folio) == 0)

status, out = call("POST", f"/api/bookings/{booking_id}/check-out", {"departAt": booking["departAt"]})
check("checkout closes the stay", status == 200 and out["state"] == "checked_out", out.get("error") if status != 200 else "")
_, after = call("GET", f"/api/rooms/{room['id']}")
check("the room is sent for cleaning", after.get("status") == "dirty")

status, invoice = call("POST", f"/api/folios/{folio_id}/receipts/invoice")
check("an invoice is issued", status == 200, invoice.get("number"))
if status == 200:
    html = fetch(f"/api/receipts/{invoice['id']}/html").decode()
    check("the receipt prints in both languages", "Total" in html and "कुल" in html)
    pdf = fetch(f"/api/receipts/{invoice['id']}/pdf")
    check("the receipt renders as a PDF", pdf[:5] == b"%PDF-", f"{len(pdf)} bytes")

print("\n— reports —")
status, daily = call("GET", "/api/reports/daily")
check("the daily report is available", status == 200, f"collected {daily.get('collectedPaise')}")
check("the month report is available", call("GET", "/api/reports/month")[0] == 200)
check("the police register is available", call("GET", "/api/reports/police-register?from=2020-01-01&to=2099-01-01")[0] == 200)

print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1)
print("ALL CHECKS PASSED")
