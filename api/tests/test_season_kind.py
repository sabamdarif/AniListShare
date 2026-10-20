"""The Season.kind field: labels, defaults, and round-trips through the API.

kind distinguishes specials from OVAs, which share the same fractional-number
anchor (1.01 = first extra after S1). These tests cover what callers depend
on: legacy rows still reading as OVAs, kind surviving a save, and the
copy-list flow preserving it.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

from api.serializers import AnimeSerializer
from core.models import Anime, Category, Season, ShareLink


@pytest.fixture
def category(db):
    user = User.objects.create_user("owner", password="x")
    return Category.objects.create(user=user, name="Watching", user_category_id=1)


def anime_with_seasons(category, seasons):
    serializer = AnimeSerializer(
        data={"name": "Attack on Titan", "mal_id": 16498, "seasons": seasons}
    )
    assert serializer.is_valid(), serializer.errors
    return serializer.save(category=category, order=0)


def test_kind_defaults_to_season(category):
    season = Season.objects.create(anime=Anime.objects.create(category=category, name="A", order=0))
    assert season.kind == "season"
    assert not season.is_ova


def test_legacy_fractional_number_still_reads_as_ova(category):
    anime = Anime.objects.create(category=category, name="A", order=0)
    season = Season.objects.create(anime=anime, number=1.01)
    assert season.is_ova
    assert "OVA(after S1)" in str(season)


def test_special_kind_labels_and_round_trips(category):
    anime = anime_with_seasons(
        category,
        [
            {"number": 1, "total_episodes": 25, "watched_episodes": 0},
            {"number": 1.01, "kind": "special", "total_episodes": 9, "watched_episodes": 0},
        ],
    )
    special = anime.seasons.get(number=1.01)
    assert special.kind == "special"
    assert not special.is_ova
    assert "Special(after S1)" in str(special)
    data = AnimeSerializer(anime).data
    assert data["seasons"][1]["kind"] == "special"


def test_kind_rejects_unknown_value(category):
    serializer = AnimeSerializer(
        data={
            "name": "A",
            "seasons": [{"number": 1.01, "kind": "movie"}],
        }
    )
    assert not serializer.is_valid()
    assert "kind" in str(serializer.errors)


def test_copy_list_preserves_kind(client, category):
    source_user = category.user
    target_user = User.objects.create_user("copier", password="x")
    anime_with_seasons(
        category,
        [
            {"number": 1, "total_episodes": 25, "watched_episodes": 0},
            {"number": 1.01, "kind": "special", "total_episodes": 9, "watched_episodes": 0},
        ],
    )
    share = ShareLink.objects.create(user=source_user, token="abc123")

    token = RefreshToken.for_user(target_user).access_token
    response = client.post(
        f"/api/v1/share/copy/{share.token}/",
        content_type="application/json",
        headers={"authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    copied = Anime.objects.get(category__user=target_user, name="Attack on Titan")
    assert copied.seasons.get(number=1.01).kind == "special"
