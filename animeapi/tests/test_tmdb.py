"""TMDb fallback tests for /api/v4/.

Both providers are monkeypatched: the AniList transport (``views.query``) and
the TMDb transport (the ``tmdb`` module functions the views call). What is
asserted is our own behaviour, not either network's.
"""

import json

import pytest
from django.core.cache import cache
from django.test import RequestFactory

from animeapi import mappers, tmdb, views
from animeapi.tmdb import TMDbError, TMDbNotFound


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def rf():
    return RequestFactory()


@pytest.fixture
def anilist(monkeypatch):
    """Patch the AniList transport; defaults to an empty result page."""
    holder = {"page": {"Page": {"media": [], "pageInfo": {}}}}

    def fake_query(document, variables=None):
        return holder["page"]

    monkeypatch.setattr(views, "query", fake_query)
    return holder


@pytest.fixture
def enable_tmdb(monkeypatch):
    monkeypatch.setattr(tmdb, "is_enabled", lambda: True)


def body(response):
    return json.loads(response.content)


# ─── sample TMDb payloads ─────────────────────────────────────────────────────

MOVIE_RESULT = {
    "media_type": "movie",
    "id": 27205,
    "title": "Inception",
    "original_title": "Inception",
    "poster_path": "/poster.jpg",
    "overview": "A thief who steals corporate secrets.",
    "release_date": "2010-07-16",
    "vote_average": 8.4,
}

TV_RESULT = {
    "media_type": "tv",
    "id": 1396,
    "name": "Breaking Bad",
    "original_name": "Breaking Bad",
    "poster_path": "/bb.jpg",
    "overview": "A chemistry teacher turns to crime.",
    "first_air_date": "2008-01-20",
    "vote_average": 8.9,
}

MOVIE_DETAIL = {
    "id": 27205,
    "title": "Inception",
    "poster_path": "/poster.jpg",
    "overview": "A thief.",
    "release_date": "2010-07-16",
    "vote_average": 8.4,
    "runtime": 148,
    "status": "Released",
    "genres": [{"id": 28, "name": "Action"}, {"id": 878, "name": "Science Fiction"}],
}

TV_DETAIL = {
    "id": 1396,
    "name": "Breaking Bad",
    "poster_path": "/bb.jpg",
    "overview": "A chemistry teacher.",
    "first_air_date": "2008-01-20",
    "vote_average": 8.9,
    "number_of_episodes": 62,
    "episode_run_time": [47],
    "status": "Ended",
    "in_production": False,
    "genres": [{"id": 18, "name": "Drama"}],
}


# ─── mappers ──────────────────────────────────────────────────────────────────


def test_movie_search_result_maps_to_jikan_shape():
    entry = mappers.map_tmdb_search_results([MOVIE_RESULT])[0]
    assert entry["mal_id"] == mappers.TMDB_MOVIE_ID_OFFSET + 27205
    assert entry["type"] == "Movie"
    assert entry["title"] == "Inception"
    assert entry["title_english"] == "Inception"
    assert entry["score"] == 8.4
    assert entry["year"] == 2010
    assert entry["aired"]["from"].startswith("2010-07-16")
    assert entry["images"]["jpg"]["image_url"] == f"{mappers.TMDB_IMAGE_BASE}w500/poster.jpg"
    assert entry["images"]["jpg"]["small_image_url"] == f"{mappers.TMDB_IMAGE_BASE}w185/poster.jpg"
    # A search result carries neither an episode count nor genres.
    assert entry["episodes"] is None
    assert entry["genres"] == []
    assert entry["url"] == "https://www.themoviedb.org/movie/27205"


def test_tv_search_result_uses_the_tv_offset_and_name():
    entry = mappers.map_tmdb_search_results([TV_RESULT])[0]
    assert entry["mal_id"] == mappers.TMDB_TV_ID_OFFSET + 1396
    assert entry["type"] == "TV"
    assert entry["title"] == "Breaking Bad"
    assert entry["year"] == 2008


def test_people_and_idless_results_are_skipped():
    results = [
        {"media_type": "person", "id": 5},
        {"media_type": "movie"},
        MOVIE_RESULT,
    ]
    mapped = mappers.map_tmdb_search_results(results)
    assert len(mapped) == 1
    assert mapped[0]["mal_id"] == mappers.TMDB_MOVIE_ID_OFFSET + 27205


def test_a_tmdb_entry_has_exactly_the_same_keys_as_an_anilist_one():
    tmdb_keys = set(mappers.map_tmdb_search_results([MOVIE_RESULT])[0])
    anilist_keys = set(mappers.map_anime({"id": 1, "idMal": 1}))
    assert tmdb_keys == anilist_keys


def test_full_detail_adds_relations_external_and_streaming():
    entry = mappers.map_tmdb_movie(MOVIE_DETAIL, full=True)
    assert entry["relations"] == []
    assert entry["external"] == [
        {"name": "TMDb", "url": "https://www.themoviedb.org/movie/27205"}
    ]
    assert entry["streaming"] == []


def test_movie_detail_fills_episodes_duration_status_and_genres():
    entry = mappers.map_tmdb_movie(MOVIE_DETAIL)
    assert entry["episodes"] == 1
    assert entry["duration"] == "148 min"
    assert entry["status"] == "Finished Airing"
    assert [g["name"] for g in entry["genres"]] == ["Action", "Science Fiction"]


def test_tv_detail_fills_episode_count_and_per_episode_duration():
    entry = mappers.map_tmdb_tv(TV_DETAIL)
    assert entry["episodes"] == 62
    assert entry["duration"] == "47 min per ep"
    assert entry["status"] == "Finished Airing"
    assert entry["airing"] is False


def test_images_are_null_without_a_poster():
    entry = mappers.map_tmdb_search_results([{**MOVIE_RESULT, "poster_path": None}])[0]
    assert entry["images"]["jpg"] == {
        "image_url": None,
        "small_image_url": None,
        "large_image_url": None,
    }


# ─── search fallback ──────────────────────────────────────────────────────────


def test_search_falls_back_to_tmdb_when_anilist_is_empty(rf, anilist, enable_tmdb, monkeypatch):
    calls = []

    def fake_search(query, *, page, per_page, include_adult=False):
        calls.append(query)
        return [TV_RESULT], {"page": 1, "total_pages": 1, "total_results": 1}

    monkeypatch.setattr(tmdb, "search", fake_search)
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "breaking bad"}))

    assert response.status_code == 200
    payload = body(response)
    assert calls == ["breaking bad"]
    assert payload["data"][0]["mal_id"] == mappers.TMDB_TV_ID_OFFSET + 1396
    assert payload["data"][0]["type"] == "TV"
    assert payload["pagination"]["items"]["total"] == 1


def test_search_does_not_touch_tmdb_when_anilist_has_matches(rf, anilist, enable_tmdb, monkeypatch):
    anilist["page"] = {
        "Page": {"media": [{"id": 20, "idMal": 20, "title": {"romaji": "Naruto"}}], "pageInfo": {}}
    }

    def boom(*args, **kwargs):
        raise AssertionError("TMDb must not be queried when AniList has results")

    monkeypatch.setattr(tmdb, "search", boom)
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "naruto"}))

    assert response.status_code == 200
    assert body(response)["data"][0]["mal_id"] == 20


def test_a_tmdb_failure_degrades_to_an_empty_page_not_a_502(rf, anilist, enable_tmdb, monkeypatch):
    def failing(*args, **kwargs):
        raise TMDbError("tmdb down")

    monkeypatch.setattr(tmdb, "search", failing)
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "breaking bad"}))

    assert response.status_code == 200
    assert body(response)["data"] == []


def test_tmdb_is_skipped_when_disabled(rf, anilist, monkeypatch):
    # is_enabled is False under the test settings (no token), so no patch needed.
    def boom(*args, **kwargs):
        raise AssertionError("a disabled fallback must not call TMDb")

    monkeypatch.setattr(tmdb, "search", boom)
    response = views.anime_search(rf.get("/api/v4/anime", {"q": "breaking bad"}))

    assert response.status_code == 200
    assert body(response)["data"] == []


def test_tmdb_is_skipped_without_a_query(rf, anilist, enable_tmdb, monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("no query means nothing to search TMDb for")

    monkeypatch.setattr(tmdb, "search", boom)
    response = views.anime_search(rf.get("/api/v4/anime"))

    assert response.status_code == 200
    assert body(response)["data"] == []


# ─── detail routing ───────────────────────────────────────────────────────────


def test_detail_resolves_a_tmdb_movie_id(rf, enable_tmdb, monkeypatch):
    monkeypatch.setattr(tmdb, "movie_detail", lambda tmdb_id: {**MOVIE_DETAIL, "id": tmdb_id})
    mal_id = mappers.TMDB_MOVIE_ID_OFFSET + 27205
    response = views.anime_detail(rf.get(f"/api/v4/anime/{mal_id}"), mal_id)

    assert response.status_code == 200
    payload = body(response)["data"]
    assert payload["type"] == "Movie"
    assert payload["mal_id"] == mal_id
    assert payload["episodes"] == 1


def test_detail_resolves_a_tmdb_tv_id(rf, enable_tmdb, monkeypatch):
    monkeypatch.setattr(tmdb, "tv_detail", lambda tmdb_id: {**TV_DETAIL, "id": tmdb_id})
    mal_id = mappers.TMDB_TV_ID_OFFSET + 1396
    response = views.anime_detail(rf.get(f"/api/v4/anime/{mal_id}"), mal_id)

    assert response.status_code == 200
    assert body(response)["data"]["type"] == "TV"


def test_detail_tmdb_404_becomes_jikan_not_found(rf, enable_tmdb, monkeypatch):
    def missing(tmdb_id):
        raise TMDbNotFound("gone")

    monkeypatch.setattr(tmdb, "tv_detail", missing)
    mal_id = mappers.TMDB_TV_ID_OFFSET + 999
    response = views.anime_detail(rf.get(f"/api/v4/anime/{mal_id}"), mal_id)

    assert response.status_code == 404
    assert body(response)["type"] == "ResourceNotFoundException"


def test_detail_tmdb_id_is_not_found_when_disabled(rf, monkeypatch):
    def boom(tmdb_id):
        raise AssertionError("a disabled fallback must not call TMDb")

    monkeypatch.setattr(tmdb, "movie_detail", boom)
    mal_id = mappers.TMDB_MOVIE_ID_OFFSET + 27205
    response = views.anime_detail(rf.get(f"/api/v4/anime/{mal_id}"), mal_id)

    assert response.status_code == 404
