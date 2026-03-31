from rest_framework import fields, serializers

from core.models import Anime, Season


class SeasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Season
        fields = (
            "number",
            "total_episodes",
            "watched_episodes",
            "comment",
            "is_completed",
        )


class AnimeSerializer(serializers.ModelSerializer):
    seasons = SeasonSerializer(many=True)
    category = serializers.CharField(source="category.name")

    class Meta:
        model = Anime
        fields = (
            "id",
            "name",
            "category",
            "thumbnail_url",
            "language",
            "stars",
            "order",
            "seasons",
        )
