from django.urls import path

from . import views

urlpatterns = [
    path("list-anime/category/<int:pk>", views.list_anime, name="list_anime"),
]
