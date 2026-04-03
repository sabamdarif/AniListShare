import secrets

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Anime, Category, Season, ShareLink

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
        qs = Category.objects.filter(user=self.request.user)
        max_order = qs.aggregate(m=Max("order"))["m"]
        next_order = (max_order + 1) if max_order is not None else 0
        max_ucid = qs.aggregate(m=Max("user_category_id"))["m"]
        next_ucid = (max_ucid + 1) if max_ucid is not None else 1
        serializer.save(
            user=self.request.user, order=next_order, user_category_id=next_ucid
        )


class CategoryDetailApiView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user_category_id"
    lookup_url_kwarg = "pk"

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
                category__user_category_id=self.kwargs["category_id"],
            )
        )

    def perform_create(self, serializer):
        category = get_object_or_404(
            Category,
            user_category_id=self.kwargs["category_id"],
            user=self.request.user,
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
                category__user_category_id=self.kwargs["category_id"],
            )
        )

    def perform_update(self, serializer):
        new_category_id = self.request.data.get("category_id")
        old_category = serializer.instance.category

        # If the category is being changed
        if new_category_id is not None and str(new_category_id) != str(
            self.kwargs["category_id"]
        ):
            new_category = get_object_or_404(
                Category,
                user_category_id=new_category_id,
                user=self.request.user,
            )
            # Add to the end of the new category
            max_order_agg = Anime.objects.filter(category=new_category).aggregate(
                m=Max("order")
            )
            max_order = max_order_agg.get("m")
            next_order = (max_order + 1) if max_order is not None else 0

            serializer.save(category=new_category, order=next_order)
            _reindex_anime_order(old_category)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        category = instance.category
        instance.delete()
        _reindex_anime_order(category)


class AnimeReorderApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, category_id):
        category = get_object_or_404(
            Category, user_category_id=category_id, user=request.user
        )
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
            Category.objects.filter(user=request.user).values_list(
                "user_category_id", flat=True
            )
        )

        for cid in ordered_ids:
            if cid not in valid_ids:
                return Response(
                    {"detail": f"Category {cid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for idx, cid in enumerate(ordered_ids):
            Category.objects.filter(user=request.user, user_category_id=cid).update(
                order=idx
            )

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


class ShareCopyApiView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        try:
            share = ShareLink.objects.get(token=token)
        except ShareLink.DoesNotExist:
            return Response(
                {"detail": "This shared link does not exist or has been disabled."},
                status=status.HTTP_404_NOT_FOUND,
            )

        source_user = share.user
        target_user = request.user

        if source_user == target_user:
            return Response(
                {"detail": "Cannot copy your own list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            owner_categories = (
                Category.objects.filter(user=source_user)
                .prefetch_related("animes__seasons")
                .order_by("order")
            )

            for o_cat in owner_categories:
                # Find matching category by name for the target user
                t_cat = Category.objects.filter(
                    user=target_user, name=o_cat.name
                ).first()
                if not t_cat:
                    # Create new category with sequentially generated user_category_id and order
                    qs = Category.objects.filter(user=target_user)
                    max_order = qs.aggregate(m=Max("order"))["m"]
                    next_order = (max_order + 1) if max_order is not None else 0
                    max_ucid = qs.aggregate(m=Max("user_category_id"))["m"]
                    next_ucid = (max_ucid + 1) if max_ucid is not None else 1

                    t_cat = Category.objects.create(
                        user=target_user,
                        name=o_cat.name,
                        order=next_order,
                        user_category_id=next_ucid,
                    )

                # Find existing animes inside this category to avoid duplicates
                existing_anime_names = set(
                    Anime.objects.filter(category=t_cat).values_list("name", flat=True)
                )

                # Setup ordering base for any newly created anime
                max_anime_order = Anime.objects.filter(category=t_cat).aggregate(
                    m=Max("order")
                )["m"]
                next_anime_order = (
                    (max_anime_order + 1) if max_anime_order is not None else 0
                )

                for o_ani in o_cat.animes.all():
                    if o_ani.name in existing_anime_names:
                        continue

                    t_ani = Anime.objects.create(
                        category=t_cat,
                        name=o_ani.name,
                        thumbnail_url=o_ani.thumbnail_url,
                        language=o_ani.language,
                        stars=o_ani.stars,
                        order=next_anime_order,
                    )
                    next_anime_order += 1

                    # Copy seasons in bulk
                    seasons_to_create = []
                    for o_season in o_ani.seasons.all():
                        seasons_to_create.append(
                            Season(
                                anime=t_ani,
                                number=o_season.number,
                                total_episodes=o_season.total_episodes,
                                watched_episodes=o_season.watched_episodes,
                                comment=o_season.comment,
                            )
                        )
                    if seasons_to_create:
                        Season.objects.bulk_create(seasons_to_create)

        return Response(
            {"status": "ok", "detail": "List copied successfully!"},
            status=status.HTTP_200_OK,
        )
