"""Read-through caching with a stale-if-error fallback.

The API is public and unauthenticated, so without caching every visitor would
cost an AniList round trip. Responses are cached twice over:

* Django's cache, per warm serverless instance, absorbs bursts.
* ``Cache-Control`` hands the response to Vercel's shared edge cache, which is
  what keeps most traffic from invoking the function at all.

Expired entries are kept until ``stale_ttl`` so a failing upstream degrades to
slightly old data rather than an error page.
"""

from __future__ import annotations

import hashlib
import json
import time

from django.conf import settings
from django.core.cache import cache

from .upstream import UpstreamError, UpstreamNotFound

FRESH = "fresh"
HIT = "hit"
STALE = "stale"


def cache_key(endpoint: str, params: dict) -> str:
    """Build a short, stable key for one endpoint + parameter combination."""
    digest = hashlib.sha256(
        json.dumps(params, sort_keys=True, default=str).encode()
    ).hexdigest()[:24]
    return f"animeapi:v1:{endpoint}:{digest}"


def fetch_through(cache_key_: str, *, fresh_ttl: int, stale_ttl: int, producer):
    """Return ``(payload, source)`` for ``cache_key_``, calling ``producer`` if needed.

    ``producer`` is only invoked on a miss or an expired entry, and only its
    ``UpstreamError`` is treated as a soft failure: a stale copy is preferred
    over an error, whichever provider raised it.
    """
    stored = cache.get(cache_key_)
    if stored is not None:
        age = time.time() - stored["stored_at"]
        if age < fresh_ttl:
            return stored["value"], HIT

    try:
        value = producer()
    except UpstreamNotFound:
        # A missing entry is an answer, not a failure: never serve stale data
        # for it, and do not mask the 404.
        raise
    except UpstreamError:
        if stored is not None and time.time() - stored["stored_at"] < stale_ttl:
            return stored["value"], STALE
        raise

    cache.set(
        cache_key_,
        {"stored_at": time.time(), "value": value},
        timeout=max(stale_ttl, fresh_ttl),
    )
    return value, FRESH


def cache_control(fresh_ttl: int, stale_ttl: int, *, source: str = FRESH) -> str:
    """Build the ``Cache-Control`` value for a response.

    ``stale-while-revalidate`` lets the CDN answer from an expired copy while it
    refreshes in the background, so visitors never wait on AniList. A response
    that could only be served from an expired entry gets a short lifetime, so a
    recovering upstream is picked up quickly.
    """
    if fresh_ttl <= 0:
        return "no-store"
    if source == STALE:
        return "public, s-maxage=60, stale-while-revalidate=60"
    return (
        f"public, s-maxage={fresh_ttl}, "
        f"stale-while-revalidate={max(0, stale_ttl - fresh_ttl)}"
    )


def ttl_for(name: str) -> tuple[int, int]:
    """Look up the ``(fresh_ttl, stale_ttl)`` pair for an endpoint."""
    ttls = settings.ANIME_API_CACHE_TTLS
    return ttls.get(name, ttls["default"])
