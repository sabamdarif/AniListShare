import secrets

from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Anime, Category, ShareLink

from .serializers import AnimeSerializer, CategorySerializer, SearchAnimeSerializer


def _reindex_anime_order(category):
    """Re-assign order = 0, 1, 2, … for all anime in this category."""
    siblings = Anime.objects.filter(category=category).order_by("order", "pk")
    for idx, anime in enumerate(siblings):
        if anime.order != idx:
            Anime.objects.filter(pk=anime.pk).update(order=idx)


class CategoryListCreateApiView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        max_order = Category.objects.filter(user=self.request.user).aggregate(
            m=Max("order")
        )["m"]
        next_order = (max_order + 1) if max_order is not None else 0
        serializer.save(user=self.request.user, order=next_order)


class CategoryDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_destroy(self, instance):
        user = instance.user
        instance.delete()
        # Re-index category order after deletion
        siblings = Category.objects.filter(user=user).order_by("order", "pk")
        for idx, cat in enumerate(siblings):
            if cat.order != idx:
                Category.objects.filter(pk=cat.pk).update(order=idx)


class AnimeListCreateApiView(generics.ListCreateAPIView):
    queryset = Anime.objects.prefetch_related("seasons").select_related("category")
    serializer_class = AnimeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                category__user=self.request.user,
                category_id=self.kwargs["category_id"],
            )
        )

    def perform_create(self, serializer):
        category = get_object_or_404(
            Category, pk=self.kwargs["category_id"], user=self.request.user
        )
        # Place new anime at the end of the list
        max_order = Anime.objects.filter(category=category).aggregate(m=Max("order"))[
            "m"
        ]
        next_order = (max_order + 1) if max_order is not None else 0
        serializer.save(category=category, order=next_order)


class AnimeDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Anime.objects.prefetch_related("seasons").select_related("category")
    serializer_class = AnimeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                category__user=self.request.user,
                category_id=self.kwargs["category_id"],
            )
        )

    def perform_destroy(self, instance):
        category = instance.category
        instance.delete()
        _reindex_anime_order(category)


class AnimeReorderApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, category_id):
        category = get_object_or_404(Category, pk=category_id, user=request.user)
        ordered_ids = request.data.get("order", [])
        if not isinstance(ordered_ids, list):
            return Response(
                {"detail": "order must be a list of anime IDs"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        anime_qs = Anime.objects.filter(category=category)
        valid_ids = set(anime_qs.values_list("id", flat=True))

        for aid in ordered_ids:
            if aid not in valid_ids:
                return Response(
                    {"detail": f"Anime {aid} not found in this category"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for idx, aid in enumerate(ordered_ids):
            Anime.objects.filter(pk=aid).update(order=idx)

        return Response({"status": "ok"})


class CategoryReorderApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ordered_ids = request.data.get("order", [])
        if not isinstance(ordered_ids, list):
            return Response(
                {"detail": "order must be a list of category IDs"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_ids = set(
            Category.objects.filter(user=request.user).values_list("id", flat=True)
        )

        for cid in ordered_ids:
            if cid not in valid_ids:
                return Response(
                    {"detail": f"Category {cid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for idx, cid in enumerate(ordered_ids):
            Category.objects.filter(pk=cid).update(order=idx)

        return Response({"status": "ok"})


class SearchAnimeApiView(generics.ListAPIView):
    """Return all anime across all categories for the authenticated user.

    Used by the client-side search index — called once on page load.
    """

    queryset = Anime.objects.select_related("category")
    serializer_class = SearchAnimeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Return everything in one response

    def get_queryset(self):
        return super().get_queryset().filter(category__user=self.request.user)


def _generate_share_token() -> str:
    while True:
        token = secrets.token_urlsafe(11)[:11]
        if not ShareLink.objects.filter(token=token).exists():
            return token


class ShareStatusApiView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            link = request.user.share_link
            return Response(
                {
                    "enabled": True,
                    "token": link.token,
                    "url": request.build_absolute_uri(f"/share/{link.token}/"),
                }
            )
        except ShareLink.DoesNotExist:
            return Response({"enabled": False})


class ShareToggleApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        enable = request.data.get("enable", False)

        if enable:
            link, created = ShareLink.objects.get_or_create(
                user=request.user,
                defaults={"token": _generate_share_token()},
            )
            return Response(
                {
                    "enabled": True,
                    "token": link.token,
                    "url": request.build_absolute_uri(f"/share/{link.token}/"),
                },
                status=status.HTTP_200_OK,
            )
        else:
            ShareLink.objects.filter(user=request.user).delete()
            return Response({"enabled": False}, status=status.HTTP_200_OK)
