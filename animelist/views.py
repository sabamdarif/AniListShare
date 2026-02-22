import json
import urllib.parse
import urllib.request

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Anime, Category, Season


def index(request):
    categories = Category.objects.prefetch_related("anime_entries__seasons").all()
    return render(request, "animelist/index.html", {"categories": categories})


@csrf_exempt
@require_http_methods(["GET"])
def api_anime_list(request):
    category_id = request.GET.get("category_id")
    if not category_id:
        return JsonResponse({"error": "category_id required"}, status=400)
    anime_qs = (
        Anime.objects.filter(category_id=category_id)
        .prefetch_related("seasons")
        .order_by("order")
    )
    data = []
    for a in anime_qs:
        data.append(
            {
                "id": a.id,
                "name": a.name,
                "thumbnail_url": a.thumbnail_url,
                "mal_id": a.mal_id,
                "language": a.language,
                "stars": a.stars,
                "order": a.order,
                "reason": a.reason,
                "extra_notes": a.extra_notes,
                "seasons": [
                    {
                        "id": s.id,
                        "label": s.label,
                        "comment": s.comment,
                        "order": s.order,
                    }
                    for s in a.seasons.all()
                ],
            }
        )
    return JsonResponse({"anime": data})


@csrf_exempt
@require_http_methods(["POST"])
def api_anime_create(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    category_id = body.get("category_id")
    name = body.get("name", "").strip()
    if not category_id or not name:
        return JsonResponse({"error": "category_id and name required"}, status=400)

    try:
        category = Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        return JsonResponse({"error": "Category not found"}, status=404)

    max_order = Anime.objects.filter(category=category).count()

    anime = Anime.objects.create(
        category=category,
        name=name,
        thumbnail_url=body.get("thumbnail_url", ""),
        mal_id=body.get("mal_id"),
        language=body.get("language", ""),
        stars=body.get("stars") if body.get("stars") not in [None, "", 0] else None,
        order=max_order,
        reason=body.get("reason", ""),
        extra_notes=body.get("extra_notes", ""),
    )

    seasons = body.get("seasons", [])
    for i, s in enumerate(seasons):
        if s.get("label", "").strip():
            Season.objects.create(
                anime=anime,
                label=s["label"].strip(),
                comment=s.get("comment", ""),
                order=i,
            )

    return JsonResponse({"id": anime.id, "message": "Created"})


@csrf_exempt
@require_http_methods(["PUT"])
def api_anime_update(request, anime_id):
    try:
        anime = Anime.objects.get(id=anime_id)
    except Anime.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    anime.name = body.get("name", anime.name).strip()
    anime.thumbnail_url = body.get("thumbnail_url", anime.thumbnail_url)
    anime.mal_id = body.get("mal_id", anime.mal_id)
    anime.language = body.get("language", anime.language)
    anime.reason = body.get("reason", anime.reason)
    anime.extra_notes = body.get("extra_notes", anime.extra_notes)

    stars = body.get("stars")
    if stars == "" or stars == 0:
        anime.stars = None
    elif stars is not None:
        anime.stars = stars

    new_category_id = body.get("category_id")
    if new_category_id and new_category_id != anime.category_id:
        try:
            new_cat = Category.objects.get(id=new_category_id)
            anime.category = new_cat
            anime.order = Anime.objects.filter(category=new_cat).count()
        except Category.DoesNotExist:
            pass

    anime.save()

    if "seasons" in body:
        anime.seasons.all().delete()
        for i, s in enumerate(body["seasons"]):
            if s.get("label", "").strip():
                Season.objects.create(
                    anime=anime,
                    label=s["label"].strip(),
                    comment=s.get("comment", ""),
                    order=i,
                )

    return JsonResponse({"message": "Updated"})


@csrf_exempt
@require_http_methods(["DELETE"])
def api_anime_delete(request, anime_id):
    try:
        anime = Anime.objects.get(id=anime_id)
    except Anime.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    cat_id = anime.category_id
    anime.delete()

    for i, a in enumerate(Anime.objects.filter(category_id=cat_id).order_by("order")):
        if a.order != i:
            a.order = i
            a.save(update_fields=["order"])

    return JsonResponse({"message": "Deleted"})


@csrf_exempt
@require_http_methods(["POST"])
def api_anime_reorder(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    anime_id = body.get("anime_id")
    direction = body.get("direction")

    if not anime_id or direction not in ("up", "down"):
        return JsonResponse(
            {"error": "anime_id and direction (up/down) required"}, status=400
        )

    try:
        anime = Anime.objects.get(id=anime_id)
    except Anime.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    siblings = list(Anime.objects.filter(category=anime.category).order_by("order"))
    idx = next((i for i, a in enumerate(siblings) if a.id == anime.id), None)

    if idx is None:
        return JsonResponse({"error": "Not found in list"}, status=400)

    if direction == "up" and idx > 0:
        siblings[idx], siblings[idx - 1] = siblings[idx - 1], siblings[idx]
    elif direction == "down" and idx < len(siblings) - 1:
        siblings[idx], siblings[idx + 1] = siblings[idx + 1], siblings[idx]
    else:
        return JsonResponse({"message": "No change"})

    for i, a in enumerate(siblings):
        if a.order != i:
            a.order = i
            a.save(update_fields=["order"])

    return JsonResponse({"message": "Reordered"})


@csrf_exempt
@require_http_methods(["POST"])
def api_anime_reorder_bulk(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    anime_ids = body.get("anime_ids", [])
    if not isinstance(anime_ids, list):
        return JsonResponse({"error": "anime_ids must be a list"}, status=400)

    # Note: normally we might check if they belong to same category
    for i, a_id in enumerate(anime_ids):
        Anime.objects.filter(id=a_id).update(order=i)

    return JsonResponse({"message": "Reordered"})


@csrf_exempt
@require_http_methods(["POST"])
def api_category_create(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = body.get("name", "").strip()
    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    max_order = Category.objects.count()
    cat = Category.objects.create(name=name, order=max_order)
    return JsonResponse({"id": cat.id, "name": cat.name, "message": "Created"})


@csrf_exempt
@require_http_methods(["PUT"])
def api_category_update(request, category_id):
    try:
        category = Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        return JsonResponse({"error": "Category not found"}, status=404)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = body.get("name", "").strip()
    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    category.name = name
    category.save()
    return JsonResponse({"message": "Category updated"})


@csrf_exempt
@require_http_methods(["GET"])
def api_mal_search(request):
    query = request.GET.get("q", "").strip()
    if not query or len(query) < 2:
        return JsonResponse({"results": []})

    try:
        url = f"https://api.jikan.moe/v4/anime?q={urllib.parse.quote(query)}&limit=6&sfw=true"
        req = urllib.request.Request(url, headers={"User-Agent": "AnimeListApp/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
        results = []
        for item in data.get("data", []):
            results.append(
                {
                    "mal_id": item.get("mal_id"),
                    "title": item.get("title", ""),
                    "title_english": item.get("title_english", ""),
                    "image_url": item.get("images", {})
                    .get("jpg", {})
                    .get("image_url", ""),
                    "episodes": item.get("episodes"),
                    "type": item.get("type", ""),
                }
            )
        return JsonResponse({"results": results})
    except Exception:
        return JsonResponse({"results": []})
