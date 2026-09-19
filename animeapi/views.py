"""Jikan v4 compatible endpoints, served from AniList.

These views answer Jikan's URLs, parameters and response shapes, so a caller
never needs to know where the data comes from. Three choices are deliberate:

* They are public and unauthenticated, as Jikan's are, which is why they are
  plain Django views rather than DRF ones: DRF's configured throttle classes
  allow anonymous callers 100 requests a day, which would take the homepage
  down on its own.
* Every response carries ``Cache-Control``, so Vercel's edge cache answers
  repeat traffic without invoking this function at all.
* Upstream failures become Jikan's own error body and status codes instead of
  surfacing as a 500.
"""

from __future__ import annotations

import logging
import random
from functools import wraps

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from . import mappers, params, queries
from .anilist import AniListError, AniListNotFound, query
from .caching import FRESH, cache_control, cache_key, fetch_through, ttl_for

logger = logging.getLogger(__name__)

# AniList has no random endpoint; sampling a page of the popularity ranking is
# the closest equivalent. The range is bounded so the sample stays inside the
# ranking's populated pages.
RANDOM_SAMPLE_PAGES = 60


def _json(payload, ttl, source=FRESH):
    fresh_ttl, stale_ttl = ttl
    response = JsonResponse(payload, json_dumps_params={"separators": (",", ":")})
    response["Cache-Control"] = cache_control(fresh_ttl, stale_ttl, source=source)
    # Lets the cache behaviour be seen from the outside, in dev and in prod.
    response["X-Anime-API-Cache"] = source
    return response


def _error(message, status, error_type):
    """Jikan's error body, so failures parse the same way as its own."""
    return JsonResponse(
        {"status": status, "type": error_type, "message": message, "error": None},
        status=status,
        headers={"Cache-Control": "no-store"},
    )


def jikan_endpoint(view):
    """Shared handling: GET only, Jikan-shaped errors, cache headers.

    The metadata provider is a third party, so its failures are translated into
    the 404/502 split Jikan uses rather than leaking a 500.
    """

    # These endpoints only read, and `require_GET` rejects every other method,
    # so CSRF protection has nothing to protect here. Leaving it on would also
    # replace the 405 Jikan returns for a wrong method with a 403 from the CSRF
    # middleware, which is not an answer any of these routes can give.
    @csrf_exempt
    @require_GET
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        try:
            payload, ttl, source = view(request, *args, **kwargs)
        except params.BadRequest as exc:
            return _error(str(exc), 400, "BadRequestException")
        except AniListNotFound:
            return _error(
                "No anime found with the requested id.",
                404,
                "ResourceNotFoundException",
            )
        except AniListError as exc:
            logger.warning("AniList lookup failed: %s", exc)
            return _error(
                "The anime metadata provider is unavailable right now. "
                "Please try again in a moment.",
                502,
                "BadResponseException",
            )
        return _json(payload, ttl, source)

    return wrapper


def _through_cache(name, variables, producer):
    """Run ``producer`` through the cache layer for one endpoint."""
    ttl = ttl_for(name)
    payload, source = fetch_through(
        cache_key(name, variables),
        fresh_ttl=ttl[0],
        stale_ttl=ttl[1],
        producer=producer,
    )
    return payload, ttl, source


def _listing(document, variables):
    """Build a Jikan list payload from a paged AniList document."""

    def producer():
        page = (query(document, variables) or {}).get("Page") or {}
        medias = page.get("media") or []
        return {
            "pagination": mappers.pagination(
                page.get("pageInfo") or {},
                current_page=variables["page"],
                per_page=variables["perPage"],
                count=len(medias),
            ),
            "data": mappers.map_anime_list(medias),
        }

    return producer


@jikan_endpoint
def anime_search(request):
    """``/anime`` — search, with Jikan's filter and ordering parameters."""
    variables = params.search_variables(request)
    return _through_cache(
        "search", variables, _listing(queries.ANIME_SEARCH, variables)
    )


@jikan_endpoint
def anime_detail(request, mal_id, full=False):
    """``/anime/{id}`` and ``/anime/{id}/full``.

    Ids at or above ``SYNTHETIC_MAL_ID_OFFSET`` are this API's own ids for
    entries that have no MyAnimeList counterpart, so they are resolved against
    the AniList id they were derived from.
    """
    if mal_id >= mappers.SYNTHETIC_MAL_ID_OFFSET:
        document = queries.MEDIA_BY_ID_FULL if full else queries.MEDIA_BY_ID
        variables = {"id": mal_id - mappers.SYNTHETIC_MAL_ID_OFFSET}
    else:
        document = queries.MEDIA_BY_MAL_ID_FULL if full else queries.MEDIA_BY_MAL_ID
        variables = {"idMal": mal_id}

    def producer():
        media = (query(document, variables) or {}).get("Media")
        if not media:
            # AniList reports unknown ids with a 404, which the client turns
            # into AniListNotFound; a null body means the same thing.
            raise AniListNotFound(f"No anime with id {mal_id}.")
        return {"data": mappers.map_anime(media, full=full)}

    return _through_cache("detail", {"id": mal_id, "full": full}, producer)


@jikan_endpoint
def top_anime(request):
    """``/top/anime`` — ranked lists. The position in the ranking is the rank."""
    variables = params.top_variables(request)

    def producer():
        page = (query(queries.TOP_ANIME, variables) or {}).get("Page") or {}
        medias = page.get("media") or []
        return {
            "pagination": mappers.pagination(
                page.get("pageInfo") or {},
                current_page=variables["page"],
                per_page=variables["perPage"],
                count=len(medias),
            ),
            # Ranks continue across pages, so page 2 of a 25-per-page list
            # starts at 26.
            "data": mappers.map_anime_list(
                medias,
                rank_offset=(variables["page"] - 1) * variables["perPage"],
            ),
        }

    return _through_cache("top", variables, producer)


def _seasonal(request, season, year):
    variables = params.seasonal_variables(request, season, year)
    key = {"season": variables["season"], "year": year, **variables}
    return _through_cache(
        "seasonal", key, _listing(queries.SEASONAL_ANIME, variables)
    )


@jikan_endpoint
def season_now(request):
    """``/seasons/now`` — the season currently airing."""
    season, year = params.current_season()
    return _seasonal(request, season, year)


@jikan_endpoint
def season_upcoming(request):
    """``/seasons/upcoming`` — the season that has not started yet."""
    season, year = params.next_season()
    return _seasonal(request, season, year)


@jikan_endpoint
def season_year(request, year, season):
    """``/seasons/{year}/{season}``."""
    return _seasonal(request, season, year)


@jikan_endpoint
def schedules(request):
    """``/schedules`` — what airs on a given day.

    ``filter`` takes a weekday name, as it does in Jikan. Without one, the next
    seven days are returned, and every entry still carries its ``broadcast``
    block so a caller can group them by day itself.
    """
    filter_name = (request.GET.get("filter") or "").strip().casefold()
    if filter_name and filter_name not in params.WEEKDAYS:
        raise params.BadRequest(f"Invalid value for 'filter': {filter_name}.")

    weekday = params.WEEKDAYS[filter_name] if filter_name else None
    start, end = params.schedule_window(weekday)

    limit = params.parse_int(
        request, "limit", default=params.DEFAULT_LIMIT, minimum=1, maximum=params.MAX_LIMIT
    )
    page = params.parse_int(
        request, "page", default=1, minimum=1, maximum=params.MAX_PAGE
    )
    variables = {"from": start, "to": end, "page": page, "perPage": limit}

    def producer():
        payload = query(queries.SCHEDULE_WINDOW, variables) or {}
        page_data = payload.get("Page") or {}
        entries = page_data.get("airingSchedules") or []
        # The window is ordered by air time, which is the broadcast order.
        medias = [
            mappers.map_anime(
                entry.get("media") or {}, broadcast_at=entry.get("airingAt")
            )
            for entry in entries
            if entry.get("media")
        ]
        return {
            "pagination": mappers.pagination(
                page_data.get("pageInfo") or {},
                current_page=page,
                per_page=limit,
                count=len(medias),
            ),
            "data": medias,
        }

    return _through_cache("schedules", variables, producer)


@jikan_endpoint
def random_anime(request):
    """``/random/anime``.

    Deliberately bypasses the cache: a cached random entry would be the same
    entry every time, so the response is marked ``no-store``.
    """

    def producer():
        variables = {"page": random.randint(1, RANDOM_SAMPLE_PAGES)}
        media_list = ((query(queries.RANDOM_ANIME, variables) or {}).get("Page") or {}).get(
            "media"
        ) or []
        if not media_list:
            raise AniListNotFound("No anime found.")
        return {"data": mappers.map_anime(media_list[0])}

    return producer(), (0, 0), FRESH


@jikan_endpoint
def genres_anime(request):
    """``/genres/anime`` — the genre list."""

    def producer():
        names = (query(queries.GENRE_COLLECTION) or {}).get("GenreCollection") or []
        return mappers.map_genre_collection(names)

    return _through_cache("genres", {}, producer)
