from django.urls import path

from . import views

urlpatterns = [
    path(
        "anime/category/",
        views.CategoryListCreateApiView.as_view(),
        name="category_list_create",
    ),
    path(
        "anime/category/<int:pk>/",
        views.CategoryDetailApiView.as_view(),
        name="category_detail",
    ),
    path(
        "anime/list/category/<int:category_id>/",
        views.AnimeListCreateApiView.as_view(),
        name="anime_list_create",
    ),
    path(
        "anime/list/category/<int:category_id>/<int:pk>/",
        views.AnimeDetailApiView.as_view(),
        name="anime_detail",
    ),
    path(
        "anime/search/",
        views.SearchAnimeApiView.as_view(),
        name="anime_search",
    ),
]
