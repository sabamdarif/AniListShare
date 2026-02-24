import uuid

from django.contrib.auth.models import User
from django.db import models


class Category(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Anime(models.Model):
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="anime_entries"
    )
    name = models.CharField(max_length=500)
    thumbnail_url = models.URLField(max_length=1000, blank=True, default="")
    mal_id = models.IntegerField(null=True, blank=True)
    language = models.CharField(max_length=200, blank=True, default="")
    stars = models.IntegerField(null=True, blank=True)
    order = models.IntegerField(default=0)
    reason = models.TextField(blank=True, default="")
    extra_notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name


class Season(models.Model):
    anime = models.ForeignKey(Anime, on_delete=models.CASCADE, related_name="seasons")
    label = models.CharField(max_length=200)
    comment = models.TextField(blank=True, default="")
    episodes_watched = models.IntegerField(null=True, blank=True)
    episodes_total = models.IntegerField(null=True, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.anime.name} - {self.label}"


class SharedListProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="shared_profile"
    )
    share_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    is_enabled = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username}'s Shared List ({'Enabled' if self.is_enabled else 'Disabled'})"
