from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views

urlpatterns = [
    path(
        "v1/categories/",
        views.CategoryListCreateApiView.as_view(),
        name="category_list_create",
    ),
    path(
        "v1/categories/order/",
        views.CategoryReorderApiView.as_view(),
        name="category_reorder",
    ),
    path(
        "v1/categories/<int:pk>/",
        views.CategoryDetailApiView.as_view(),
        name="category_detail",
    ),
    path(
        "v1/categories/<int:category_id>/animes/",
        views.AnimeListCreateApiView.as_view(http_method_names=["get"]),
        name="anime_list_create",
    ),
    path(
        "v1/categories/<int:category_id>/animes/order/",
        views.AnimeReorderApiView.as_view(),
        name="anime_reorder",
    ),
    path(
        "v1/categories/<int:category_id>/animes/<int:pk>/",
        views.AnimeDetailApiView.as_view(http_method_names=["get"]),
        name="anime_detail",
    ),
    path(
        "v1/animes/bulk_sync/",
        views.AnimeBulkSyncApiView.as_view(),
        name="anime_bulk_sync",
    ),
    path(
        "v1/animes/search/",
        views.SearchAnimeApiView.as_view(),
        name="anime_search",
    ),
    path(
        "v1/share/",
        views.ShareManageApiView.as_view(),
        name="share_manage",
    ),
    path(
        "v1/share/copy/<str:token>/",
        views.ShareCopyApiView.as_view(),
        name="share_copy",
    ),
    path(
        "v1/share/data/<str:token>/",
        views.ShareDataApiView.as_view(),
        name="share_data",
    ),
    path("v1/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("v1/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path(
        "v1/token/session/", views.SessionTokenApiView.as_view(), name="token_session"
    ),
]
