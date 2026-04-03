import json

from allauth.account.decorators import verified_email_required
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import render
from rest_framework_simplejwt.tokens import RefreshToken

from api.serializers import AnimeSerializer
from core.models import Category, ShareLink


@login_required
@verified_email_required
def home(request):
    categories = (
        Category.objects.filter(user=request.user).prefetch_related("animes").all()
    )

    context = {"categories": categories}
    if request.user.is_authenticated:
        refresh = RefreshToken.for_user(request.user)
        context["jwt_access"] = str(refresh.access_token)
        context["jwt_refresh"] = str(refresh)

    return render(request, "core/index.html", context)


def shared_list_view(request, token):
    try:
        share = ShareLink.objects.select_related("user").get(token=token)
    except ShareLink.DoesNotExist:
        raise Http404("This shared link does not exist or has been disabled.")

    owner = share.user
    categories = (
        Category.objects.filter(user=owner)
        .prefetch_related("animes__seasons")
        .order_by("order")
    )

    data = [
        {
            "id": cat.user_category_id,
            "name": cat.name,
            "animes": AnimeSerializer(cat.animes.all(), many=True).data,
        }
        for cat in categories
    ]

    context = {
        "owner_name": owner.get_full_name() or owner.username,
        "categories_json": json.dumps(data),
        "share_token": token,
    }

    if request.user.is_authenticated:
        refresh = RefreshToken.for_user(request.user)
        context["jwt_access"] = str(refresh.access_token)
        context["jwt_refresh"] = str(refresh)

    return render(request, "core/shared_list.html", context)
