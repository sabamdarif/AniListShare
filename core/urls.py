from django.urls import path

from core import views

urlpatterns = [
    path("", views.home, name="home_page"),
    path("api/anime-list/", views.api_anime_list, name="api_anime_list"),
    path("api/add-anime/", views.api_add_anime, name="api_add_anime"),
    path("api/add-category/", views.api_add_category, name="api_add_category"),
    path("api/edit-category/", views.api_edit_category, name="api_edit_category"),
    path("api/delete-category/", views.api_delete_category, name="api_delete_category"),
]
