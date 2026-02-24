from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
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
    path("api/mal-search/", views.api_mal_search, name="api_mal_search"),
    path("api/import-ods/", views.api_import_ods, name="api_import_ods"),
    path("api/import-progress/", views.api_import_progress, name="api_import_progress"),
    path("api/export-ods/", views.api_export_ods, name="api_export_ods"),
]
