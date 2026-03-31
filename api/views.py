from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import Anime, Category

from .serializers import AnimeSerializer


@login_required
@api_view(["GET"])
def list_anime(request, pk):
    category = get_object_or_404(Category, id=pk, user=request.user)
    animes = (
        Anime.objects.filter(category=category)
        .select_related("category")
        .prefetch_related("seasons")
    )

    serializer = AnimeSerializer(animes, many=True)
    return Response(serializer.data)
