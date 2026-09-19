"""URL routes for the Jikan v4 compatible anime API.

Paths mirror Jikan (``/v4/anime``, ``/v4/top/anime``, …) and are mounted under
``/api/v4/`` so the frontend can call them same-origin. As with Jikan, routes
carry no trailing slash.
"""

from django.urls import path

from . import views

app_name = "animeapi"

urlpatterns = [
    path("anime", views.anime_search, name="anime_search"),
    path("anime/<int:mal_id>", views.anime_detail, name="anime_detail"),
    path(
        "anime/<int:mal_id>/full",
        views.anime_detail,
        {"full": True},
        name="anime_detail_full",
    ),
    path("top/anime", views.top_anime, name="top_anime"),
    path("seasons/now", views.season_now, name="season_now"),
    path("seasons/upcoming", views.season_upcoming, name="season_upcoming"),
    path("seasons/<int:year>/<str:season>", views.season_year, name="season_year"),
    path("schedules", views.schedules, name="schedules"),
    path("random/anime", views.random_anime, name="random_anime"),
    path("genres/anime", views.genres_anime, name="genres_anime"),
]
