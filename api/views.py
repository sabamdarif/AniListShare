from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from core.models import Anime, Category

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
        serializer.save(user=self.request.user)


class CategoryDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)


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
