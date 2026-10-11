from django.contrib.auth.models import User
from django.db import models


class Category(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)
    user_category_id = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]
        verbose_name_plural = "categories"
        unique_together = ("user", "user_category_id")
        indexes = [
            models.Index(fields=["user", "order"]),
        ]

    def __str__(self) -> str:
        return str(self.name)


class Anime(models.Model):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="animes"
    )
    name = models.CharField(max_length=500)
    # The /api/v4/ id of the picked metadata entry (real MAL id or a synthetic
    # AniList/TMDb offset id); null for typed names and pre-field rows.
    mal_id = models.PositiveIntegerField(null=True, blank=True)
    thumbnail_url = models.URLField(max_length=1000, default="", blank=True)
    language = models.CharField(max_length=200, blank=True, default="")
    stars = models.FloatField(null=True, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]
        indexes = [
            models.Index(fields=["category", "order"]),
        ]

    def __str__(self) -> str:
        return str(self.name)


class Season(models.Model):
    anime = models.ForeignKey(Anime, on_delete=models.CASCADE, related_name="seasons")
    number = models.FloatField(default=1)
    total_episodes = models.PositiveIntegerField(default=0)
    watched_episodes = models.PositiveIntegerField(default=0)
    comment = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["number"]
        unique_together = ("anime", "number")

    @property
    def is_ova(self):
        return self.number % 1 != 0

    def __str__(self):
        if self.is_ova:
            after = int(self.number)
            return f"{self.anime.name} - OVA(after S{after}) ({self.watched_episodes}/{self.total_episodes})"
        return f"{self.anime.name} - S{int(self.number)} ({self.watched_episodes}/{self.total_episodes})"

    @property
    def is_completed(self):
        return self.total_episodes > 0 and self.watched_episodes >= self.total_episodes


class ShareLink(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="share_link"
    )
    token = models.CharField(max_length=11, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "share link"

    def __str__(self) -> str:
        return f"ShareLink({self.token}) → {self.user.username}"
