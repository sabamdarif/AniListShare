from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("auth/", views.social_login_view, name="social_login"),
    path("signup/", views.signup_view, name="signup"),
    path("login/", views.login_view, name="login"),
    path("verify/", views.verify_otp_view, name="verify_otp"),
    path("logout/", views.logout_view, name="logout"),
    path("api/anime/", views.api_anime_list, name="api_anime_list"),
    path("api/anime/create/", views.api_anime_create, name="api_anime_create"),
    path("api/anime/<int:anime_id>/", views.api_anime_update, name="api_anime_update"),
    path(
        "api/anime/<int:anime_id>/delete/",
        views.api_anime_delete,
        name="api_anime_delete",
    ),
    path("api/anime/reorder/", views.api_anime_reorder, name="api_anime_reorder"),
    path(
        "api/anime/reorder_bulk/",
        views.api_anime_reorder_bulk,
        name="api_anime_reorder_bulk",
    ),
    path("api/category/create/", views.api_category_create, name="api_category_create"),
    path(
        "api/category/<int:category_id>/update/",
        views.api_category_update,
        name="api_category_update",
    ),
    path(
        "api/category/<int:category_id>/delete/",
        views.api_category_delete,
        name="api_category_delete",
    ),
    path("api/mal-search/", views.api_mal_search, name="api_mal_search"),
    path(
        "api/anime/<int:anime_id>/fetch-thumbnail/",
        views.api_fetch_thumbnail,
        name="api_fetch_thumbnail",
    ),
    path("api/import-ods/", views.api_import_ods, name="api_import_ods"),
    path(
        "api/process-thumbnail-batch/",
        views.api_process_thumbnail_batch,
        name="api_process_thumbnail_batch",
    ),
    path(
        "api/thumbnail-fetch-status/",
        views.api_thumbnail_fetch_status,
        name="api_thumbnail_fetch_status",
    ),
    path("api/export-ods/", views.api_export_ods, name="api_export_ods"),
    path("api/share/toggle/", views.api_toggle_share, name="api_toggle_share"),
    path("api/share/status/", views.api_get_share_status, name="api_get_share_status"),
    path("shared/<uuid:share_id>/", views.shared_list_view, name="shared_list_view"),
    path(
        "api/shared/<uuid:share_id>/anime/",
        views.api_shared_anime_list,
        name="api_shared_anime_list",
    ),
]
