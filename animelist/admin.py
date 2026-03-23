from django.contrib import admin

from .models import Anime, Category, Season


class SeasonInline(admin.TabularInline):
    model = Season
    extra = 1


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "order")
    list_filter = ("user",)


@admin.register(Anime)
class AnimeAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "get_user",
        "thumbnail_url",
        "language",
        "stars",
        "order",
    )
    list_filter = ("category", "category__user")
    search_fields = ("name",)
    inlines = [SeasonInline]

    def get_user(self, obj):
        return obj.category.user

    get_user.short_description = "User"


@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    list_display = (
        "anime",
        "number",
        "watched_episodes",
        "total_episodes",
        "is_completed",
    )
    list_filter = ("anime__category",)
