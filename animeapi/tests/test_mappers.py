"""Response-shape tests for the AniList -> Jikan translation.

The input mimics AniList's real field names and the output is Jikan's contract,
so these tests pin the response shape without needing the network.
"""

from datetime import datetime, timezone

from animeapi import mappers


def media(**overrides):
    """One media object, as the GraphQL queries request it."""
    payload = {
        "id": 20,
        "idMal": 20,
        "title": {
            "romaji": "NARUTO",
            "english": "Naruto",
            "native": "NARUTO -ナルト-",
        },
        "synonyms": ["NARUTO x UT"],
        "coverImage": {
            "extraLarge": "https://s4.anilist.co/xl.jpg",
            "large": "https://s4.anilist.co/l.jpg",
            "medium": "https://s4.anilist.co/m.jpg",
            "color": "#e47850",
        },
        "bannerImage": "https://s4.anilist.co/banner.jpg",
        "format": "TV",
        "status": "FINISHED",
        "source": "MANGA",
        "description": "A ninja.<br><br>More ninja.<br>(Source: MAL Rewrite)",
        "episodes": 220,
        "duration": 23,
        "averageScore": 80,
        "meanScore": 80,
        "popularity": 726340,
        "favourites": 38890,
        "season": "FALL",
        "seasonYear": 2002,
        "genres": ["Action", "Adventure"],
        "isAdult": False,
        "siteUrl": "https://anilist.co/anime/20",
        "trailer": {
            "id": "-G9BqkgZXRA",
            "site": "youtube",
            "thumbnail": "https://i.ytimg.com/vi/-G9BqkgZXRA/hqdefault.jpg",
        },
        "studios": {
            "edges": [
                {"isMain": True, "node": {"name": "Studio Pierrot"}},
                {"isMain": False, "node": {"name": "TV Tokyo"}},
            ]
        },
        "startDate": {"year": 2002, "month": 10, "day": 3},
        "endDate": {"year": 2007, "month": 2, "day": 8},
        "nextAiringEpisode": None,
    }
    payload.update(overrides)
    return payload


# ─── identity ───────────────────────────────────────────────────────────────


def test_mal_id_comes_from_the_mal_id_field():
    assert mappers.map_anime(media())["mal_id"] == 20


def test_entries_without_a_mal_id_get_a_synthetic_one_far_above_real_ids():
    anime = mappers.map_anime(
        media(idMal=None, id=12345, siteUrl="https://anilist.co/anime/12345")
    )
    assert anime["mal_id"] == mappers.SYNTHETIC_MAL_ID_OFFSET + 12345
    assert anime["mal_id"] > 60_000_000
    # the detail endpoint reverses this arithmetic to look the entry up again
    assert anime["mal_id"] - mappers.SYNTHETIC_MAL_ID_OFFSET == 12345
    assert anime["url"] == "https://anilist.co/anime/12345"


def test_entries_with_a_mal_id_link_to_myanimelist():
    assert mappers.map_anime(media())["url"] == "https://myanimelist.net/anime/20"


def test_titles_are_listed_the_way_jikan_lists_them():
    anime = mappers.map_anime(media())
    assert anime["title"] == "NARUTO"
    assert anime["title_english"] == "Naruto"
    assert anime["title_japanese"] == "NARUTO -ナルト-"
    assert anime["title_synonyms"] == ["NARUTO x UT"]
    assert anime["titles"][0] == {"type": "Default", "title": "NARUTO"}
    assert {"type": "English", "title": "Naruto"} in anime["titles"]
    assert {"type": "Japanese", "title": "NARUTO -ナルト-"} in anime["titles"]


def test_default_title_falls_back_when_romaji_is_missing():
    anime = mappers.map_anime(media(title={"romaji": None, "english": "Naruto"}))
    assert anime["title"] == "Naruto"


# ─── images and trailer ─────────────────────────────────────────────────────


def test_cover_sizes_land_on_jikans_keys():
    images = mappers.map_anime(media())["images"]
    assert images["jpg"] == {
        "image_url": "https://s4.anilist.co/l.jpg",
        "small_image_url": "https://s4.anilist.co/m.jpg",
        "large_image_url": "https://s4.anilist.co/xl.jpg",
    }


def test_webp_is_omitted_rather_than_filled_with_jpegs():
    assert "webp" not in mappers.map_anime(media())["images"]


def test_trailer_urls_are_built_from_the_youtube_id():
    trailer = mappers.map_anime(media())["trailer"]
    assert trailer["youtube_id"] == "-G9BqkgZXRA"
    assert trailer["url"] == "https://www.youtube.com/watch?v=-G9BqkgZXRA"
    assert trailer["embed_url"] == "https://www.youtube.com/embed/-G9BqkgZXRA"
    assert set(trailer["images"]) == {
        "image_url",
        "small_image_url",
        "medium_image_url",
        "large_image_url",
        "maximum_image_url",
    }


def test_a_trailer_that_is_not_youtube_reports_nulls():
    trailer = mappers.map_anime(
        media(trailer={"id": "x", "site": "dailymotion", "thumbnail": "t.jpg"})
    )["trailer"]
    assert trailer["youtube_id"] is None
    assert trailer["url"] is None
    assert set(trailer["images"].values()) == {None}


# ─── scores, status, type, rating, duration ─────────────────────────────────


def test_score_is_scaled_from_anilists_hundred_point_scale():
    assert mappers.map_anime(media())["score"] == 8.0


def test_mean_score_covers_entries_without_an_average():
    assert mappers.map_anime(media(averageScore=None, meanScore=75))["score"] == 7.5


def test_score_is_null_when_anilist_has_none():
    assert mappers.map_anime(media(averageScore=None, meanScore=None))["score"] is None


def test_status_wording_and_the_airing_flag():
    assert mappers.map_anime(media(status="RELEASING"))["status"] == "Currently Airing"
    assert mappers.map_anime(media(status="RELEASING"))["airing"] is True
    assert mappers.map_anime(media(status="FINISHED"))["status"] == "Finished Airing"
    assert mappers.map_anime(media(status="FINISHED"))["airing"] is False
    assert mappers.map_anime(media(status="NOT_YET_RELEASED"))["status"] == "Not yet aired"


def test_type_wording():
    assert mappers.map_anime(media(format="TV_SHORT"))["type"] == "TV"
    assert mappers.map_anime(media(format="MOVIE"))["type"] == "Movie"
    assert mappers.map_anime(media(format="ONA"))["type"] == "ONA"


def test_duration_text_is_what_the_frontend_parses():
    assert mappers.map_anime(media())["duration"] == "23 min per ep"
    assert mappers.map_anime(media(format="MOVIE", duration=115))["duration"] == "115 min"
    assert mappers.map_anime(media(duration=None))["duration"] is None


def test_rating_reports_only_what_anilist_actually_knows():
    # AniList has no age rating, so an ordinary title admits it rather than
    # claiming to be PG-13.
    assert mappers.map_anime(media())["rating"] is None
    assert mappers.map_anime(media(isAdult=True))["rating"] == "Rx - Hentai"
    assert (
        mappers.map_anime(media(genres=["Action", "Ecchi"]))["rating"]
        == "R+ - Mild Nudity"
    )


# ─── dates and broadcast ────────────────────────────────────────────────────


def test_aired_block_matches_jikans_shape():
    aired = mappers.map_anime(media())["aired"]
    assert aired["from"] == "2002-10-03T00:00:00+00:00"
    assert aired["to"] == "2007-02-08T00:00:00+00:00"
    assert aired["prop"]["from"] == {"day": 3, "month": 10, "year": 2002}
    assert aired["string"] == "Oct 3, 2002 to Feb 8, 2007"


def test_partial_dates_fall_back_to_the_start_of_the_period():
    aired = mappers.map_anime(
        media(startDate={"year": 2002, "month": None, "day": None})
    )["aired"]
    assert aired["from"] == "2002-01-01T00:00:00+00:00"
    assert aired["prop"]["from"] == {"day": None, "month": None, "year": 2002}
    assert aired["string"] == "2002 to Feb 8, 2007"


def test_unannounced_dates_report_nulls():
    aired = mappers.map_anime(media(startDate=None, endDate=None))["aired"]
    assert aired["from"] is None
    assert aired["string"] is None


def test_broadcast_is_resolved_in_japan_time():
    """A Sunday night slot in UTC is a Monday morning slot in Japan.

    MAL reports the Japanese broadcast day, so reading the timestamp in UTC —
    which is what a naive implementation does — would put this episode on the
    wrong day of the week.
    """
    airing_at = int(datetime(2026, 9, 20, 22, 30, tzinfo=timezone.utc).timestamp())
    anime = mappers.map_anime(
        media(status="RELEASING", nextAiringEpisode={"airingAt": airing_at, "episode": 5})
    )
    assert anime["broadcast"] == {
        "day": "Mondays",
        "time": "07:30",
        "timezone": "Asia/Tokyo",
        "string": "Mondays at 07:30 (JST)",
    }


def test_broadcast_prefers_the_scheduled_episode_time():
    """The schedules endpoint knows the exact air time, which wins."""
    scheduled = int(datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc).timestamp())
    elsewhere = int(datetime(2026, 9, 20, 22, 30, tzinfo=timezone.utc).timestamp())
    anime = mappers.map_anime(
        media(nextAiringEpisode={"airingAt": elsewhere}), broadcast_at=scheduled
    )
    assert anime["broadcast"]["day"] == "Tuesdays"
    assert anime["broadcast"]["time"] == "21:00"


def test_finished_series_report_a_null_broadcast():
    assert mappers.map_anime(media())["broadcast"] == {
        "day": None,
        "time": None,
        "timezone": None,
        "string": None,
    }


# ─── nested collections ─────────────────────────────────────────────────────


def test_studios_and_producers_split_on_anilists_main_flag():
    anime = mappers.map_anime(media())
    assert [s["name"] for s in anime["studios"]] == ["Studio Pierrot"]
    assert [p["name"] for p in anime["producers"]] == ["TV Tokyo"]
    assert anime["studios"][0] == {
        "mal_id": None,
        "type": "anime",
        "name": "Studio Pierrot",
        "url": None,
    }


def test_genres_split_explicit_content_out():
    anime = mappers.map_anime(media(genres=["Action", "Hentai"]))
    assert [g["name"] for g in anime["genres"]] == ["Action"]
    assert [g["name"] for g in anime["explicit_genres"]] == ["Hentai"]


def test_themes_and_demographics_are_empty_rather_than_invented():
    anime = mappers.map_anime(media())
    assert anime["themes"] == []
    assert anime["demographics"] == []
    assert anime["licensors"] == []


def test_synopsis_becomes_plain_text():
    synopsis = mappers.map_anime(media())["synopsis"]
    assert "<br>" not in synopsis
    assert "A ninja.\n\nMore ninja." in synopsis
    # source credits are attribution and are kept
    assert "(Source: MAL Rewrite)" in synopsis


def test_synopsis_unescapes_entities():
    assert "Fate/stay night & more" in mappers.map_anime(
        media(description="Fate/stay night &amp; more")
    )["synopsis"]


def test_a_missing_synopsis_is_null():
    assert mappers.map_anime(media(description=None))["synopsis"] is None


# ─── full detail ────────────────────────────────────────────────────────────


def test_full_detail_adds_relations_and_external_links():
    anime = mappers.map_anime(media(), full=True)
    assert anime["relations"] == []
    assert anime["external"] == []
    assert anime["streaming"] == []


def test_relations_are_grouped_and_named_as_mal_names_them():
    anime = mappers.map_anime(
        media(
            relations={
                "edges": [
                    {
                        "relationType": "SEQUEL",
                        "node": {
                            "id": 1735,
                            "idMal": 1735,
                            "type": "ANIME",
                            "format": "TV",
                            "title": {"romaji": "NARUTO: Shippuuden"},
                        },
                    },
                    {
                        "relationType": "SOURCE",
                        "node": {
                            "id": 30011,
                            "idMal": 11,
                            "type": "MANGA",
                            "format": "MANGA",
                            "title": {"romaji": "NARUTO"},
                        },
                    },
                    {
                        "relationType": "SIDE_STORY",
                        "node": {
                            "id": 442,
                            "idMal": 442,
                            "type": "ANIME",
                            "format": "MOVIE",
                            "title": {"romaji": "NARUTO the Movie"},
                        },
                    },
                ]
            }
        ),
        full=True,
    )["relations"]

    by_relation = {entry["relation"]: entry["entry"] for entry in anime}
    assert set(by_relation) == {"Sequel", "Adaptation", "Side story"}
    assert by_relation["Adaptation"] == [
        {
            "mal_id": 11,
            "type": "manga",
            "name": "NARUTO",
            "url": "https://myanimelist.net/manga/11",
        }
    ]
    assert by_relation["Sequel"][0]["url"] == "https://myanimelist.net/anime/1735"


def test_external_links_become_name_url_pairs():
    anime = mappers.map_anime(
        media(
            externalLinks=[
                {"id": 1, "url": "https://crunchyroll.com/naruto", "site": "Crunchyroll", "type": "STREAMING"},
                {"id": 2, "url": None, "site": "Broken", "type": "INFO"},
            ]
        ),
        full=True,
    )
    assert anime["external"] == [
        {"name": "Crunchyroll", "url": "https://crunchyroll.com/naruto"}
    ]


# ─── pagination and ranking ─────────────────────────────────────────────────


def test_pagination_envelope_matches_jikans():
    envelope = mappers.pagination(
        {"total": 30, "currentPage": 1, "lastPage": 2, "hasNextPage": True, "perPage": 25},
        current_page=1,
        per_page=25,
        count=25,
    )
    assert envelope == {
        "last_visible_page": 2,
        "has_next_page": True,
        "current_page": 1,
        "items": {"count": 25, "total": 30, "per_page": 25},
    }


def test_ranks_continue_across_pages():
    medias = [media(idMal=index) for index in (1, 2, 3)]
    assert [a["rank"] for a in mappers.map_anime_list(medias, rank_offset=25)] == [26, 27, 28]


def test_rank_is_left_null_when_the_order_is_not_a_ranking():
    medias = [media(idMal=1), media(idMal=2)]
    assert [a["rank"] for a in mappers.map_anime_list(medias)] == [None, None]


def test_genre_collection_shape():
    payload = mappers.map_genre_collection(["Action", "Mecha"])
    assert payload == {
        "data": [
            {"mal_id": None, "name": "Action", "count": None, "url": None},
            {"mal_id": None, "name": "Mecha", "count": None, "url": None},
        ]
    }


def test_mapping_an_empty_media_object_does_not_raise():
    """AniList can return a null-ish node inside a relation or schedule entry."""
    anime = mappers.map_anime({})
    assert anime["mal_id"] is None
    assert anime["title"] is None
    assert anime["genres"] == []
