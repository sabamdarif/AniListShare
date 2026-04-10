from allauth.account.decorators import verified_email_required
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import render

from core.models import ShareLink


@login_required
@verified_email_required
def home(request):
    context = {"user_is_authenticated": request.user.is_authenticated}
    return render(request, "core/index.html", context)


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
