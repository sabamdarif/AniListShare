"""AniList (and TMDb, for the movie/TV fallback) responses -> Jikan v4 payloads.

Every response the API sends is built here, so this module is deliberately
pure: dictionaries in, dictionaries out, no network and no cache. That makes
the whole response contract unit-testable.

Where a source has no equivalent for a Jikan field, the key is still emitted
(with ``None``) so the shape stays predictable, and the reason is recorded on
the helper that produces it. Nothing is filled in with a plausible-looking
guess, because a wrong value is worse than an admitted gap. TMDb entries carry
far fewer fields than AniList ones, so most keys on a TMDb result are the empty
form; the ``map_tmdb_*`` helpers at the foot of the file own those decisions.

Known gaps, all inherited from AniList rather than chosen here:

* No MAL age rating, so ``rating`` is ``None`` except where adult content can
  be inferred (see :func:`_rating`).
* No MAL ids for genres, studios or the ranks in ``popularity``/``rank``.
* No WebP cover variants, so ``images`` only carries the ``jpg`` set.
* No themes or demographics, so those two keys are always empty lists.
"""

from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# Jikan identifies anime by MyAnimeList id. AniList carries a MAL id (``idMal``)
# for entries that exist on MAL, which is nearly all of them, but not for
# region-exclusive or unannounced titles. Those get a synthetic id derived from
# the AniList id, offset far above any real MAL id so the two cannot collide.
SYNTHETIC_MAL_ID_OFFSET = 100_000_000

# TMDb entries have no MyAnimeList id at all, so they get synthetic ids in their
# own ranges, offset far above the AniList ones so the three sources never
# collide. Movies and TV are split so /anime/{id} can route an id back to the
# right TMDb endpoint.
TMDB_MOVIE_ID_OFFSET = 200_000_000
TMDB_TV_ID_OFFSET = 300_000_000

# TMDb serves images from a fixed CDN; these sizes cover the frontend's small
# (suggestion) and regular (card) needs without a /configuration lookup.
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/"

BROADCAST_TIMEZONE = "Asia/Tokyo"

JST = ZoneInfo(BROADCAST_TIMEZONE)

_STATUS = {
    "FINISHED": "Finished Airing",
    "RELEASING": "Currently Airing",
    "NOT_YET_RELEASED": "Not yet aired",
    # MAL has no cancelled or on-hiatus state, so these take the closest
    # Jikan string rather than dropping the entry's status entirely.
    "CANCELLED": "Finished Airing",
    "HIATUS": "Currently Airing",
}

_FORMAT = {
    "TV": "TV",
    "TV_SHORT": "TV",
    "MOVIE": "Movie",
    "SPECIAL": "Special",
    "OVA": "OVA",
    "ONA": "ONA",
    "MUSIC": "Music",
}

_SOURCE = {
    "ORIGINAL": "Original",
    "MANGA": "Manga",
    "LIGHT_NOVEL": "Light novel",
    "VISUAL_NOVEL": "Visual novel",
    "VIDEO_GAME": "Video game",
    "NOVEL": "Novel",
    "DOUJINSHI": "Doujinshi",
    "ANIME": "Anime",
    "WEB_MANGA": "Web manga",
    "WEB_NOVEL": "Web novel",
    "GAME": "Game",
    "COMIC": "Comic",
    "LIVE_ACTION": "Live action",
    "MUSIC": "Music",
    "PICTURE_BOOK": "Picture book",
    "RADIO": "Radio",
    "BOOK": "Book",
    "CARD_GAME": "Card game",
    "FOUR_KOMA": "4-koma manga",
    "MANHWA": "Manhwa",
    "MANHUA": "Manhua",
    "MIXED_MEDIA": "Mixed media",
    "MULTIMEDIA_PROJECT": "Multimedia project",
    "PODCAST": "Podcast",
    "TAPESTRY": "Tapestry",
    "OTHER": "Other",
}

# AniList's relation enum -> the wording MAL uses. AniList reports the source
# material as SOURCE, which MAL files under "Adaptation".
_RELATION = {
    "ADAPTATION": "Adaptation",
    "SOURCE": "Adaptation",
    "SEQUEL": "Sequel",
    "PREQUEL": "Prequel",
    "SIDE_STORY": "Side story",
    "PARENT": "Parent story",
    "ALTERNATIVE": "Alternative",
    "SPIN_OFF": "Spin-off",
    "SUMMARY": "Summary",
    "CHARACTER": "Character",
    "COMPILATION": "Other",
    "CONTAINS": "Other",
    "OTHER": "Other",
}

_DAY_NAMES = (
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
    "Sundays",
)

_MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

_TRAILER_IMAGE_KEYS = (
    "image_url",
    "small_image_url",
    "medium_image_url",
    "large_image_url",
    "maximum_image_url",
)


# ─── individual fields ──────────────────────────────────────────────────────


def _mal_id(media):
    """The MAL id Jikan would use, or a synthetic one for AniList-only entries."""
    id_mal = media.get("idMal")
    if id_mal:
        return id_mal
    anilist_id = media.get("id")
    if anilist_id is None:
        return None
    return SYNTHETIC_MAL_ID_OFFSET + int(anilist_id)


def _url(media, mal_id):
    if media.get("idMal"):
        return f"https://myanimelist.net/anime/{mal_id}"
    # No MAL counterpart exists, so point at where the record actually lives.
    return media.get("siteUrl")


def _images(media):
    """Jikan's cover block, restricted to the ``jpg`` set.

    AniList serves one image per size and no WebP variants, so ``webp`` is left
    out rather than filled with JPEG URLs under a WebP label. Callers that ask
    for WebP fall back to JPEG, which is the order the frontend already uses.
    """
    cover = media.get("coverImage") or {}
    return {
        "jpg": {
            "image_url": cover.get("large"),
            "small_image_url": cover.get("medium"),
            "large_image_url": cover.get("extraLarge") or cover.get("large"),
        }
    }


def _trailer(media):
    """Jikan's trailer block.

    AniList returns the YouTube video id and one thumbnail; Jikan's other four
    thumbnail sizes are derived from the same id, since YouTube serves them at
    fixed URLs.
    """
    trailer = media.get("trailer") or {}
    video_id = None
    if (trailer.get("site") or "").lower() == "youtube":
        video_id = trailer.get("id")

    if not video_id:
        return {
            "youtube_id": None,
            "url": None,
            "embed_url": None,
            "images": dict.fromkeys(_TRAILER_IMAGE_KEYS),
        }

    return {
        "youtube_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "embed_url": f"https://www.youtube.com/embed/{video_id}",
        "images": {
            "image_url": f"https://img.youtube.com/vi/{video_id}/default.jpg",
            "small_image_url": f"https://img.youtube.com/vi/{video_id}/default.jpg",
            "medium_image_url": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg",
            "large_image_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            "maximum_image_url": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        },
    }


def _titles(media):
    title = media.get("title") or {}
    romaji = title.get("romaji")
    english = title.get("english")
    native = title.get("native")

    entries = []
    if romaji or english or native:
        entries.append({"type": "Default", "title": romaji or english or native})
    for synonym in media.get("synonyms") or []:
        entries.append({"type": "Synonym", "title": synonym})
    if native:
        entries.append({"type": "Japanese", "title": native})
    if english:
        entries.append({"type": "English", "title": english})
    return entries


def _default_title(media):
    title = media.get("title") or {}
    return title.get("romaji") or title.get("english") or title.get("native")


def _score(media):
    """AniList scores 0-100; Jikan scores 0-10.

    ``averageScore`` is the weighted score and the one expected to be shown;
    ``meanScore`` covers entries too new to have one.
    """
    for key in ("averageScore", "meanScore"):
        value = media.get(key)
        if value is not None:
            return round(value / 10, 1)
    return None


def _duration(media):
    """Jikan renders duration as text, e.g. ``"23 min per ep"``."""
    minutes = media.get("duration")
    if not minutes:
        return None
    if media.get("format") == "MOVIE":
        return f"{minutes} min"
    return f"{minutes} min per ep"


def _rating(media, genre_names):
    """Jikan carries MAL's age rating, which AniList does not have.

    Only the two cases that can be established from AniList's own data are
    reported. Everything else stays ``None``: defaulting every title to "PG-13"
    would put a confident-looking badge on thousands of entries that were never
    rated that way.
    """
    if media.get("isAdult") or "Hentai" in genre_names:
        return "Rx - Hentai"
    if "Ecchi" in genre_names:
        return "R+ - Mild Nudity"
    return None


def _iso(parts):
    """AniList's partial date -> the ISO 8601 string the frontend parses.

    Missing month and day fall back to January 1st, which is how Jikan reports
    a series whose exact start day was never recorded.
    """
    if not parts or not parts.get("year"):
        return None
    try:
        return datetime(
            parts["year"], parts.get("month") or 1, parts.get("day") or 1,
            tzinfo=timezone.utc,
        ).isoformat()
    except ValueError:
        return None


def _date_parts(parts):
    if not parts:
        return {"day": None, "month": None, "year": None}
    return {
        "day": parts.get("day"),
        "month": parts.get("month"),
        "year": parts.get("year"),
    }


def _human_date(parts):
    if not parts or not parts.get("year"):
        return "?"
    if parts.get("month") and parts.get("day"):
        return f"{_MONTHS[parts['month'] - 1]} {parts['day']}, {parts['year']}"
    if parts.get("month"):
        return f"{_MONTHS[parts['month'] - 1]} {parts['year']}"
    return str(parts["year"])


def _aired(start, end):
    """Jikan's aired block: raw dates, their parts, and a display string."""
    string = None
    if start and start.get("year"):
        string = f"{_human_date(start)} to {_human_date(end)}"
    return {
        "from": _iso(start),
        "to": _iso(end),
        "prop": {"from": _date_parts(start), "to": _date_parts(end)},
        "string": string,
    }


def _broadcast(broadcast_at, media):
    """Jikan's broadcast block, resolved to a Japanese airing slot.

    MAL reports the weekly Japanese broadcast; AniList gives a unix timestamp,
    so the weekday and clock time are read in Asia/Tokyo — otherwise a Sunday
    evening show in Japan would be reported as airing on Saturday. Series that
    have finished have no upcoming episode and report nulls, as Jikan's do.
    """
    if broadcast_at is None:
        broadcast_at = (media.get("nextAiringEpisode") or {}).get("airingAt")
    if not broadcast_at:
        return {"day": None, "time": None, "timezone": None, "string": None}

    local = datetime.fromtimestamp(broadcast_at, tz=JST)
    day = _DAY_NAMES[local.weekday()]
    clock = local.strftime("%H:%M")
    return {
        "day": day,
        "time": clock,
        "timezone": BROADCAST_TIMEZONE,
        "string": f"{day} at {clock} (JST)",
    }


def _split_studios(media):
    """Split credited companies into Jikan's studios and producers.

    AniList marks the animation studio with ``isMain`` and lists licensors and
    production committees alongside it, which is the same distinction MAL makes
    between "studios" and "producers".
    """
    studios, producers = [], []
    for edge in (media.get("studios") or {}).get("edges") or []:
        name = (edge.get("node") or {}).get("name")
        if not name:
            continue
        (studios if edge.get("isMain") else producers).append(name)
    return studios, producers


def _named_entries(names):
    """Jikan's nested genre/studio entries.

    AniList has no MAL id or page URL for these, so both are ``None`` rather
    than an invented id that would quietly mislead anything filtering on it.
    """
    return [
        {"mal_id": None, "type": "anime", "name": name, "url": None}
        for name in names
    ]


def _split_genres(media):
    """Jikan separates Hentai into ``explicit_genres``; AniList does not.

    Themes and demographics are left empty instead of being guessed from the
    genre list — inferring "Shounen" from "Action" would assert something the
    data never said.
    """
    names = [name for name in (media.get("genres") or []) if name]
    regular = [name for name in names if name != "Hentai"]
    explicit = [name for name in names if name == "Hentai"]
    return _named_entries(regular), _named_entries(explicit)


def _synopsis(description):
    """AniList descriptions are lightly marked up; Jikan's synopsis is text.

    ``<br>`` becomes a newline and remaining tags are dropped, so the result is
    plain text. Trailing source credits are kept — they are attribution, and
    the frontend renders this through ``textContent``.
    """
    if not description:
        return None
    text = re.sub(r"<br\s*/?>", "\n", description, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text or None


def _plain_name(node):
    title = node.get("title") or {}
    return title.get("romaji") or title.get("english") or title.get("native")


# ─── whole objects ──────────────────────────────────────────────────────────


def map_anime(media, *, rank=None, broadcast_at=None, full=False):
    """Translate one AniList media object into Jikan's anime shape.

    ``broadcast_at`` is passed by the schedules endpoint, where the airing time
    of the scheduled episode is more precise than the entry's next episode.
    ``full`` adds the related works and external links, as Jikan's
    ``/anime/{id}/full`` does.
    """
    media = media or {}
    genre_names = [name for name in (media.get("genres") or []) if name]
    genres, explicit_genres = _split_genres(media)
    studios, producers = _split_studios(media)
    start_date = media.get("startDate")
    end_date = media.get("endDate")
    mal_id = _mal_id(media)

    anime = {
        "mal_id": mal_id,
        "url": _url(media, mal_id),
        "images": _images(media),
        "trailer": _trailer(media),
        "approved": True,
        "titles": _titles(media),
        "title": _default_title(media),
        "title_english": (media.get("title") or {}).get("english"),
        "title_japanese": (media.get("title") or {}).get("native"),
        "title_synonyms": media.get("synonyms") or [],
        "type": _FORMAT.get(media.get("format")),
        "source": _SOURCE.get(media.get("source")),
        "episodes": media.get("episodes"),
        "status": _STATUS.get(media.get("status")),
        "airing": media.get("status") == "RELEASING",
        "aired": _aired(start_date, end_date),
        "duration": _duration(media),
        "rating": _rating(media, genre_names),
        "score": _score(media),
        # AniList does not expose how many users scored a title.
        "scored_by": None,
        "rank": rank,
        # AniList's `popularity` counts members while Jikan's is a rank, so the
        # count is reported as `members` and `popularity` stays None.
        "popularity": None,
        "members": media.get("popularity"),
        "favorites": media.get("favourites"),
        "synopsis": _synopsis(media.get("description")),
        "background": None,
        "season": (media.get("season") or "").lower() or None,
        "year": media.get("seasonYear"),
        "broadcast": _broadcast(broadcast_at, media),
        "producers": _named_entries(producers),
        # AniList has no concept of a licensing entity.
        "licensors": [],
        "studios": _named_entries(studios),
        "genres": genres,
        "explicit_genres": explicit_genres,
        "themes": [],
        "demographics": [],
    }

    if full:
        anime["relations"] = map_relations(media)
        anime["external"] = map_external_links(media)
        anime["streaming"] = []

    return anime


def map_anime_list(medias, *, rank_offset=None):
    """Map a page of entries, numbering them when the order *is* the ranking."""
    return [
        map_anime(media, rank=(rank_offset + index + 1) if rank_offset is not None else None)
        for index, media in enumerate(medias or [])
    ]


def map_relations(media):
    """Jikan's ``relations``: related entries grouped by relation type."""
    grouped: dict[str, list] = {}
    for edge in (media.get("relations") or {}).get("edges") or []:
        node = edge.get("node") or {}
        relation = _RELATION.get(edge.get("relationType"), "Other")
        entry_type = "manga" if (node.get("type") or "").upper() == "MANGA" else "anime"
        id_mal = node.get("idMal")
        grouped.setdefault(relation, []).append(
            {
                "mal_id": id_mal
                or (
                    SYNTHETIC_MAL_ID_OFFSET + int(node["id"])
                    if node.get("id") is not None
                    else None
                ),
                "type": entry_type,
                "name": _plain_name(node),
                "url": (
                    f"https://myanimelist.net/{entry_type}/{id_mal}"
                    if id_mal
                    else None
                ),
            }
        )
    return [
        {"relation": relation, "entry": entries}
        for relation, entries in grouped.items()
    ]


def map_external_links(media):
    """Jikan's ``external``: official sites and streaming pages."""
    entries = []
    for link in media.get("externalLinks") or []:
        url = link.get("url")
        if not url:
            continue
        entries.append({"name": link.get("site"), "url": url})
    return entries


def pagination(page_info, *, current_page, per_page, count):
    """Jikan's pagination envelope.

    AniList stops counting at 5000 results, so on deep pages ``total`` is a
    floor rather than an exact count.
    """
    page_info = page_info or {}
    return {
        "last_visible_page": page_info.get("lastPage") or 1,
        "has_next_page": bool(page_info.get("hasNextPage")),
        "current_page": current_page,
        "items": {
            "count": count,
            "total": page_info.get("total"),
            "per_page": per_page,
        },
    }


def map_genre_collection(names):
    """Jikan's ``/genres/anime``.

    AniList lists genre names but the MAL id and the per-genre title count
    would each need one extra query per genre, so both are ``None``.
    """
    return {
        "data": [
            {"mal_id": None, "name": name, "count": None, "url": None}
            for name in names or []
        ]
    }


# ─── TMDb -> Jikan ──────────────────────────────────────────────────────────


def _tmdb_images(poster_path):
    """Jikan's cover block built from a TMDb poster path.

    TMDb has no WebP set and one poster per title, so ``webp`` is omitted and
    the three jpg sizes point at the fixed image CDN. No poster yields nulls.
    """
    if not poster_path:
        return {
            "jpg": {
                "image_url": None,
                "small_image_url": None,
                "large_image_url": None,
            }
        }
    return {
        "jpg": {
            "image_url": f"{TMDB_IMAGE_BASE}w500{poster_path}",
            "small_image_url": f"{TMDB_IMAGE_BASE}w185{poster_path}",
            "large_image_url": f"{TMDB_IMAGE_BASE}original{poster_path}",
        }
    }


def _tmdb_date_parts(raw):
    """TMDb's ``YYYY-MM-DD`` release date -> AniList-style date parts, or None."""
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return {"year": parsed.year, "month": parsed.month, "day": parsed.day}


def _tmdb_entry(mal_id, *, url, title, poster_path, type_, vote_average,
                overview, date_raw, episodes=None, duration=None, status=None,
                genre_names=None, full=False):
    """Assemble one TMDb title into Jikan's anime shape.

    Emits every key :func:`map_anime` does, with the empty form for everything
    TMDb does not carry, so a TMDb result parses the same as an AniList one.
    """
    start_parts = _tmdb_date_parts(date_raw)
    entry = {
        "mal_id": mal_id,
        "url": url,
        "images": _tmdb_images(poster_path),
        "trailer": {
            "youtube_id": None,
            "url": None,
            "embed_url": None,
            "images": dict.fromkeys(_TRAILER_IMAGE_KEYS),
        },
        "approved": True,
        "titles": [{"type": "Default", "title": title}] if title else [],
        "title": title,
        "title_english": title,
        "title_japanese": None,
        "title_synonyms": [],
        "type": type_,
        "source": None,
        "episodes": episodes,
        "status": status,
        "airing": status == "Currently Airing",
        "aired": _aired(start_parts, None),
        "duration": duration,
        "rating": None,
        "score": round(vote_average, 1) if vote_average else None,
        "scored_by": None,
        "rank": None,
        "popularity": None,
        "members": None,
        "favorites": None,
        "synopsis": overview or None,
        "background": None,
        "season": None,
        "year": start_parts["year"] if start_parts else None,
        "broadcast": {"day": None, "time": None, "timezone": None, "string": None},
        "producers": [],
        "licensors": [],
        "studios": [],
        "genres": _named_entries(genre_names or []),
        "explicit_genres": [],
        "themes": [],
        "demographics": [],
    }
    if full:
        entry["relations"] = []
        entry["external"] = [{"name": "TMDb", "url": url}] if url else []
        entry["streaming"] = []
    return entry


def _tmdb_movie_status(status):
    """TMDb movie status -> the closest Jikan airing string."""
    if status == "Released":
        return "Finished Airing"
    if status in ("Planned", "In Production", "Post Production"):
        return "Not yet aired"
    return None


def _tmdb_tv_status(status, in_production):
    """TMDb series status -> the closest Jikan airing string."""
    if status in ("Ended", "Canceled"):
        return "Finished Airing"
    if status == "Planned":
        return "Not yet aired"
    if status == "Returning Series" or in_production:
        return "Currently Airing"
    return None


def map_tmdb_search_results(results):
    """Map ``/search/multi`` movie and TV entries into Jikan anime shape.

    Search results carry no episode count or genres, so those stay empty; a
    detail lookup fills them. People are already dropped by the transport.
    """
    mapped = []
    for item in results or []:
        if item.get("id") is None:
            continue
        kind = item.get("media_type")
        if kind == "movie":
            mapped.append(
                _tmdb_entry(
                    TMDB_MOVIE_ID_OFFSET + int(item["id"]),
                    url=f"https://www.themoviedb.org/movie/{item['id']}",
                    title=item.get("title") or item.get("original_title"),
                    poster_path=item.get("poster_path"),
                    type_="Movie",
                    vote_average=item.get("vote_average"),
                    overview=item.get("overview"),
                    date_raw=item.get("release_date"),
                )
            )
        elif kind == "tv":
            mapped.append(
                _tmdb_entry(
                    TMDB_TV_ID_OFFSET + int(item["id"]),
                    url=f"https://www.themoviedb.org/tv/{item['id']}",
                    title=item.get("name") or item.get("original_name"),
                    poster_path=item.get("poster_path"),
                    type_="TV",
                    vote_average=item.get("vote_average"),
                    overview=item.get("overview"),
                    date_raw=item.get("first_air_date"),
                )
            )
    return mapped


def map_tmdb_movie(detail, *, full=False):
    """Map a ``/movie/{id}`` record into Jikan's anime shape."""
    detail = detail or {}
    runtime = detail.get("runtime")
    return _tmdb_entry(
        TMDB_MOVIE_ID_OFFSET + int(detail["id"]),
        url=f"https://www.themoviedb.org/movie/{detail['id']}",
        title=detail.get("title") or detail.get("original_title"),
        poster_path=detail.get("poster_path"),
        type_="Movie",
        vote_average=detail.get("vote_average"),
        overview=detail.get("overview"),
        date_raw=detail.get("release_date"),
        # A movie is a single unit of watching, which is how the list stores it.
        episodes=1,
        duration=f"{runtime} min" if runtime else None,
        status=_tmdb_movie_status(detail.get("status")),
        genre_names=[g.get("name") for g in detail.get("genres") or [] if g.get("name")],
        full=full,
    )


def map_tmdb_tv(detail, *, full=False):
    """Map a ``/tv/{id}`` record into Jikan's anime shape."""
    detail = detail or {}
    run_times = detail.get("episode_run_time") or []
    return _tmdb_entry(
        TMDB_TV_ID_OFFSET + int(detail["id"]),
        url=f"https://www.themoviedb.org/tv/{detail['id']}",
        title=detail.get("name") or detail.get("original_name"),
        poster_path=detail.get("poster_path"),
        type_="TV",
        vote_average=detail.get("vote_average"),
        overview=detail.get("overview"),
        date_raw=detail.get("first_air_date"),
        episodes=detail.get("number_of_episodes"),
        duration=f"{run_times[0]} min per ep" if run_times else None,
        status=_tmdb_tv_status(detail.get("status"), detail.get("in_production")),
        genre_names=[g.get("name") for g in detail.get("genres") or [] if g.get("name")],
        full=full,
    )


def tmdb_pagination(body, *, current_page, per_page, count):
    """Jikan's pagination envelope from TMDb's search counts."""
    body = body or {}
    total_pages = body.get("total_pages") or 1
    return {
        "last_visible_page": total_pages,
        "has_next_page": current_page < total_pages,
        "current_page": current_page,
        "items": {
            "count": count,
            "total": body.get("total_results"),
            "per_page": per_page,
        },
    }
