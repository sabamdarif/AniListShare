import json

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from animelist.models import Anime, Category, Season


@login_required
def home(request):
    categories = (
        Category.objects.filter(user=request.user)
        .prefetch_related("anime_related_data")
        .all()
    )
    return render(request, "animelist/index.html", {"categories": categories})


def api_anime_list(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    category_id = request.GET.get("category_id")

    if category_id:
        anime_queryset = (
            Anime.objects.filter(category_id=category_id, category__user=request.user)
            .prefetch_related("seasons")
            .order_by("order")
        )
    else:
        return JsonResponse({"error": "category_id required"}, status=400)

    data = []
    for a in anime_queryset:
        data.append(
            {
                "id": a.id,
                "name": a.name,
                "thumbnail_url": a.thumbnail_url,
                "language": a.language,
                "stars": a.stars,
                "order": a.order,
                "seasons": [
                    {
                        "number": s.number,
                        "watched": s.watched_episodes,
                        "total": s.total_episodes,
                        "completed": s.is_completed,
                        "comment": s.comment,
                    }
                    for s in a.seasons.all()
                ],
            }
        )

    return JsonResponse({"anime": data})


@require_POST
@login_required
def api_add_anime(request):
    """Create a new Anime (+ Seasons) for the authenticated user.

    Security gates (in order):
      1. @login_required  → 401 / redirect if not logged in
      2. Django CsrfViewMiddleware → 403 if CSRF token invalid
      3. Category ownership check → 403 if category doesn't belong to user
      4. Input validation → 400 on missing / bad data
    """
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    # ── Required fields ──
    name = (body.get("name") or "").strip()
    category_id = body.get("category_id")

    if not name:
        return JsonResponse({"error": "name is required"}, status=400)
    if not category_id:
        return JsonResponse({"error": "category_id is required"}, status=400)

    # ── Authorization: category must belong to current user ──
    try:
        category = Category.objects.get(id=category_id, user=request.user)
    except Category.DoesNotExist:
        return JsonResponse(
            {"error": "Category not found or access denied"}, status=403
        )

    # ── Optional fields with sanitisation ──
    thumbnail_url = (body.get("thumbnail_url") or "").strip()[:1000]
    language = (body.get("language") or "").strip()[:200]
    stars_raw = body.get("stars")
    stars = None
    if stars_raw is not None:
        try:
            stars = float(stars_raw)
            if stars < 0 or stars > 5:
                stars = max(0, min(5, stars))
        except (TypeError, ValueError):
            stars = None

    seasons_raw = body.get("seasons") or []
    if not isinstance(seasons_raw, list):
        seasons_raw = []

    # ── Atomic create ──
    with transaction.atomic():
        max_order = (
            Anime.objects.filter(category=category)
            .order_by("-order")
            .values_list("order", flat=True)
            .first()
        ) or 0

        anime = Anime.objects.create(
            category=category,
            name=name[:500],
            thumbnail_url=thumbnail_url,
            language=language,
            stars=stars,
            order=max_order + 1,
        )

        for s in seasons_raw[:50]:  # cap at 50 seasons
            if not isinstance(s, dict):
                continue
            try:
                number = int(s.get("number", 1))
                total = max(0, int(s.get("total_episodes", 0)))
                watched = max(0, int(s.get("watched_episodes", 0)))
            except (TypeError, ValueError):
                continue

            comment = str(s.get("comment", ""))[:2000]

            Season.objects.create(
                anime=anime,
                number=number,
                total_episodes=total,
                watched_episodes=min(watched, total),
                comment=comment,
            )

    return JsonResponse({"success": True, "anime_id": anime.id}, status=201)


@require_POST
@login_required
def api_add_category(request):
    """Create a new Category for the authenticated user."""
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = (body.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "name is required"}, status=400)

    max_order = (
        Category.objects.filter(user=request.user)
        .order_by("-order")
        .values_list("order", flat=True)
        .first()
    ) or 0

    category = Category.objects.create(
        user=request.user,
        name=name[:200],
        order=max_order + 1,
    )

    return JsonResponse(
        {"success": True, "category_id": category.id, "name": category.name},
        status=201,
    )
