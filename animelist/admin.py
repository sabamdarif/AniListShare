from django.contrib import admin

from .models import Anime, Category


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
        "season",
    )
    list_filter = ("category", "category__user")
    search_fields = ("name",)

    def get_user(self, obj):
        return obj.category.user

    get_user.short_description = "User"
