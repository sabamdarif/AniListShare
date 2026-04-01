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

    def create(self, validated_data):
        seasons_data = validated_data.pop("seasons", [])
        anime = Anime.objects.create(**validated_data)
        for season_data in seasons_data:
            Season.objects.create(anime=anime, **season_data)
        return anime

    def update(self, instance, validated_data):
        seasons_data = validated_data.pop("seasons", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # only replace seasons when the key was actually sent
        if seasons_data is not None:
            instance.seasons.all().delete()
            for season_data in seasons_data:
                Season.objects.create(anime=instance, **season_data)

        return instance


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "order")
        read_only_fields = ("id",)


class SearchAnimeSerializer(serializers.ModelSerializer):
    category_id = serializers.IntegerField(source="category.id", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Anime
        fields = ("id", "name", "thumbnail_url", "category_id", "category_name")
        read_only_fields = fields
