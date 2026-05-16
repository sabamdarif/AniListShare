from allauth.account.decorators import verified_email_required
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import render, redirect

from core.models import ShareLink


def home_redirect(request):
    if request.user.is_authenticated:
        return redirect("list_view")
    return redirect("landing_page")


def landing_page(request):
    return render(request, "core/home.html")


def list_view(request):
    if not request.user.is_authenticated:
        return redirect("landing_page")

    @verified_email_required
    def inner_view(request):
        context = {"user_is_authenticated": request.user.is_authenticated}
        return render(request, "core/index.html", context)

    return inner_view(request)


def shared_list_view(request, token):
    try:
        share = ShareLink.objects.select_related("user").get(token=token)
    except ShareLink.DoesNotExist:
        raise Http404("This shared link does not exist or has been disabled.")

    owner = share.user

    context = {
        "owner_name": owner.get_full_name() or owner.username,
        "share_token": token,
        "user_is_authenticated": request.user.is_authenticated,
    }
    return render(request, "core/shared_list.html", context)
