from django.urls import include, path

from . import views

urlpatterns = [
    path("settings/", views.account_settings, name="account_settings"),
    path("delete/", views.account_delete, name="account_delete"),
    path("", include("allauth.urls"), name="allauth_index"),
    path("mfa/", include("allauth.mfa.urls"), name="mfa_index"),
]
