"""Endpoint tests for /api/v4/.

The AniList call is always monkeypatched, so what is asserted here is our own
behaviour: parameter handling, Jikan's response envelope, cache headers, and
how an upstream failure is reported.
"""

import json
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.test import RequestFactory

from animeapi import mappers, params, queries, views
from animeapi.anilist import AniListError, AniListNotFound
from animeapi.caching import cache_key


# Below SYNTHETIC_MAL_ID_OFFSET, so the detail view reads this as a real
# MyAnimeList id rather than one of its own synthetic ids.
UNKNOWN_MAL_ID = 999_999


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def upstream(monkeypatch):
    """Stand in for AniList, recording what it was asked for."""
    state = SimpleNamespace(calls=[], registry={}, last=None)

    def fake_query(document, variables=None):
        state.calls.append((document, variables or {}))
        state.last = variables or {}
        handler = state.registry.get(document)
        if handler is None:
            raise AssertionError("the view issued an unregistered GraphQL document")
        return handler(variables or {}) if callable(handler) else handler

    monkeypatch.setattr(views, "query", fake_query)
    return state


def page(medias, *, total=100, last_page=4, has_next=True, per=25, key="media"):
    return {
        "Page": {
            key: medias,
            "pageInfo": {
                "total": total,
                "currentPage": 1,
                "lastPage": last_page,
                "hasNextPage": has_next,
                "perPage": per,
            },
        }
    }


def media(**overrides):
    payload = {
        "id": 20,
        "idMal": 20,
        "title": {"romaji": "NARUTO", "english": "Naruto", "native": "NARUTO -ナルト-"},
        "synonyms": [],
        "coverImage": {"extraLarge": "xl.jpg", "large": "l.jpg", "medium": "m.jpg"},
        "format": "TV",
        "status": "FINISHED",
        "source": "MANGA",
        "description": "A ninja.",
        "episodes": 220,
        "duration": 23,
        "averageScore": 80,
        "meanScore": 80,
        "popularity": 726340,
        "favourites": 38890,
        "season": "FALL",
        "seasonYear": 2002,
        "genres": ["Action"],
        "isAdult": False,
        "siteUrl": "https://anilist.co/anime/20",
        "trailer": {"id": None, "site": None, "thumbnail": None},
        "studios": {"edges": [{"isMain": True, "node": {"name": "Studio Pierrot"}}]},
        "startDate": {"year": 2002, "month": 10, "day": 3},
        "endDate": {"year": 2007, "month": 2, "day": 8},
        "nextAiringEpisode": None,
    }
    payload.update(overrides)
    return payload


def body(response):
    return json.loads(response.content)


def failing(error):
    def _raise(_variables=None):
        raise error

    return _raise


# ─── search ─────────────────────────────────────────────────────────────────


def test_search_returns_jikans_envelope(rf, upstream):
    upstream.registry[queries.ANIME_SEARCH] = page([media()], total=30, last_page=2)
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto", "limit": "1"}))

    assert response.status_code == 200
    payload = body(response)
    assert payload["pagination"] == {
        "last_visible_page": 2,
        "has_next_page": True,
        "current_page": 1,
        "items": {"count": 1, "total": 30, "per_page": 1},
    }
    assert payload["data"][0]["mal_id"] == 20
    assert payload["data"][0]["title_english"] == "Naruto"


def test_search_is_cached_at_the_cdn(rf, upstream):
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    assert response["Cache-Control"] == "public, s-maxage=600, stale-while-revalidate=3000"
    assert response["X-Anime-API-Cache"] == "fresh"


def test_search_clamps_limit_to_jikans_ceiling(rf, upstream):
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    views.anime_search(rf.get("/api/v4/anime", {"limit": "99"}))
    assert upstream.last["perPage"] == params.MAX_LIMIT


def test_search_rejects_a_non_numeric_limit_with_jikans_error_body(rf, upstream):
    response = views.anime_search(rf.get("/api/v4/anime", {"limit": "ten"}))

    assert response.status_code == 400
    assert body(response)["type"] == "BadRequestException"
    assert body(response)["status"] == 400
    assert response["Cache-Control"] == "no-store"


def test_search_only_answers_get(rf, upstream):
    assert views.anime_search(rf.post("/api/v4/anime")).status_code == 405


def test_an_identical_request_is_served_from_cache(rf, upstream):
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    first = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))
    second = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    assert len(upstream.calls) == 1
    assert first["X-Anime-API-Cache"] == "fresh"
    assert second["X-Anime-API-Cache"] == "hit"


def test_an_expired_entry_is_served_when_the_upstream_fails(rf, upstream):
    """Better slightly old metadata than a blank homepage."""
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    # Age the cached copy past its fresh window but inside the stale one.
    key = cache_key("search", upstream.last)
    stored = cache.get(key)
    stored["stored_at"] -= 1800
    cache.set(key, stored, timeout=3600)

    upstream.registry[queries.ANIME_SEARCH] = failing(AniListError("upstream down"))
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    assert response.status_code == 200
    assert response["X-Anime-API-Cache"] == "stale"
    assert response["Cache-Control"].startswith("public, s-maxage=60")
    assert body(response)["data"][0]["mal_id"] == 20


def test_an_upstream_failure_without_a_cache_is_reported_as_a_bad_gateway(rf, upstream):
    upstream.registry[queries.ANIME_SEARCH] = failing(AniListError("upstream down"))
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    assert response.status_code == 502
    assert body(response)["type"] == "BadResponseException"
    assert response["Cache-Control"] == "no-store"


# ─── detail ─────────────────────────────────────────────────────────────────


def test_detail_wraps_the_entry_in_data_like_jikan(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID] = {"Media": media()}
    response = views.anime_detail(rf.get("/api/v4/anime/20"), 20)

    assert response.status_code == 200
    assert body(response)["data"]["mal_id"] == 20
    assert upstream.last == {"idMal": 20}


def test_detailed_entries_are_looked_up_by_their_mal_id(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID_FULL] = {"Media": media()}
    response = views.anime_detail(rf.get("/api/v4/anime/20/full"), 20, full=True)

    assert response.status_code == 200
    assert "relations" in body(response)["data"]
    assert upstream.last == {"idMal": 20}


def test_synthetic_ids_are_resolved_against_the_anilist_id(rf, upstream):
    upstream.registry[queries.MEDIA_BY_ID] = {"Media": media(idMal=None, id=555)}
    views.anime_detail(rf.get("/"), mappers.SYNTHETIC_MAL_ID_OFFSET + 555)
    assert upstream.last == {"id": 555}


def test_a_null_entry_is_a_404(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID] = {"Media": None}
    response = views.anime_detail(rf.get("/"), UNKNOWN_MAL_ID)

    assert response.status_code == 404
    assert body(response)["type"] == "ResourceNotFoundException"


def test_an_upstream_404_is_passed_through(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID] = failing(
        AniListNotFound("AniList has no entry for that id")
    )
    response = views.anime_detail(rf.get("/"), UNKNOWN_MAL_ID)
    assert response.status_code == 404


def test_full_and_plain_detail_do_not_share_a_cache_entry(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID] = {"Media": media()}
    upstream.registry[queries.MEDIA_BY_MAL_ID_FULL] = {"Media": media()}
    views.anime_detail(rf.get("/"), 20)
    views.anime_detail(rf.get("/"), 20, full=True)
    assert len(upstream.calls) == 2


# ─── top ────────────────────────────────────────────────────────────────────


def test_top_numbers_ranks_across_pages(rf, upstream):
    upstream.registry[queries.TOP_ANIME] = page([media(idMal=i) for i in (1, 2, 3)])
    response = views.top_anime(rf.get("/api/v4/top/anime", {"page": "2", "limit": "3"}))

    assert [entry["rank"] for entry in body(response)["data"]] == [4, 5, 6]


def test_top_filter_reaches_anilist(rf, upstream):
    upstream.registry[queries.TOP_ANIME] = page([media()])
    views.top_anime(rf.get("/api/v4/top/anime", {"filter": "favorite"}))
    assert upstream.last["sort"] == ["FAVOURITES_DESC"]


def test_top_rejects_an_unknown_filter(rf, upstream):
    assert views.top_anime(rf.get("/api/v4/top/anime", {"filter": "spicy"})).status_code == 400


# ─── seasons ────────────────────────────────────────────────────────────────


def test_seasons_now_asks_for_the_current_season(rf, upstream):
    upstream.registry[queries.SEASONAL_ANIME] = page([media()])
    views.season_now(rf.get("/api/v4/seasons/now"))

    season, year = params.current_season()
    assert upstream.last["season"] == season
    assert upstream.last["seasonYear"] == year


def test_seasons_upcoming_asks_for_the_next_season(rf, upstream):
    upstream.registry[queries.SEASONAL_ANIME] = page([media()])
    views.season_upcoming(rf.get("/api/v4/seasons/upcoming"))

    season, year = params.next_season()
    assert upstream.last["season"] == season
    assert upstream.last["seasonYear"] == year


def test_a_specific_season_can_be_requested(rf, upstream):
    upstream.registry[queries.SEASONAL_ANIME] = page([media()])
    response = views.season_year(rf.get("/api/v4/seasons/2026/fall"), 2026, "fall")

    assert response.status_code == 200
    assert upstream.last["season"] == "FALL"


def test_an_unknown_season_is_rejected(rf, upstream):
    assert views.season_year(rf.get("/"), 2026, "monsoon").status_code == 400


# ─── schedules ──────────────────────────────────────────────────────────────


def test_schedules_asks_for_one_japanese_day(rf, upstream):
    upstream.registry[queries.SCHEDULE_WINDOW] = lambda variables: page(
        [{"airingAt": variables["from"] + 3600, "episode": 4, "media": media()}],
        key="airingSchedules",
    )
    response = views.schedules(rf.get("/api/v4/schedules", {"filter": "monday"}))

    assert response.status_code == 200
    assert upstream.last["to"] - upstream.last["from"] == 24 * 60 * 60
    entry = body(response)["data"][0]
    assert entry["broadcast"]["day"] == "Mondays"
    assert entry["broadcast"]["time"] == "01:00"


def test_schedules_without_a_filter_covers_a_week(rf, upstream):
    upstream.registry[queries.SCHEDULE_WINDOW] = page([], key="airingSchedules")
    views.schedules(rf.get("/api/v4/schedules"))
    assert upstream.last["to"] - upstream.last["from"] == 7 * 24 * 60 * 60


def test_schedules_rejects_an_unknown_day(rf, upstream):
    assert views.schedules(rf.get("/api/v4/schedules", {"filter": "funday"})).status_code == 400


def test_schedules_skips_entries_without_a_media_node(rf, upstream):
    upstream.registry[queries.SCHEDULE_WINDOW] = page(
        [{"airingAt": 1, "episode": 1, "media": None}], key="airingSchedules"
    )
    response = views.schedules(rf.get("/api/v4/schedules", {"filter": "monday"}))
    assert body(response)["data"] == []


# ─── random and genres ──────────────────────────────────────────────────────


def test_random_is_not_cached(rf, upstream):
    upstream.registry[queries.RANDOM_ANIME] = page([media()])
    first = views.random_anime(rf.get("/api/v4/random/anime"))
    views.random_anime(rf.get("/api/v4/random/anime"))

    assert first["Cache-Control"] == "no-store"
    assert len(upstream.calls) == 2
    assert body(first)["data"]["mal_id"] == 20


def test_random_reports_an_empty_sample(rf, upstream):
    upstream.registry[queries.RANDOM_ANIME] = page([])
    assert views.random_anime(rf.get("/api/v4/random/anime")).status_code == 404


def test_genres_are_returned_as_a_list(rf, upstream):
    upstream.registry[queries.GENRE_COLLECTION] = {"GenreCollection": ["Action", "Mecha"]}
    response = views.genres_anime(rf.get("/api/v4/genres/anime"))

    assert [genre["name"] for genre in body(response)["data"]] == ["Action", "Mecha"]


# ─── routing ────────────────────────────────────────────────────────────────


def test_ids_just_below_the_offset_are_real_mal_ids(rf, upstream):
    upstream.registry[queries.MEDIA_BY_MAL_ID] = {"Media": media()}
    views.anime_detail(rf.get("/"), mappers.SYNTHETIC_MAL_ID_OFFSET - 1)
    assert upstream.last == {"idMal": mappers.SYNTHETIC_MAL_ID_OFFSET - 1}


@pytest.mark.django_db
def test_a_wrong_method_answers_405_through_the_whole_stack(client, upstream):
    """CSRF middleware must not turn the documented 405 into a 403."""
    response = client.post("/api/v4/anime")
    assert response.status_code == 405
    assert "GET" in response["Allow"]


@pytest.mark.django_db
def test_routes_are_mounted_under_api_v4(client, upstream):
    """Covers the settings, project URLconf and app URLconf wiring together."""
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    response = client.get("/api/v4/anime", {"q": "naruto"})

    assert response.status_code == 200
    assert response.json()["data"][0]["mal_id"] == 20


@pytest.mark.django_db
def test_every_route_resolves(client, upstream):
    upstream.registry[queries.ANIME_SEARCH] = page([media()])
    upstream.registry[queries.TOP_ANIME] = page([media()])
    upstream.registry[queries.SEASONAL_ANIME] = page([media()])
    upstream.registry[queries.SCHEDULE_WINDOW] = page([], key="airingSchedules")
    upstream.registry[queries.MEDIA_BY_MAL_ID] = {"Media": media()}
    upstream.registry[queries.GENRE_COLLECTION] = {"GenreCollection": []}

    for url in (
        "/api/v4/anime",
        "/api/v4/anime/20",
        "/api/v4/top/anime",
        "/api/v4/seasons/now",
        "/api/v4/seasons/upcoming",
        "/api/v4/seasons/2026/fall",
        "/api/v4/schedules",
        "/api/v4/genres/anime",
    ):
        assert client.get(url).status_code == 200, url
