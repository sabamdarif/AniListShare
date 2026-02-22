from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/anime/', views.api_anime_list, name='api_anime_list'),
    path('api/anime/create/', views.api_anime_create, name='api_anime_create'),
    path('api/anime/<int:anime_id>/', views.api_anime_update, name='api_anime_update'),
    path('api/anime/<int:anime_id>/delete/', views.api_anime_delete, name='api_anime_delete'),
    path('api/anime/reorder/', views.api_anime_reorder, name='api_anime_reorder'),
    path('api/category/create/', views.api_category_create, name='api_category_create'),
    path('api/mal-search/', views.api_mal_search, name='api_mal_search'),
]
