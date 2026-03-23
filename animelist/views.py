from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render

from animelist.models import Anime, Category


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

    if category_id == "all":
        anime_queryset = Anime.objects.filter(category__user=request.user).order_by(
            "category__order", "order"
        )
    elif category_id:
        anime_queryset = Anime.objects.filter(
            category_id=category_id, category__user=request.user
        ).order_by("order")
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
                "season": a.season,
            }
        )

    return JsonResponse({"anime": data})
