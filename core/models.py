from django.contrib.auth.models import User
from django.db import models


class Category(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return str(self.name)


class Anime(models.Model):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="animes"
    )
    name = models.CharField(max_length=500)
    thumbnail_url = models.URLField(max_length=1000, default="", blank=True)
    language = models.CharField(max_length=200, blank=True, default="")
    stars = models.FloatField(null=True, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return str(self.name)


class Season(models.Model):
    anime = models.ForeignKey(Anime, on_delete=models.CASCADE, related_name="seasons")
    number = models.PositiveIntegerField(default=1)
    total_episodes = models.PositiveIntegerField(default=0)
    watched_episodes = models.PositiveIntegerField(default=0)
    comment = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["number"]
        unique_together = ("anime", "number")

    def __str__(self):
        return f"{self.anime.name} - S{self.number} ({self.watched_episodes}/{self.total_episodes})"

    @property
    def is_completed(self):
        return self.total_episodes > 0 and self.watched_episodes >= self.total_episodes
