"""TMDb HTTP transport for the movie/TV fallback of the anime API.

This module only talks to TMDb: request building, timeouts, retries, and
turning TMDb's error shapes into exceptions. Translation into Jikan v4 response
shapes lives in :mod:`animeapi.mappers`, exactly as it does for AniList.

The fallback is optional. With no ``TMDB_API_TOKEN`` configured, :func:`is_enabled`
returns False and the views skip TMDb, so the API behaves as it did before.
"""

from __future__ import annotations

import logging
import time

import requests
from django.conf import settings

from .upstream import UpstreamError, UpstreamNotFound

logger = logging.getLogger(__name__)


class TMDbError(UpstreamError):
    """TMDb could not be reached or answered with an error."""


class TMDbNotFound(TMDbError, UpstreamNotFound):
    """TMDb answered 404: the requested title does not exist."""


_session: requests.Session | None = None


def is_enabled() -> bool:
    """True when a TMDb credential is configured; otherwise the fallback is off."""
    return bool(settings.TMDB_API_TOKEN or settings.TMDB_API_KEY)


def _get_session() -> requests.Session:
    """Return a process-wide session so warm invocations reuse connections."""
    global _session
    if _session is None:
        session = requests.Session()
        session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": settings.ANILIST_USER_AGENT,
            }
        )
        # A v4 Read Access Token authenticates with a bearer header; a v3 key
        # goes on the query string instead (see _get).
        if settings.TMDB_API_TOKEN:
            session.headers["Authorization"] = f"Bearer {settings.TMDB_API_TOKEN}"
        _session = session
    return _session


def _auth_params() -> dict:
    """The v3 ``api_key`` query param, used only when no bearer token is set."""
    if not settings.TMDB_API_TOKEN and settings.TMDB_API_KEY:
        return {"api_key": settings.TMDB_API_KEY}
    return {}


def _get(path: str, params: dict | None = None) -> dict:
    """GET a TMDb endpoint and return its parsed JSON body.

    Raises:
        TMDbNotFound: TMDb answered 404 (the id does not exist).
        TMDbError: transport failure, rate limit, or any other error status.
    """
    url = f"{settings.TMDB_API_URL}{path}"
    request_params = {**(params or {}), **_auth_params()}
    deadline = time.monotonic() + settings.TMDB_TOTAL_TIMEOUT
    attempts = max(1, settings.TMDB_MAX_ATTEMPTS)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break

        try:
            response = _get_session().get(
                url,
                params=request_params,
                timeout=(
                    min(settings.TMDB_CONNECT_TIMEOUT, remaining),
                    min(settings.TMDB_READ_TIMEOUT, remaining),
                ),
            )
        except requests.RequestException as exc:
            last_error = TMDbError(f"TMDb request failed: {exc}")
            logger.warning("TMDb transport error (attempt %s): %s", attempt, exc)
            continue

        status = response.status_code

        if status == 404:
            raise TMDbNotFound("TMDb has no entry for that id")

        if status == 429:
            last_error = TMDbError("TMDb rate limit reached")
            logger.warning("TMDb rate limited (attempt %s)", attempt)
            _sleep(0.5, deadline)
            continue

        if status >= 500:
            last_error = TMDbError(f"TMDb returned HTTP {status}")
            logger.warning("TMDb server error %s (attempt %s)", status, attempt)
            continue

        if status >= 400:
            # 401/422 and the like are our bug (bad token or query): retrying
            # cannot help, so fail loudly.
            last_error = TMDbError(
                f"TMDb rejected the request (HTTP {status}): {response.text[:200]}"
            )
            logger.error("%s", last_error)
            raise last_error

        try:
            return response.json()
        except ValueError as exc:
            last_error = TMDbError(f"TMDb returned invalid JSON: {exc}")
            continue

    raise last_error or TMDbError("TMDb request failed")


def _sleep(seconds: float, deadline: float) -> None:
    """Sleep, but never past the request deadline."""
    remaining = deadline - time.monotonic()
    if remaining > 0:
        time.sleep(min(seconds, remaining))


def search(query: str, *, page: int = 1, per_page: int = 25, include_adult: bool = False):
    """Search movies and TV via ``/search/multi``.

    Returns ``(results, body)``: ``results`` is the movie and TV entries only
    (people are dropped), trimmed to ``per_page``; ``body`` carries TMDb's own
    pagination counts for :func:`animeapi.mappers.tmdb_pagination`.
    """
    body = _get(
        "/search/multi",
        {
            "query": query,
            "page": page,
            "include_adult": "true" if include_adult else "false",
        },
    )
    results = [
        item
        for item in body.get("results") or []
        if item.get("media_type") in ("movie", "tv")
    ]
    return results[:per_page], body


def movie_detail(tmdb_id: int) -> dict:
    """Fetch one movie's full record via ``/movie/{id}``."""
    return _get(f"/movie/{tmdb_id}")


def tv_detail(tmdb_id: int) -> dict:
    """Fetch one TV series' full record via ``/tv/{id}``."""
    return _get(f"/tv/{tmdb_id}")
