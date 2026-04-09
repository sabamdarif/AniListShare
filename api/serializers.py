from django.db import transaction
from rest_framework import serializers

from core.models import Anime, Category, Season


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
        read_only_fields = ("is_completed",)

    def validate_number(self, value):
        if value <= 0:
            raise serializers.ValidationError("seasons must be greater then 0")
        return value

    def validate_total_episodes(self, value):
        if value <= 0:
            raise serializers.ValidationError("total_episodes cannot be negative")
        return value

    def validate_watched_episodes(self, value):
        if value <= 0:
            raise serializers.ValidationError("watched_episodes cannot be negative")
        return value

    def validate(self, attrs):
        total = attrs.get("total_episodes")
        watched = attrs.get("watched_episodes")

        if total is None and self.instance:
            total = self.instance.total_episodes
        if watched is None and self.instance:
            watched = self.instance.watched_episodes

        if total is not None and watched is not None and total > 0 and watched > total:
            raise serializers.ValidationError(
                {"watched_episodes": "Cannot exceed total episodes"}
            )
        return attrs


class AnimeSerializer(serializers.ModelSerializer):
    seasons = SeasonSerializer(many=True, required=False, default=[])

    class Meta:
        model = Anime
        fields = (
            "id",
            "name",
            "thumbnail_url",
            "language",
            "stars",
            "order",
            "seasons",
        )
        read_only_fields = ("id",)

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Anime name cannot be empty")

        return value

    def validate_stars(self, value):
        if value is not None and (value < 0 or value > 10):
            raise serializers.ValidationError("Star rating must be between 0 and 10")

        return value

    def validate_order(self, value):
        if value < 0:
            raise serializers.ValidationError("Order cannot be negative")
        return value

    @transaction.atomic
    def create(self, validated_data):
        seasons_data = validated_data.pop("seasons", [])
        anime = Anime.objects.create(**validated_data)
        if seasons_data:
            Season.objects.bulk_create(
                [Season(anime=anime, **season_data) for season_data in seasons_data]
            )
        return anime

    @transaction.atomic
    def update(self, instance, validated_data):
        seasons_data = validated_data.pop("seasons", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if seasons_data is not None:
            instance.seasons.all().delete()
            if seasons_data:
                Season.objects.bulk_create(
                    [
                        Season(anime=instance, **season_data)
                        for season_data in seasons_data
                    ]
                )

        return instance


class CategorySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="user_category_id", read_only=True)

    class Meta:
        model = Category
        fields = ("id", "name", "order")
        read_only_fields = ("id",)

    def validate_order(self, value):
        if value < 0:
            raise serializers.ValidationError("Order cannot be negative")
        return value


class SearchAnimeSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(
        source="category.user_category_id", read_only=True
    )
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Anime
        fields = ("id", "name", "thumbnail_url", "category_id", "category_name")
        read_only_fields = fields
