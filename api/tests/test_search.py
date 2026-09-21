"""Ranking rules and endpoint behaviour for anime search.

The ranking functions are pure, so they are asserted directly. The endpoint
tests cover the two things a caller depends on: ordering, and that one user
never sees another's titles.
"""

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from api import search
from core.models import Anime, Category


def test_normalize_strips_case_accents_and_punctuation():
    assert search.normalize("Fate/Zero") == "fate zero"
    assert search.normalize("Pokémon: THE Series!") == "pokemon the series"
    assert search.normalize("  spaced   out  ") == "spaced out"


def test_prefix_outranks_substring_outranks_token_match():
    assert search.score("Attack on Titan", "attack") > search.score(
        "The Attack", "attack"
    )
    assert search.score("The Attack", "attack") > search.score(
        "Attempted Tackle", "att tac"
    )


def test_typo_still_matches_but_ranks_below_a_literal_hit():
    typo = search.score("Naruto Shippuden", "narutoo")
    assert 0 < typo < search.score("Naruto Shippuden", "naruto")


def test_unrelated_query_scores_zero():
    assert search.score("Cowboy Bebop", "steinsgate") == 0.0


def test_punctuation_between_tokens_does_not_block_a_match():
    assert search.score("Fate/Zero", "fate zero") > 0


def test_rank_orders_by_score_then_name_and_honours_limit():
    candidates = [(1, "The Attack"), (2, "Attack on Titan"), (3, "Attack No. 1")]
    assert search.rank(candidates, "attack", 3) == [3, 2, 1]
    assert search.rank(candidates, "attack", 1) == [3]


def test_rank_returns_nothing_for_a_blank_query():
    assert search.rank([(1, "Bleach")], "   ", 10) == []


@pytest.fixture(autouse=True)
def clear_throttle_history():
    """Throttle counters live in the cache, which outlives a test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def owner(db):
    user = User.objects.create_user("owner", password="x")
    category = Category.objects.create(user=user, name="Watching", user_category_id=1)
    for order, name in enumerate(["Attack on Titan", "Naruto", "Cowboy Bebop"]):
        Anime.objects.create(category=category, name=name, order=order)
    return user


@pytest.fixture
def stranger(db):
    user = User.objects.create_user("stranger", password="x")
    category = Category.objects.create(user=user, name="Theirs", user_category_id=1)
    Anime.objects.create(category=category, name="Attack on Titan", order=0)
    return user


def search_request(client, user, **params):
    token = RefreshToken.for_user(user).access_token
    response = client.get(
        "/api/v1/animes/search/",
        params,
        headers={"authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_query_matches_by_name(client, owner):
    results = search_request(client, owner, q="titan")
    assert [item["name"] for item in results] == ["Attack on Titan"]


def test_misspelled_query_still_finds_the_title(client, owner):
    results = search_request(client, owner, q="narouto")
    assert [item["name"] for item in results] == ["Naruto"]


def test_missing_query_returns_nothing_rather_than_the_whole_list(client, owner):
    assert search_request(client, owner) == []


def test_limit_is_capped_and_never_zero(client, owner):
    assert len(search_request(client, owner, q="at", limit=1)) == 1
    assert len(search_request(client, owner, q="at", limit=0)) == 1
    assert len(search_request(client, owner, q="at", limit="nonsense")) >= 1


def test_a_single_character_is_refused_rather_than_matched(client, owner):
    assert search_request(client, owner, q="a") == []
    assert search_request(client, owner, q="na") != []


def test_a_burst_of_searches_is_throttled(client, owner, monkeypatch):
    # SimpleRateThrottle reads THROTTLE_RATES off the class, bound at import, so
    # overriding the setting alone would not reach it.
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "search", "2/min")
    token = RefreshToken.for_user(owner).access_token
    headers = {"authorization": f"Bearer {token}"}
    codes = [
        client.get("/api/v1/animes/search/", {"q": "titan"}, headers=headers).status_code
        for _ in range(3)
    ]
    assert codes == [200, 200, 429]


def test_results_are_scoped_to_the_requesting_user(client, owner, stranger):
    assert len(search_request(client, owner, q="titan")) == 1
    assert len(search_request(client, stranger, q="titan")) == 1


def test_anonymous_callers_are_rejected(client, db):
    assert client.get("/api/v1/animes/search/", {"q": "titan"}).status_code == 401
