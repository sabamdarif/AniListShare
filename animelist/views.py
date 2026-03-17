import json
import os
import random
import ssl
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import pyexcel_ods3
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.mail import send_mail
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils.crypto import get_random_string
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Anime, Category, Season, SharedListProfile


def signup_view(request):
    if request.user.is_authenticated:
        return redirect("index")

    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")
        if not email or not password:
            return render(
                request,
                "animelist/signup.html",
                {"error": "Email and password required"},
            )
        if User.objects.filter(username=email).exists():
            return render(
                request, "animelist/signup.html", {"error": "Email already registered"}
            )

        otp = str(random.randint(100000, 999999))

        cache.set(
            f"signup_data_{email}", {"password": password, "otp": otp}, timeout=600
        )

        html_message = f"""
        <div style="font-family: sans-serif; padding: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; display: inline-block; vertical-align: middle;">AniListShare</h2>
            </div>
            <p style="font-size: 16px;">Your OTP is:- <strong>{otp}</strong></p>
        </div>
        """

        send_mail(
            subject="Your AniListShare OTP Code",
            message=f"Your OTP is:- {otp}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
            html_message=html_message,
        )

        request.session["verify_email"] = email
        return redirect("verify_otp")

    return render(request, "animelist/signup.html")


def verify_otp_view(request):
    email = request.session.get("verify_email")
    if not email:
        return redirect("signup")

    if request.method == "POST":
        otp = request.POST.get("otp", "").strip()
        signup_data = cache.get(f"signup_data_{email}")

        if not signup_data:
            return render(
                request,
                "animelist/verify_otp.html",
                {"error": "OTP expired. Please sign up again."},
            )

        if signup_data["otp"] == otp:
            user = User.objects.create_user(
                username=email,
                email=email,
                password=signup_data["password"],
                is_active=True,
            )

            cache.delete(f"signup_data_{email}")
            del request.session["verify_email"]

            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect("index")
        else:
            return render(
                request, "animelist/verify_otp.html", {"error": "Invalid OTP"}
            )

    return render(request, "animelist/verify_otp.html")


def login_view(request):
    if request.user.is_authenticated:
        return redirect("index")

    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        password = request.POST.get("password", "")

        user = authenticate(request, username=email, password=password)
        if user is not None:
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect("index")
        else:
            return render(
                request, "animelist/login.html", {"error": "Invalid email or password"}
            )

    return render(request, "animelist/login.html")


def forgot_password_view(request):
    if request.method == "POST":
        email = request.POST.get("email", "").strip()

        if not email:
            return redirect("login")

        if not User.objects.filter(email=email).exists():
            otp = get_random_string(length=6, allowed_chars="0123456789")
            cache.set(f"forgot_pass_otp_dummy", otp, timeout=600)
            request.session["forgot_pass_email"] = email
            return redirect("verify_forgot_password")

        otp = get_random_string(length=6, allowed_chars="0123456789")
        cache.set(f"forgot_pass_otp_{email}", otp, timeout=600)

        html_message = f"""
        <div style="font-family: sans-serif; padding: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; display: inline-block; vertical-align: middle;">AniListShare</h2>
            </div>
            <p style="font-size: 16px;">We received a request to reset your password. Your OTP is:- <strong>{otp}</strong></p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
        """

        try:
            send_mail(
                subject="AniListShare - Password Reset OTP",
                message=f"Your OTP is: {otp}",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[email],
                html_message=html_message,
            )
        except Exception as e:
            return render(
                request, "animelist/login.html", {"error": f"Failed to send email: {e}"}
            )

        request.session["forgot_pass_email"] = email
        return redirect("verify_forgot_password")

    return redirect("login")


def verify_forgot_password_view(request):
    if "forgot_pass_email" not in request.session:
        return redirect("login")

    email = request.session["forgot_pass_email"]

    if request.method == "POST":
        otp = request.POST.get("otp", "").strip()

        cached_otp = cache.get(f"forgot_pass_otp_{email}")
        dummy_otp = cache.get("forgot_pass_otp_dummy")

        if (cached_otp and cached_otp == otp) or (dummy_otp and dummy_otp == otp):
            request.session["can_reset_password"] = True
            return redirect("reset_password")
        else:
            return render(
                request,
                "animelist/verify_forgot_password.html",
                {"error": "Invalid OTP"},
            )

    return render(request, "animelist/verify_forgot_password.html")


def reset_password_view(request):
    if "forgot_pass_email" not in request.session or not request.session.get(
        "can_reset_password"
    ):
        return redirect("login")

    email = request.session["forgot_pass_email"]

    if request.method == "POST":
        password = request.POST.get("password", "")
        confirm_password = request.POST.get("confirm_password", "")

        if len(password) < 8:
            return render(
                request,
                "animelist/reset_password.html",
                {"error": "Password must be at least 8 characters"},
            )

        if password != confirm_password:
            return render(
                request,
                "animelist/reset_password.html",
                {"error": "Passwords do not match"},
            )

        users = User.objects.filter(email=email)
        if not users.exists():
            return redirect("login")

        for user in users:
            user.set_password(password)
            user.save()

        cache.delete(f"forgot_pass_otp_{email}")
        del request.session["forgot_pass_email"]
        del request.session["can_reset_password"]

        return redirect("login")

    return render(request, "animelist/reset_password.html")


def logout_view(request):
    logout(request)
    return redirect("login")


@login_required
def index(request):
    categories = (
        Category.objects.filter(user=request.user)
        .prefetch_related("anime_entries__seasons")
        .all()
    )
    return render(request, "animelist/index.html", {"categories": categories})


@csrf_exempt
@require_http_methods(["GET"])
def api_anime_list(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    category_id = request.GET.get("category_id")
    if not category_id:
        return JsonResponse({"error": "category_id required"}, status=400)
    anime_qs = (
        Anime.objects.filter(category_id=category_id, category__user=request.user)
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
                        "episodes_watched": s.episodes_watched,
                        "episodes_total": s.episodes_total,
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
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    category_id = body.get("category_id")
    name = body.get("name", "").strip()
    if not category_id or not name:
        return JsonResponse({"error": "category_id and name required"}, status=400)

    try:
        category = Category.objects.get(id=category_id, user=request.user)
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
                episodes_watched=s.get("episodes_watched")
                if s.get("episodes_watched") not in [None, ""]
                else None,
                episodes_total=s.get("episodes_total")
                if s.get("episodes_total") not in [None, ""]
                else None,
                order=i,
            )

    return JsonResponse({"id": anime.id, "message": "Created"})


@csrf_exempt
@require_http_methods(["PUT"])
def api_anime_update(request, anime_id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        anime = Anime.objects.get(id=anime_id, category__user=request.user)
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
    if new_category_id:
        try:
            if int(new_category_id) != anime.category_id:
                new_cat = Category.objects.get(
                    id=int(new_category_id), user=request.user
                )
                anime.category = new_cat
                anime.order = Anime.objects.filter(category=new_cat).count()
        except (ValueError, TypeError, Category.DoesNotExist):
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
                    episodes_watched=s.get("episodes_watched")
                    if s.get("episodes_watched") not in [None, ""]
                    else None,
                    episodes_total=s.get("episodes_total")
                    if s.get("episodes_total") not in [None, ""]
                    else None,
                    order=i,
                )

    return JsonResponse({"message": "Updated"})


@csrf_exempt
@require_http_methods(["DELETE"])
def api_anime_delete(request, anime_id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        anime = Anime.objects.get(id=anime_id, category__user=request.user)
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
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
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
        anime = Anime.objects.get(id=anime_id, category__user=request.user)
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
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    anime_ids = body.get("anime_ids", [])
    if not isinstance(anime_ids, list):
        return JsonResponse({"error": "anime_ids must be a list"}, status=400)

    for i, a_id in enumerate(anime_ids):
        Anime.objects.filter(id=a_id, category__user=request.user).update(order=i)

    return JsonResponse({"message": "Reordered"})


@csrf_exempt
@require_http_methods(["POST"])
def api_category_create(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = body.get("name", "").strip()
    if not name:
        return JsonResponse({"error": "name required"}, status=400)

    max_order = Category.objects.filter(user=request.user).count()
    cat = Category.objects.create(name=name, order=max_order, user=request.user)
    return JsonResponse({"id": cat.id, "name": cat.name, "message": "Created"})


@csrf_exempt
@require_http_methods(["POST"])
def api_category_reorder(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    category_ids = body.get("category_ids", [])
    if not isinstance(category_ids, list):
        return JsonResponse({"error": "category_ids must be a list"}, status=400)

    for i, c_id in enumerate(category_ids):
        Category.objects.filter(id=c_id, user=request.user).update(order=i)

    return JsonResponse({"message": "Categories reordered"})


@csrf_exempt
@require_http_methods(["PUT"])
def api_category_update(request, category_id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        category = Category.objects.get(id=category_id, user=request.user)
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
@require_http_methods(["DELETE"])
def api_category_delete(request, category_id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        category = Category.objects.get(id=category_id, user=request.user)
    except Category.DoesNotExist:
        return JsonResponse({"error": "Category not found"}, status=404)

    category.delete()
    return JsonResponse({"message": "Category deleted"})


@csrf_exempt
@require_http_methods(["GET"])
def api_mal_search(request):
    query = request.GET.get("q", "").strip()
    if not query or len(query) < 2:
        return JsonResponse({"results": []})

    encoded_q = urllib.parse.quote(query)
    url = f"https://api.jikan.moe/v4/anime?q={encoded_q}&limit=6"

    try:
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


@csrf_exempt
@require_http_methods(["POST"])
def api_fetch_thumbnail(request, anime_id):  # type: ignore[no-untyped-def]
    """Fetch thumbnail from Jikan API for a single anime entry."""
    try:
        anime = Anime.objects.get(id=anime_id)
    except Anime.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    thumb_url, mal_id = _fetch_thumbnail(anime.name)
    if thumb_url:
        anime.thumbnail_url = thumb_url
        if mal_id:
            anime.mal_id = mal_id
        anime.save(update_fields=["thumbnail_url", "mal_id"])
        return JsonResponse(
            {"status": "ok", "thumbnail_url": thumb_url, "mal_id": mal_id}
        )
    return JsonResponse({"status": "not_found", "thumbnail_url": "", "mal_id": None})


def _fetch_thumbnail(name, retries=3):
    """Fetch thumbnail URL and MAL ID from Jikan API for a given anime name."""
    encoded_name = urllib.parse.quote(name)
    url = f"https://api.jikan.moe/v4/anime?q={encoded_name}&limit=1"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "AnimeListMigration/1.0"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            results = data.get("data", [])
            if results:
                item = results[0]
                return (
                    item.get("images", {}).get("jpg", {}).get("image_url", ""),
                    item.get("mal_id"),
                )
            return "", None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** (attempt + 1))
                continue
            return "", None
        except Exception:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return "", None
    return "", None


def _fire_next_batch(host, task_id):
    """Fire-and-forget HTTP request to process the next thumbnail batch."""
    url = f"https://{host}/api/process-thumbnail-batch/?task_id={task_id}"
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, method="POST", data=b"")
        urllib.request.urlopen(req, timeout=3, context=ctx)
    except Exception:
        pass


def _ods_cell(row: list, i: int, default: str = "") -> str:  # type: ignore[type-arg]
    """Safely extract and strip a cell value from an ODS row."""
    return str(row[i]).strip() if i < len(row) and row[i] != "" else default


@csrf_exempt
@require_http_methods(["POST"])
def api_import_ods(request):  # type: ignore[no-untyped-def]
    """Import anime list from an uploaded ODS file."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    uploaded = request.FILES.get("file")
    if not uploaded:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    if not uploaded.name.endswith(".ods"):
        return JsonResponse({"error": "Only .ods files are supported"}, status=400)

    with tempfile.NamedTemporaryFile(suffix=".ods", delete=False, mode="wb") as tmp:
        for chunk in uploaded.chunks():
            tmp.write(chunk)  # type: ignore[arg-type]
        tmp_path = tmp.name

    try:
        data = pyexcel_ods3.get_data(tmp_path)
    except Exception as e:
        os.unlink(tmp_path)
        return JsonResponse({"error": f"Failed to read ODS: {e}"}, status=400)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    Category.objects.filter(user=request.user).delete()

    total_imported = 0

    for order, (sheet_name, rows) in enumerate(data.items()):
        if not rows:
            continue

        cat = Category.objects.create(name=sheet_name, order=order, user=request.user)

        first_cell = str(rows[0][0]).strip() if rows[0] else ""
        is_export_format = first_cell == "Name"

        if is_export_format:
            for idx, row in enumerate(rows[1:]):
                if not row or not str(row[0]).strip():
                    continue

                name = _ods_cell(row, 0)
                if not name:
                    continue

                thumb = _ods_cell(row, 1)
                mal_id_str = _ods_cell(row, 2)
                lang = _ods_cell(row, 3)
                stars_str = _ods_cell(row, 4)
                reason = _ods_cell(row, 5)
                extra_notes = _ods_cell(row, 6)
                order_str = _ods_cell(row, 7, str(idx))

                mal_id = None
                if mal_id_str:
                    try:
                        mal_id = int(float(mal_id_str))
                    except (ValueError, TypeError):
                        pass

                stars = None
                if stars_str:
                    try:
                        stars = int(float(stars_str))
                        if stars == 0:
                            stars = None
                    except (ValueError, TypeError):
                        pass

                try:
                    anime_order = int(float(order_str))
                except (ValueError, TypeError):
                    anime_order = idx

                anime = Anime.objects.create(
                    category=cat,
                    name=name,
                    thumbnail_url=thumb,
                    mal_id=mal_id,
                    language=lang,
                    stars=stars,
                    order=anime_order,
                    reason=reason,
                    extra_notes=extra_notes,
                )

                s_start = 8
                s_idx = 0
                while s_start < len(row):
                    s_label = _ods_cell(row, s_start)
                    if not s_label:
                        s_start += 4
                        continue
                    s_comment = (
                        _ods_cell(row, s_start + 1) if s_start + 1 < len(row) else ""
                    )
                    s_watched_str = (
                        _ods_cell(row, s_start + 2) if s_start + 2 < len(row) else ""
                    )
                    s_total_str = (
                        _ods_cell(row, s_start + 3) if s_start + 3 < len(row) else ""
                    )

                    s_watched = None
                    if s_watched_str:
                        try:
                            s_watched = int(float(s_watched_str))
                        except (ValueError, TypeError):
                            pass

                    s_total = None
                    if s_total_str:
                        try:
                            s_total = int(float(s_total_str))
                        except (ValueError, TypeError):
                            pass

                    Season.objects.create(
                        anime=anime,
                        label=s_label,
                        comment=s_comment,
                        episodes_watched=s_watched,
                        episodes_total=s_total,
                        order=s_idx,
                    )
                    s_idx += 1
                    s_start += 4

                total_imported += 1

        else:
            sheet_type_cell = (
                str(rows[1][0]).strip().upper() if len(rows) > 1 and rows[1] else ""
            )
            is_movies = "MOVIE" in sheet_type_cell
            is_trash = "TRASH" in sheet_type_cell

            header_count = 2 if is_movies else 3
            data_rows = rows[header_count:]

            for idx, row in enumerate(data_rows):
                if not row or not str(row[0]).strip():
                    continue

                name = str(row[0]).strip()
                if not name:
                    continue

                if is_movies:
                    anime = Anime.objects.create(
                        category=cat,
                        name=name,
                        order=idx,
                    )
                    total_imported += 1
                    continue

                language = ""
                reason = ""

                if is_trash:
                    seasons = []
                    for i in range(1, 5):
                        val = _ods_cell(row, i)
                        if val and val != "`":
                            seasons.append(val)
                    reason = _ods_cell(row, 5)
                    language = _ods_cell(row, 7) if len(row) > 7 else ""
                else:
                    if len(row) >= 13:
                        language = _ods_cell(row, 12)
                    elif len(row) > 2:
                        last_val = _ods_cell(row, len(row) - 1)
                        if last_val and not last_val.startswith("S"):
                            language = last_val

                    season_end = (
                        12 if len(row) >= 13 else len(row) - (1 if language else 0)
                    )
                    seasons = []
                    for i in range(1, season_end):
                        val = _ods_cell(row, i)
                        if val and val != "`":
                            seasons.append(val)

                anime = Anime.objects.create(
                    category=cat,
                    name=name,
                    language=language,
                    reason=reason,
                    order=idx,
                )

                for s_idx, s_label in enumerate(seasons):
                    Season.objects.create(
                        anime=anime,
                        label=s_label,
                        order=s_idx,
                    )

                total_imported += 1

    auto_fetch = request.POST.get("auto_fetch", "false") == "true"
    thumbnails_needed = 0
    task_id = None

    if auto_fetch and total_imported > 0:
        thumbnails_needed = Anime.objects.filter(
            thumbnail_url="", category__user=request.user
        ).count()

        if thumbnails_needed > 0:
            task_id = str(uuid.uuid4())
            task_data = {
                "task_id": task_id,
                "user_id": request.user.id,
                "total": thumbnails_needed,
                "current": 0,
                "current_name": "",
                "done": False,
            }
            cache.set(f"thumb_task:{task_id}", task_data, timeout=7200)
            cache.set(f"thumb_active:{request.user.id}", task_id, timeout=7200)
            _fire_next_batch(request.get_host(), task_id)

    return JsonResponse(
        {
            "status": "ok",
            "imported": total_imported,
            "thumbnails_needed": thumbnails_needed,
            "task_id": task_id,
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def api_process_thumbnail_batch(request):
    """Internal endpoint: process 1 thumbnail and self-invoke to continue.

    No user auth required — the task_id serves as the auth token.
    """
    task_id = request.GET.get("task_id", "")
    task = cache.get(f"thumb_task:{task_id}")
    if not task:
        return JsonResponse({"error": "Unknown task"}, status=404)
    if task["done"]:
        return JsonResponse(task)

    user_id = task["user_id"]

    anime = (
        Anime.objects.filter(thumbnail_url="", category__user_id=user_id)
        .order_by("id")
        .first()
    )

    if not anime:
        task["done"] = True
        task["current"] = task["total"]
        cache.set(f"thumb_task:{task_id}", task, timeout=7200)
        return JsonResponse(task)

    thumb_url, mal_id = _fetch_thumbnail(anime.name)
    if thumb_url:
        anime.thumbnail_url = thumb_url
        if mal_id:
            anime.mal_id = mal_id
        anime.save(update_fields=["thumbnail_url", "mal_id"])
    else:
        anime.thumbnail_url = "none"
        anime.save(update_fields=["thumbnail_url"])

    task["current"] += 1
    task["current_name"] = anime.name

    remaining = Anime.objects.filter(
        thumbnail_url="", category__user_id=user_id
    ).count()
    if remaining == 0:
        task["done"] = True

    cache.set(f"thumb_task:{task_id}", task, timeout=7200)

    if not task["done"]:
        time.sleep(1.5)
        _fire_next_batch(request.get_host(), task_id)

    return JsonResponse(task)


@csrf_exempt
@require_http_methods(["GET"])
def api_thumbnail_fetch_status(request):
    """Return the current thumbnail-fetch task progress for the logged-in user."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    task_id = cache.get(f"thumb_active:{request.user.id}")
    if not task_id:
        return JsonResponse({"active": False})

    task = cache.get(f"thumb_task:{task_id}")
    if not task:
        return JsonResponse({"active": False})

    return JsonResponse({"active": True, **task})


@csrf_exempt
@require_http_methods(["GET"])
def api_export_ods(request):
    """Export the entire anime list as an ODS file download."""
    categories = Category.objects.prefetch_related("anime_entries__seasons").order_by(
        "order"
    )

    book = {}

    for cat in categories:
        header = [
            "Name",
            "Thumbnail URL",
            "MAL ID",
            "Language",
            "Stars",
            "Reason",
            "Extra Notes",
            "Order",
        ]

        max_seasons = 0
        anime_list = list(cat.anime_entries.order_by("order"))
        for anime in anime_list:
            sc = anime.seasons.count()
            if sc > max_seasons:
                max_seasons = sc

        for si in range(max_seasons):
            n = si + 1
            header.extend(
                [f"S{n} Label", f"S{n} Comment", f"S{n} Watched", f"S{n} Total"]
            )

        rows = [header]

        for anime in anime_list:
            row = [
                anime.name,
                anime.thumbnail_url or "",
                anime.mal_id if anime.mal_id else "",
                anime.language or "",
                anime.stars if anime.stars else "",
                anime.reason or "",
                anime.extra_notes or "",
                anime.order,
            ]
            for season in anime.seasons.order_by("order"):
                row.extend(
                    [
                        season.label,
                        season.comment or "",
                        season.episodes_watched
                        if season.episodes_watched is not None
                        else "",
                        season.episodes_total
                        if season.episodes_total is not None
                        else "",
                    ]
                )
            rows.append(row)

        sheet_name = cat.name or f"Category {cat.id}"
        book[sheet_name] = rows

    if not book:
        book["Sheet1"] = [["No data"]]

    with tempfile.NamedTemporaryFile(suffix=".ods", delete=False) as tmp:
        tmp_path = tmp.name

    pyexcel_ods3.save_data(tmp_path, book)

    with open(tmp_path, "rb") as f:
        content = f.read()

    response = HttpResponse(
        content,
        content_type="application/vnd.oasis.opendocument.spreadsheet",
    )
    response["Content-Disposition"] = 'attachment; filename="animelist_backup.ods"'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def api_toggle_share(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    profile, created = SharedListProfile.objects.get_or_create(user=request.user)

    try:
        body = json.loads(request.body)
        is_enabled = body.get("is_enabled")
        if is_enabled is not None:
            profile.is_enabled = bool(is_enabled)
            profile.save()
    except json.JSONDecodeError:
        pass

    url = request.build_absolute_uri(f"/shared/{profile.share_id}/")
    return JsonResponse({"is_enabled": profile.is_enabled, "share_url": url})


@require_http_methods(["GET"])
def api_get_share_status(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    profile, created = SharedListProfile.objects.get_or_create(user=request.user)
    url = request.build_absolute_uri(f"/shared/{profile.share_id}/")
    return JsonResponse({"is_enabled": profile.is_enabled, "share_url": url})


def shared_list_view(request, share_id):
    try:
        profile = SharedListProfile.objects.get(share_id=share_id)
    except (SharedListProfile.DoesNotExist, ValueError):
        return render(request, "animelist/shared_404.html", status=404)

    if not profile.is_enabled:
        return render(request, "animelist/shared_404.html", status=404)

    categories = (
        Category.objects.filter(user=profile.user)
        .prefetch_related("anime_entries__seasons")
        .all()
    )
    owner_name = (
        profile.user.username.split("@")[0]
        if "@" in profile.user.username
        else profile.user.username
    )

    return render(
        request,
        "animelist/shared_index.html",
        {
            "categories": categories,
            "owner_name": owner_name,
            "share_id": share_id,
        },
    )


@csrf_exempt
@require_http_methods(["GET"])
def api_shared_anime_list(request, share_id):
    try:
        profile = SharedListProfile.objects.get(share_id=share_id)
    except (SharedListProfile.DoesNotExist, ValueError):
        return JsonResponse({"error": "Not found"}, status=404)

    if not profile.is_enabled:
        return JsonResponse({"error": "Not found"}, status=404)

    category_id = request.GET.get("category_id")
    if not category_id:
        return JsonResponse({"error": "category_id required"}, status=400)

    anime_qs = (
        Anime.objects.filter(category_id=category_id, category__user=profile.user)
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
                        "episodes_watched": s.episodes_watched,
                        "episodes_total": s.episodes_total,
                        "order": s.order,
                    }
                    for s in a.seasons.all()
                ],
            }
        )
    return JsonResponse({"anime": data})
