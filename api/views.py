from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from core.models import Anime, Category

from .serializers import AnimeSerializer, CategorySerializer, SearchAnimeSerializer


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
        serializer.save(category=category)


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
