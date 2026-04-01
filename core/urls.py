from django.urls import path

from core import views

urlpatterns = [
    path("", views.home, name="home_page"),
    path("share/<str:token>/", views.shared_list_view, name="shared_list"),
]
