"""Round-trip and validation of ``Anime.mal_id`` through the v1 API.

The field links a watchlist entry to its /api/v4/ metadata so the frontend can
walk sequel relations for episode auto-fill. These tests cover what a caller
depends on: create/update acceptance, omission semantics, and rejection of
bad values.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken

from api.serializers import AnimeSerializer
from core.models import Anime, Category


@pytest.fixture
def category(db):
    user = User.objects.create_user("owner", password="x")
    return Category.objects.create(user=user, name="Watching", user_category_id=1)


def sync_request(client, category, actions):
    token = RefreshToken.for_user(category.user).access_token
    response = client.post(
        "/api/v1/animes/bulk_sync/",
        {"actions": actions},
        content_type="application/json",
        headers={"authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_serializer_round_trips_mal_id(category):
    serializer = AnimeSerializer(
        data={"name": "Attack on Titan", "mal_id": 16498, "seasons": []}
    )
    assert serializer.is_valid(), serializer.errors
    anime = serializer.save(category=category, order=0)
    assert Anime.objects.get(pk=anime.pk).mal_id == 16498
    assert AnimeSerializer(anime).data["mal_id"] == 16498


def test_serializer_accepts_missing_and_null_mal_id(category):
    for data in ({"name": "A"}, {"name": "B", "mal_id": None}):
        serializer = AnimeSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.save(category=category, order=0).mal_id is None


def test_serializer_rejects_a_negative_mal_id():
    serializer = AnimeSerializer(data={"name": "A", "mal_id": -1})
    assert not serializer.is_valid()
    assert "mal_id" in serializer.errors


def test_bulk_sync_create_then_update_preserves_mal_id(client, category):
    result = sync_request(
        client,
        category,
        [
            {
                "type": "CREATE",
                "temp_id": "t1",
                "data": {"category_id": 1, "name": "Attack on Titan", "mal_id": 16498},
            }
        ],
    )
    anime = Anime.objects.get(pk=result["created_ids"]["t1"])
    assert anime.mal_id == 16498

    sync_request(
        client,
        category,
        [{"type": "UPDATE", "id": anime.id, "data": {"stars": 9}}],
    )
    anime.refresh_from_db()
    assert anime.mal_id == 16498
    assert anime.stars == 9


def test_bulk_sync_create_with_a_negative_mal_id_is_skipped(client, category):
    result = sync_request(
        client,
        category,
        [
            {
                "type": "CREATE",
                "temp_id": "t1",
                "data": {"category_id": 1, "name": "Attack on Titan", "mal_id": -1},
            }
        ],
    )
    assert result["created_ids"] == {}
    assert Anime.objects.count() == 0
