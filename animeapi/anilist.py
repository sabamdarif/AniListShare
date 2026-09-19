"""AniList GraphQL transport for the Jikan-compatible anime API.

This module only knows how to *talk* to AniList: request building, timeouts,
retries, and turning AniList's error shapes into exceptions. The query
documents live in ``animeapi.queries`` and the translation into Jikan v4
response shapes lives in ``animeapi.mappers``.
"""

from __future__ import annotations

import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class AniListError(RuntimeError):
    """AniList could not be reached or answered with a GraphQL error."""


class AniListNotFound(AniListError):
    """AniList answered 404 — the requested media does not exist."""


_session: requests.Session | None = None


def _get_session() -> requests.Session:
    """Return a process-wide session so warm invocations reuse connections."""
    global _session
    if _session is None:
        session = requests.Session()
        session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                # AniList sits behind Cloudflare, which answers requests without
                # a User-Agent with 403 — indistinguishable from an outage.
                "User-Agent": settings.ANILIST_USER_AGENT,
            }
        )
        _session = session
    return _session


def _retry_after_seconds(response: requests.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        # Clamped: an upstream "wait 600s" must not park a serverless invocation.
        return max(0.0, min(float(raw), 2.0))
    except ValueError:
        return None


def query(document: str, variables: dict | None = None) -> dict:
    """Execute a GraphQL document and return its ``data`` payload.

    Raises:
        AniListNotFound: the media does not exist (AniList 404 / GraphQL 404).
        AniListError: transport failure, rate limit, or a rejected query.
    """
    payload = {"query": document, "variables": variables or {}}
    deadline = time.monotonic() + settings.ANILIST_TOTAL_TIMEOUT
    attempts = max(1, settings.ANILIST_MAX_ATTEMPTS)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break

        try:
            response = _get_session().post(
                settings.ANILIST_API_URL,
                json=payload,
                # Never let one attempt outlive the overall budget.
                timeout=(
                    min(settings.ANILIST_CONNECT_TIMEOUT, remaining),
                    min(settings.ANILIST_READ_TIMEOUT, remaining),
                ),
            )
        except requests.RequestException as exc:
            last_error = AniListError(f"AniList request failed: {exc}")
            logger.warning("AniList transport error (attempt %s): %s", attempt, exc)
            continue

        status = response.status_code

        if status == 429:
            last_error = AniListError("AniList rate limit reached")
            delay = _retry_after_seconds(response)
            logger.warning("AniList rate limited (attempt %s), retry-after=%s", attempt, delay)
            _sleep(delay if delay is not None else 0.5, deadline)
            continue

        if status >= 500:
            last_error = AniListError(f"AniList returned HTTP {status}")
            logger.warning("AniList server error %s (attempt %s)", status, attempt)
            continue

        if status >= 400 and status != 404:
            # A malformed query is our bug: retrying cannot help, so fail loudly.
            last_error = AniListError(
                f"AniList rejected the query (HTTP {status}): {response.text[:200]}"
            )
            logger.error("%s", last_error)
            raise last_error

        try:
            body = response.json()
        except ValueError as exc:
            last_error = AniListError(f"AniList returned invalid JSON: {exc}")
            continue

        if status == 404:
            raise AniListNotFound("AniList has no entry for that id")

        errors = [e for e in body.get("errors") or [] if isinstance(e, dict)]
        if errors:
            message = "; ".join(str(e.get("message")) for e in errors)
            if any(e.get("status") == 404 for e in errors):
                raise AniListNotFound(message or "AniList has no entry for that id")
            raise AniListError(f"AniList GraphQL error: {message}")

        data = body.get("data")
        if not isinstance(data, dict):
            raise AniListError("AniList response contained no data")
        return data

    raise last_error or AniListError("AniList request failed")


def _sleep(seconds: float, deadline: float) -> None:
    """Sleep, but never past the request deadline."""
    remaining = deadline - time.monotonic()
    if remaining > 0:
        time.sleep(min(seconds, remaining))
