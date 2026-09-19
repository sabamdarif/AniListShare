"""Parameter translation tests.

These cover the fiddly part of the API — Jikan's parameter names, enums, score
scale and date formats all differ from AniList's — without touching the network.
"""

from datetime import date

import pytest
from django.test import RequestFactory

from animeapi import params


@pytest.fixture
def rf():
    return RequestFactory()


def get(rf, **query):
    return rf.get("/", query)


# ─── primitives ─────────────────────────────────────────────────────────────


def test_parse_int_uses_the_default_when_absent(rf):
    assert params.parse_int(get(rf), "limit", default=25, minimum=1, maximum=25) == 25


def test_parse_int_clamps_rather_than_rejecting_large_values(rf):
    """Jikan caps ?limit= at 25 instead of erroring, so extra is dropped."""
    assert params.parse_int(get(rf, limit="99"), "limit", default=25, minimum=1, maximum=25) == 25


def test_parse_int_rejects_non_integers(rf):
    with pytest.raises(params.BadRequest):
        params.parse_int(get(rf, limit="ten"), "limit", default=25, minimum=1, maximum=25)


def test_parse_int_rejects_values_below_the_minimum(rf):
    with pytest.raises(params.BadRequest):
        params.parse_int(get(rf, page="0"), "page", default=1, minimum=1, maximum=1000)


def test_parse_float_rejects_out_of_range(rf):
    with pytest.raises(params.BadRequest):
        params.parse_float(get(rf, min_score="11"), "min_score", minimum=0, maximum=10)


def test_parse_bool_accepts_the_usual_spellings(rf):
    assert params.parse_bool(get(rf, sfw="true"), "sfw")
    assert params.parse_bool(get(rf, sfw="1"), "sfw")
    assert not params.parse_bool(get(rf, sfw="0"), "sfw")


# ─── search ─────────────────────────────────────────────────────────────────


def test_search_maps_query_and_pagination(rf):
    variables = params.search_variables(get(rf, q="naruto", page="2", limit="10"))
    assert variables["search"] == "naruto"
    assert variables["page"] == 2
    assert variables["perPage"] == 10
    assert variables["type"] == "ANIME"


def test_search_defaults_to_newest_first_and_omits_an_absent_query(rf):
    variables = params.search_variables(get(rf))
    assert variables["sort"] == ["ID_DESC"]
    assert "search" not in variables


def test_a_title_search_leads_with_the_best_match(rf):
    """Jikan leads with the best match, not the newest entry, so a title search
    for "naruto" returns the 2002 series before any recent spin-off."""
    assert params.search_variables(get(rf, q="naruto"))["sort"] == ["SEARCH_MATCH"]


def test_a_search_still_honours_an_explicit_order(rf):
    assert params.search_variables(get(rf, q="naruto", order_by="score"))["sort"] == ["SCORE_DESC"]
    assert params.search_variables(get(rf, q="naruto", sort="asc"))["sort"] == ["ID"]


def test_search_maps_type_and_status(rf):
    variables = params.search_variables(get(rf, type="movie", status="upcoming"))
    assert variables["format"] == "MOVIE"
    assert variables["status"] == "NOT_YET_RELEASED"


def test_search_rejects_an_unknown_type(rf):
    with pytest.raises(params.BadRequest):
        params.search_variables(get(rf, type="hologram"))


def test_search_honours_the_direction(rf):
    assert params.search_variables(get(rf, order_by="score", sort="asc"))["sort"] == ["SCORE"]
    assert params.search_variables(get(rf, order_by="members"))["sort"] == ["POPULARITY_DESC"]


def test_search_rejects_an_unknown_order(rf):
    with pytest.raises(params.BadRequest):
        params.search_variables(get(rf, order_by="vibes"))


def test_search_makes_score_bounds_inclusive(rf):
    """AniList's bounds are exclusive; a title scoring exactly 8.0 is "min_score=8"."""
    variables = params.search_variables(get(rf, min_score="8", max_score="8.5"))
    assert variables["scoreGreater"] == 79
    assert variables["scoreLesser"] == 86


def test_search_accepts_genre_names_case_insensitively(rf):
    variables = params.search_variables(get(rf, genres="action,SCI-FI"))
    assert variables["genreIn"] == ["Action", "Sci-Fi"]


def test_search_rejects_an_unknown_genre(rf):
    with pytest.raises(params.BadRequest):
        params.search_variables(get(rf, genres="cooking"))


def test_search_excludes_genres(rf):
    assert params.search_variables(get(rf, genres_exclude="ecchi"))["genreNotIn"] == ["Ecchi"]


def test_sfw_asks_anilist_to_exclude_adult_entries(rf):
    assert params.search_variables(get(rf, sfw="true"))["isAdult"] is False


def test_search_leaves_the_adult_filter_alone_when_unspecified(rf):
    assert "isAdult" not in params.search_variables(get(rf))


def test_search_converts_iso_dates_to_anilists_fuzzy_date(rf):
    variables = params.search_variables(get(rf, start_date="2026-01-15", end_date="2026-03-31"))
    assert variables["startGreater"] == 20260115
    assert variables["startLesser"] == 20260331


def test_search_rejects_a_malformed_date(rf):
    with pytest.raises(params.BadRequest):
        params.search_variables(get(rf, start_date="15/01/2026"))


# ─── top ────────────────────────────────────────────────────────────────────


def test_top_filter_airing_ranks_currently_airing_titles_by_score(rf):
    variables = params.top_variables(get(rf, filter="airing"))
    assert variables["sort"] == ["SCORE_DESC"]
    assert variables["status"] == "RELEASING"


def test_top_filter_favorite_ranks_by_favourites(rf):
    variables = params.top_variables(get(rf, filter="favorite"))
    assert variables["sort"] == ["FAVOURITES_DESC"]
    assert "status" not in variables


def test_top_filter_upcoming_ranks_unreleased_titles(rf):
    variables = params.top_variables(get(rf, filter="upcoming"))
    assert variables["status"] == "NOT_YET_RELEASED"


def test_top_rejects_an_unknown_filter(rf):
    with pytest.raises(params.BadRequest):
        params.top_variables(get(rf, filter="spicy"))


# ─── seasons ────────────────────────────────────────────────────────────────


def test_seasonal_maps_the_season_name_to_anilists_enum(rf):
    variables = params.seasonal_variables(get(rf), "fall", 2026)
    assert variables["season"] == "FALL"
    assert variables["seasonYear"] == 2026


def test_seasonal_rejects_an_unknown_season(rf):
    with pytest.raises(params.BadRequest):
        params.seasonal_variables(get(rf), "monsoon", 2026)


def test_seasonal_rejects_an_impossible_year(rf):
    with pytest.raises(params.BadRequest):
        params.seasonal_variables(get(rf), "fall", 1200)


@pytest.mark.parametrize(
    "today,expected",
    [
        (date(2026, 1, 1), ("WINTER", 2026)),
        (date(2026, 3, 31), ("WINTER", 2026)),
        (date(2026, 4, 1), ("SPRING", 2026)),
        (date(2026, 6, 30), ("SPRING", 2026)),
        (date(2026, 7, 1), ("SUMMER", 2026)),
        (date(2026, 9, 30), ("SUMMER", 2026)),
        (date(2026, 10, 1), ("FALL", 2026)),
        (date(2026, 12, 31), ("FALL", 2026)),
    ],
)
def test_current_season_boundaries(today, expected):
    assert params.current_season(today) == expected


def test_next_season_advances_and_rolls_over_the_year():
    assert params.next_season(date(2026, 9, 19)) == ("FALL", 2026)
    assert params.next_season(date(2026, 12, 1)) == ("WINTER", 2027)
    assert params.next_season(date(2026, 3, 1)) == ("SPRING", 2026)


# ─── schedule windows ───────────────────────────────────────────────────────


def test_schedule_window_covers_exactly_one_japanese_day():
    start, end = params.schedule_window(params.WEEKDAYS["monday"])
    assert end - start == 24 * 60 * 60
    assert params.datetime.fromtimestamp(start, params.JST).weekday() == 0
    assert params.datetime.fromtimestamp(start, params.JST).strftime("%H:%M:%S") == "00:00:00"


def test_today_falls_inside_todays_window():
    now = params.datetime.now(params.JST)
    start, end = params.schedule_window(now.weekday())
    assert (
        params.datetime.fromtimestamp(start, params.JST)
        <= now
        < params.datetime.fromtimestamp(end, params.JST)
    )


def test_schedule_window_lands_on_the_most_recent_such_weekday():
    """For any date in the last week the window is exactly that date.

    That is what makes "yesterday" work: the frontend asks for the weekday of
    the date it wants, and that weekday's most recent occurrence is that date.
    """
    now = params.datetime.now(params.JST)
    for offset in range(7):
        weekday = (now.weekday() - offset) % 7
        start, end = params.schedule_window(weekday)
        start_local = params.datetime.fromtimestamp(start, params.JST)
        assert start_local.date() == (now - params.timedelta(days=offset)).date()
        assert start_local.strftime("%H:%M:%S") == "00:00:00"
        assert end - start == 24 * 60 * 60


def test_schedule_window_without_a_weekday_spans_a_week():
    start, end = params.schedule_window(None)
    assert end - start == 7 * 24 * 60 * 60


def test_every_weekday_resolves_to_its_own_day():
    for name, index in params.WEEKDAYS.items():
        start, _ = params.schedule_window(index)
        assert params.datetime.fromtimestamp(start, params.JST).weekday() == index, name
