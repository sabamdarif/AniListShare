from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views

urlpatterns = [
    path(
        "anime/category/",
        views.CategoryListCreateApiView.as_view(),
        name="category_list_create",
    ),
    path(
        "anime/category/reorder/",
        views.CategoryReorderApiView.as_view(),
        name="category_reorder",
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
        "anime/list/category/<int:category_id>/reorder/",
        views.AnimeReorderApiView.as_view(),
        name="anime_reorder",
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
    path(
        "share/status/",
        views.ShareStatusApiView.as_view(),
        name="share_status",
    ),
    path(
        "share/toggle/",
        views.ShareToggleApiView.as_view(),
        name="share_toggle",
    ),
    path(
        "share/copy/<str:token>/",
        views.ShareCopyApiView.as_view(),
        name="share_copy",
    ),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
