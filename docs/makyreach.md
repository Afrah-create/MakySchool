# MakyReach SMS

Central SMS client for the MakySchool API. **All SMS goes through this package** — do not call the MakyReach HTTP API from routers or the Next.js apps.

Email is still SMTP (`SMTP_*` env vars). MakyReach is SMS-only in this codebase today.

External docs: [https://reach.makylegacy.com/docs](https://reach.makylegacy.com/docs)

## Architecture

```
Router (fees, attendance, …)
    └── from app.services.makyreach import send_sms | send_bulk_sms
            └── app/services/makyreach/client.py
                    └── HTTPS → {MAKYREACH_API_URL}
                            Authorization: X-API-Key
```

| File | Role |
|------|------|
| `apps/api/app/services/makyreach/client.py` | HTTP client, phone formatting, errors |
| `apps/api/app/services/makyreach/__init__.py` | Public re-exports |

Frontends never see the API key. Tenant UI only triggers domain endpoints (e.g. fee reminders, notify parent); the API decides whether SMS actually sends.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `MAKYREACH_API_KEY` | `""` | Required to enable SMS. Empty → `makyreach_configured()` is false |
| `MAKYREACH_API_URL` | `https://sms.makylegacy.com/api/v2` | Base URL, no trailing slash needed |
| `MAKYREACH_SENDER_ID` | `MakySms` | Overridable per call via `sender_id=` |

Defined in `apps/api/app/config.py`. Documented in `.env.example` and `production.env`.

```bash
# Repo root .env (API process only)
MAKYREACH_API_KEY=mkr_…
MAKYREACH_API_URL=https://sms.makylegacy.com/api/v2
MAKYREACH_SENDER_ID=MakySms
```

Never put these in `NEXT_PUBLIC_*` or client bundles.

## Public API

```python
from app.services.makyreach import (
    send_sms,
    send_bulk_sms,
    get_balance,
    makyreach_configured,
    MakyReachError,
    MakyReachNotConfigured,
)
```

| Function | Upstream | Use when |
|----------|----------|----------|
| `makyreach_configured()` | — | Gate before send; soft-skip if false |
| `send_sms(phones, message, sender_id=None)` | `POST /sms/send` | One message body → one or many numbers |
| `send_bulk_sms(messages, reference=None, sender_id=None)` | `POST /sms/send/bulk` | Different bodies per recipient (`[{number, message_body}, …]`) |
| `get_balance()` | `GET /account/balance` | Credit checks / ops tooling (no product call site yet) |

Auth header: `X-API-Key: {MAKYREACH_API_KEY}`.

## Phone normalization

1. Digits only via `normalize_uganda_phone` (`apps/api/app/services/makypay/phone.py`):
   - `256XXXXXXXXX` (12 digits) kept
   - `0XXXXXXXXX` (10 digits) → `256…`
   - 9 digits → prefixed with `256`
   - otherwise → `None` (skipped)
2. For the MakyReach payload, `256…` is converted back to local `0XXXXXXXXX`.

Invalid numbers are skipped and counted; if none remain, `MakyReachError` is raised.

## Errors

| Type | When | Typical router behavior |
|------|------|-------------------------|
| `MakyReachNotConfigured` | Missing/blank API key | Soft skip (`skipped` / zero sends), **not** a 500 |
| `MakyReachError` | No valid phones, HTTP failure, API `success: false`, payment required, etc. | Domain-specific: mark `failed`, return message in `data` |

Upstream HTTP errors are parsed for a useful message (e.g. 402 payment required when the MakyReach wallet is empty).

## Call sites

| Domain | Router | Endpoint | Client call |
|--------|--------|----------|-------------|
| Fee reminders | `apps/api/app/routers/fees.py` → `sms_reminders` | `POST /api/schools/fees/reminders/sms` | `send_bulk_sms` |
| Attendance parent notify | `apps/api/app/routers/attendance.py` → `notify_student_parent` | `POST /api/schools/attendance/students/{id}/notify` | `send_sms` |

### Pattern for new call sites

```python
from app.services.makyreach import (
    MakyReachError,
    MakyReachNotConfigured,
    makyreach_configured,
    send_sms,
)

if not makyreach_configured():
    # Persist / return soft skip — do not 500
    ...
try:
    result = await send_sms(phones=phone, message=text)
except MakyReachNotConfigured:
    ...
except MakyReachError as exc:
    # Log, mark failed, return user-facing message from str(exc)
    ...
```

Keep credentials and HTTP details inside `app.services.makyreach`. Routers only pass phones + message text.

## Frontend notes

- Fee UI: `apps/web/src/components/fees/SmsReminderPanel.tsx` — relies on API response (`sent` / `failed` / message); no client-side “configured” flag.
- Attendance UI: `apps/web/src/components/attendance/NotifyParentPanel.tsx` — notifications are always logged; delivery depends on MakyReach credits.

## Ops / testing

1. Set `MAKYREACH_API_KEY` in the API `.env` and restart `npm run dev:api`.
2. Top up the MakyReach account if sends return payment / insufficient credit errors.
3. Prefer a known Ugandan MSISDN in local `0XXXXXXXXX` form when testing.
4. Use `.venv/bin/python` under `apps/api` so `httpx` and project deps resolve.

## Related

- Attendance parent notify: [attendance.md](./attendance.md)
- MakyPay phone helper (shared normalization): `apps/api/app/services/makypay/phone.py`
