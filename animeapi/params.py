"""Translation of Jikan v4 query parameters into AniList arguments.

Kept out of :mod:`animeapi.views` so the fiddly parts — enum names, score
scaling, date formats, weekday windows — can be unit tested without a network.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")

# Jikan's own ceiling for ?limit=; the frontend never asks for more than 25.
MAX_LIMIT = 25
DEFAULT_LIMIT = 25
MAX_PAGE = 1000


class BadRequest(ValueError):
    """A query parameter that Jikan would reject with a 400."""


# Jikan `type` -> AniList MediaFormat. AniList has no separate formats for
# Jikan's "TV Special"/"PV"/"CM", so those use the closest available format.
TYPE_TO_FORMAT = {
    "tv": "TV",
    "movie": "MOVIE",
    "ova": "OVA",
    "ona": "ONA",
    "special": "SPECIAL",
    "music": "MUSIC",
    "tv_special": "SPECIAL",
    "pv": "SPECIAL",
    "cm": "SPECIAL",
}

# Jikan `status` -> AniList MediaStatus.
STATUS_TO_ANILIST = {
    "airing": "RELEASING",
    "complete": "FINISHED",
    "upcoming": "NOT_YET_RELEASED",
    "currently_airing": "RELEASING",
    "finished_airing": "FINISHED",
    "not_yet_aired": "NOT_YET_RELEASED",
}

# Jikan `order_by` -> AniList sort prefix; `sort=asc|desc` picks the suffix.
ORDER_TO_SORT = {
    "mal_id": "ID",
    "title": "TITLE_ROMAJI",
    "start_date": "START_DATE",
    "end_date": "END_DATE",
    "episodes": "EPISODES",
    "score": "SCORE",
    "scored_by": "SCORE",
    "popularity": "POPULARITY",
    "members": "POPULARITY",
    "favorites": "FAVOURITES",
    "rank": "SCORE",
}

# Jikan `filter` on /top/anime -> (AniList status, AniList sort).
TOP_FILTERS = {
    "airing": (["SCORE_DESC"], "RELEASING"),
    "bypopularity": (["POPULARITY_DESC"], None),
    "favorite": (["FAVOURITES_DESC"], None),
    "upcoming": (["POPULARITY_DESC"], "NOT_YET_RELEASED"),
}

ANILIST_SEASONS = {
    "winter": "WINTER",
    "spring": "SPRING",
    "summer": "SUMMER",
    "fall": "FALL",
}

# AniList's canonical genre names, used to validate Jikan's `genres` filter.
KNOWN_GENRES = {
    name.casefold(): name
    for name in (
        "Action",
        "Adventure",
        "Comedy",
        "Drama",
        "Ecchi",
        "Fantasy",
        "Hentai",
        "Horror",
        "Mahou Shoujo",
        "Mecha",
        "Music",
        "Mystery",
        "Psychological",
        "Romance",
        "Sci-Fi",
        "Slice of Life",
        "Sports",
        "Supernatural",
        "Thriller",
    )
}

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


# ─── primitive parameter parsing ────────────────────────────────────────────


def parse_int(request, name, *, default, minimum, maximum):
    """Read an integer query parameter, clamping the upper bound as Jikan does."""
    raw = request.GET.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise BadRequest(f"Invalid value for '{name}': expected an integer.") from exc
    if value < minimum:
        raise BadRequest(f"Invalid value for '{name}': must be >= {minimum}.")
    return min(value, maximum)


def parse_float(request, name, *, minimum, maximum):
    raw = request.GET.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise BadRequest(f"Invalid value for '{name}': expected a number.") from exc
    if not minimum <= value <= maximum:
        raise BadRequest(
            f"Invalid value for '{name}': must be between {minimum} and {maximum}."
        )
    return value


def parse_bool(request, name, *, default=False):
    raw = request.GET.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes")


def parse_list(request, name):
    raw = request.GET.get(name) or ""
    return [part.strip() for part in raw.split(",") if part.strip()]


def _fuzzy_date(raw, name):
    """Jikan's ``YYYY-MM-DD`` -> AniList's ``FuzzyDateInt`` (``YYYYMMDD``)."""
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw.strip())
    except ValueError as exc:
        raise BadRequest(
            f"Invalid value for '{name}': expected YYYY-MM-DD."
        ) from exc
    return parsed.year * 10000 + parsed.month * 100 + parsed.day


# ─── endpoint argument builders ─────────────────────────────────────────────


def search_variables(request):
    """Build AniList variables for ``/anime`` (search)."""
    limit = parse_int(
        request, "limit", default=DEFAULT_LIMIT, minimum=1, maximum=MAX_LIMIT
    )
    page = parse_int(request, "page", default=1, minimum=1, maximum=MAX_PAGE)

    variables = {"page": page, "perPage": limit, "type": "ANIME"}

    search = (request.GET.get("q") or "").strip()
    if search:
        variables["search"] = search

    media_type = (request.GET.get("type") or "").strip().casefold()
    if media_type:
        if media_type not in TYPE_TO_FORMAT:
            raise BadRequest(f"Invalid value for 'type': {media_type} is not a type.")
        variables["format"] = TYPE_TO_FORMAT[media_type]

    status = (request.GET.get("status") or "").strip().casefold()
    if status:
        if status not in STATUS_TO_ANILIST:
            raise BadRequest(
                f"Invalid value for 'status': {status} is not a status."
            )
        variables["status"] = STATUS_TO_ANILIST[status]

    min_score = parse_float(request, "min_score", minimum=0, maximum=10)
    max_score = parse_float(request, "max_score", minimum=0, maximum=10)
    # AniList's _greater/_lesser bounds are exclusive; nudge them so that
    # min_score=8 includes titles that score exactly 8, as Jikan's does.
    if min_score is not None:
        variables["scoreGreater"] = max(0, int(min_score * 10) - 1)
    if max_score is not None:
        variables["scoreLesser"] = min(100, int(max_score * 10) + 1)

    included = [g.casefold() for g in parse_list(request, "genres")]
    excluded = [g.casefold() for g in parse_list(request, "genres_exclude")]
    for genre in included + excluded:
        if genre not in KNOWN_GENRES:
            raise BadRequest(f"Invalid value for 'genres': unknown genre '{genre}'.")
    if included:
        variables["genreIn"] = [KNOWN_GENRES[g] for g in included]
    if excluded:
        variables["genreNotIn"] = [KNOWN_GENRES[g] for g in excluded]

    if "sfw" in request.GET:
        # Jikan's `sfw` asks for a safe-for-work listing.
        variables["isAdult"] = not parse_bool(request, "sfw", default=False)

    start_date = _fuzzy_date(request.GET.get("start_date"), "start_date")
    end_date = _fuzzy_date(request.GET.get("end_date"), "end_date")
    if start_date is not None:
        variables["startGreater"] = start_date
    if end_date is not None:
        variables["startLesser"] = end_date

    order_by = (request.GET.get("order_by") or "").strip().casefold()
    direction = (request.GET.get("sort") or "").strip().casefold()

    if not order_by and not direction:
        # Asked for nothing specific, Jikan leads a title search with the best
        # match rather than the newest entry — searching "naruto" puts the 2002
        # series first, ahead of any recent spin-off. That is also what the
        # add-modal's suggestions and the cover-art lookup want, so a query
        # sorts by relevance. With no query there is nothing to match against,
        # and ordering falls back to newest-first, Jikan's documented default.
        variables["sort"] = ["SEARCH_MATCH"] if search else ["ID_DESC"]
        return variables

    order_by = order_by or "mal_id"
    if order_by not in ORDER_TO_SORT:
        raise BadRequest(f"Invalid value for 'order_by': {order_by}.")
    direction = direction or "desc"
    if direction not in ("asc", "desc"):
        raise BadRequest("Invalid value for 'sort': expected 'asc' or 'desc'.")
    base = ORDER_TO_SORT[order_by]
    variables["sort"] = [base if direction == "asc" else f"{base}_DESC"]

    return variables


def top_variables(request):
    """Build AniList variables for ``/top/anime``."""
    limit = parse_int(
        request, "limit", default=DEFAULT_LIMIT, minimum=1, maximum=MAX_LIMIT
    )
    page = parse_int(request, "page", default=1, minimum=1, maximum=MAX_PAGE)

    filter_name = (request.GET.get("filter") or "").strip().casefold()
    if filter_name and filter_name not in TOP_FILTERS:
        raise BadRequest(f"Invalid value for 'filter': {filter_name}.")
    sorts, status = TOP_FILTERS.get(filter_name, (["SCORE_DESC"], None))

    variables = {"page": page, "perPage": limit, "sort": sorts, "type": "ANIME"}
    if status is not None:
        variables["status"] = status

    media_type = (request.GET.get("type") or "").strip().casefold()
    if media_type:
        if media_type not in TYPE_TO_FORMAT:
            raise BadRequest(f"Invalid value for 'type': {media_type} is not a type.")
        variables["format"] = TYPE_TO_FORMAT[media_type]

    return variables


def seasonal_variables(request, season, year):
    """Build AniList variables for the ``/seasons`` endpoints."""
    limit = parse_int(
        request, "limit", default=DEFAULT_LIMIT, minimum=1, maximum=MAX_LIMIT
    )
    page = parse_int(request, "page", default=1, minimum=1, maximum=MAX_PAGE)

    season_key = (season or "").strip().casefold()
    if season_key not in ANILIST_SEASONS:
        raise BadRequest(f"Invalid value for 'season': {season}.")
    if not 1917 <= year <= 2100:
        raise BadRequest(f"Invalid value for 'year': {year}.")

    variables = {
        "page": page,
        "perPage": limit,
        "season": ANILIST_SEASONS[season_key],
        "seasonYear": year,
        "type": "ANIME",
    }

    media_type = (request.GET.get("type") or "").strip().casefold()
    if media_type:
        if media_type not in TYPE_TO_FORMAT:
            raise BadRequest(f"Invalid value for 'type': {media_type} is not a type.")
        variables["format"] = TYPE_TO_FORMAT[media_type]

    return variables


# ─── seasons and weekday windows ────────────────────────────────────────────


def current_season(today: date | None = None) -> tuple[str, int]:
    """Return the AniList season covering ``today`` as ``(SEASON, year)``."""
    today = today or datetime.now(JST).date()
    index = (today.month - 1) // 3  # 0=WINTER, 1=SPRING, 2=SUMMER, 3=FALL
    return ("WINTER", "SPRING", "SUMMER", "FALL")[index], today.year


def next_season(today: date | None = None) -> tuple[str, int]:
    """Return the season after ``current_season``, as ``(SEASON, year)``."""
    today = today or datetime.now(JST).date()
    index = (today.month - 1) // 3 + 1
    if index > 3:
        return "WINTER", today.year + 1
    return ("WINTER", "SPRING", "SUMMER", "FALL")[index], today.year


def schedule_window(weekday: int | None) -> tuple[int, int]:
    """Return ``(from, to)`` unix timestamps for a JST airing window.

    ``weekday`` selects one day of the week (``0`` = Monday). The window is the
    most recent occurrence of that weekday, which is what the frontend means
    when it asks for today's or yesterday's episodes: for any date within the
    last week, the most recent occurrence of its weekday *is* that date.
    Without a weekday the window is the next seven days.
    """
    now_jst = datetime.now(JST)

    if weekday is None:
        start = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        return int(start.timestamp()), int(end.timestamp())

    start_date = now_jst.date() - timedelta(
        days=(now_jst.date().weekday() - weekday) % 7
    )
    start = datetime.combine(start_date, datetime.min.time(), tzinfo=JST)
    end = start + timedelta(days=1)
    return int(start.timestamp()), int(end.timestamp())
