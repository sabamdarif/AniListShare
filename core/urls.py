from django.urls import path

from core import views

urlpatterns = [
    path("", views.home_redirect, name="root_redirect"),
    path("home/", views.landing_page, name="landing_page"),
    path("list/", views.list_view, name="list_view"),
    path("share/<str:token>/", views.shared_list_view, name="shared_list"),
]
