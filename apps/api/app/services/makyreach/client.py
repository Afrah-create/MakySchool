from __future__ import annotations

import logging
from typing import Any, Sequence

import httpx

from app.config import settings
from app.services.makypay.phone import normalize_uganda_phone

logger = logging.getLogger("makyschool.makyreach")

DEFAULT_BASE_URL = "https://sms.makylegacy.com/api/v2"
DEFAULT_SENDER_ID = "MakySms"


class MakyReachNotConfigured(RuntimeError):
    """Raised when MAKYREACH_API_KEY is missing."""


class MakyReachError(RuntimeError):
    """Raised when the MakyReach API returns an error response."""


def makyreach_configured() -> bool:
    return bool(settings.MAKYREACH_API_KEY.strip())


def _base_url() -> str:
    return (settings.MAKYREACH_API_URL.strip() or DEFAULT_BASE_URL).rstrip("/")


def _sender_id(override: str | None = None) -> str:
    if override and override.strip():
        return override.strip()
    configured = getattr(settings, "MAKYREACH_SENDER_ID", "") or ""
    return configured.strip() or DEFAULT_SENDER_ID


def _api_key() -> str:
    key = settings.MAKYREACH_API_KEY.strip()
    if not key:
        raise MakyReachNotConfigured("MakyReach API key is not configured")
    return key


def format_phone_for_sms(phone: str) -> str | None:
    """Normalize a Uganda number to local 0XXXXXXXXX form used by MakyReach docs."""
    normalized = normalize_uganda_phone(phone)
    if not normalized:
        return None
    return f"0{normalized[3:]}"


def _format_numbers(phones: Sequence[str]) -> list[str]:
    formatted: list[str] = []
    seen: set[str] = set()
    for raw in phones:
        if not raw or not str(raw).strip():
            continue
        phone = format_phone_for_sms(str(raw).strip())
        if not phone or phone in seen:
            continue
        seen.add(phone)
        formatted.append(phone)
    return formatted


async def _request(
    path: str,
    *,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {
        "X-API-Key": _api_key(),
        "Accept": "application/json",
    }
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method,
            f"{_base_url()}{path}",
            headers=headers,
            json=json_body,
        )

    raw = response.text
    try:
        payload: dict[str, Any] = response.json() if raw else {}
    except ValueError:
        raise MakyReachError(f"Unexpected MakyReach response ({response.status_code})") from None

    success = payload.get("success")
    if not response.is_success or success is False:
        raise MakyReachError(_error_message(payload, response.status_code))

    return payload


def _error_message(payload: dict[str, Any], status_code: int) -> str:
    for key in ("message", "error", "detail"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            nested = value.get("message") or value.get("error") or value.get("code")
            if nested:
                return str(nested)
    code = payload.get("code")
    if code is not None:
        return f"MakyReach request failed ({code})"
    return f"MakyReach request failed ({status_code})"


async def get_balance() -> dict[str, Any]:
    """Return account balance / credit info from MakyReach."""
    payload = await _request("/account/balance", method="GET")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "balance": data.get("balance"),
        "currency": data.get("currency") or "UGX",
        "raw": payload,
    }


async def send_sms(
    *,
    phones: Sequence[str] | str,
    message: str,
    sender_id: str | None = None,
) -> dict[str, Any]:
    """
    Send one message body to one or more recipients.

    POST /sms/send
    """
    body = (message or "").strip()
    if not body:
        raise MakyReachError("SMS message body is required")

    phone_list = [phones] if isinstance(phones, str) else list(phones)
    numbers = _format_numbers(phone_list)
    if not numbers:
        raise MakyReachError("No valid phone numbers to send SMS to")

    payload = await _request(
        "/sms/send",
        method="POST",
        json_body={
            "numbers": ",".join(numbers),
            "message_body": body,
            "sender_id": _sender_id(sender_id),
        },
    )
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    recipients = data.get("recipients")
    if recipients is None:
        recipients = len(numbers)

    logger.info(
        "MakyReach SMS sent to %s recipient(s); cost=%s remaining=%s",
        recipients,
        data.get("cost"),
        data.get("remaining_balance"),
    )
    return {
        "success": True,
        "message": payload.get("message") or "Message sent successfully",
        "recipients": int(recipients) if recipients is not None else len(numbers),
        "cost": data.get("cost"),
        "remaining_balance": data.get("remaining_balance"),
        "numbers": numbers,
        "provider_ref": data.get("reference") or data.get("id") or data.get("message_id"),
        "raw": payload,
    }


async def send_bulk_sms(
    *,
    messages: Sequence[dict[str, str]],
    reference: str | None = None,
    sender_id: str | None = None,
) -> dict[str, Any]:
    """
    Send personalized messages (one body per number).

    Each item: {"number": "...", "message_body": "..."}
    POST /sms/send/bulk
    """
    prepared: list[dict[str, str]] = []
    skipped = 0
    for item in messages:
        number = format_phone_for_sms(str(item.get("number") or "").strip())
        message_body = str(item.get("message_body") or "").strip()
        if not number or not message_body:
            skipped += 1
            continue
        prepared.append({"number": number, "message_body": message_body})

    if not prepared:
        raise MakyReachError("No valid bulk SMS messages to send")

    body: dict[str, Any] = {
        "sender_id": _sender_id(sender_id),
        "messages": prepared,
    }
    if reference and reference.strip():
        body["reference"] = reference.strip()

    payload = await _request("/sms/send/bulk", method="POST", json_body=body)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    recipients = data.get("recipients")
    if recipients is None:
        recipients = len(prepared)

    logger.info(
        "MakyReach bulk SMS sent to %s recipient(s) (skipped %s); cost=%s remaining=%s",
        recipients,
        skipped,
        data.get("cost"),
        data.get("remaining_balance"),
    )
    return {
        "success": True,
        "message": payload.get("message") or "Message sent successfully",
        "recipients": int(recipients) if recipients is not None else len(prepared),
        "skipped": skipped,
        "cost": data.get("cost"),
        "remaining_balance": data.get("remaining_balance"),
        "provider_ref": data.get("reference") or reference,
        "raw": payload,
    }
