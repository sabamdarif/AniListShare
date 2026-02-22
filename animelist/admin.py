from django.contrib import admin
from .models import Category, Anime, Season

class SeasonInline(admin.TabularInline):
    model = Season
    extra = 1

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'order')
    ordering = ('order',)

@admin.register(Anime)
class AnimeAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'language', 'stars', 'order')
    list_filter = ('category',)
    search_fields = ('name',)
    inlines = [SeasonInline]
    ordering = ('category', 'order')

@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ('anime', 'label', 'order')
    list_filter = ('anime__category',)
