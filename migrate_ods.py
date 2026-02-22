#!/usr/bin/env python
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myanimelist.settings")

import django

django.setup()

import pyexcel_ods3

from animelist.models import Anime, Category, Season

ODS_PATH = os.path.join(os.path.dirname(__file__), "animelist.ods")

MOVIES_SHEET = "Movies"

TRASH_SHEET = "Trash"


def parse_series_row(row):
    name = str(row[0]).strip() if row else ""
    if not name:
        return None

    language = ""
    if len(row) >= 13:
        language = str(row[12]).strip()
    elif len(row) > 2:
        last_val = str(row[-1]).strip()
        if last_val and not last_val.startswith("S"):
            language = last_val

    season_end = 12 if len(row) >= 13 else len(row) - (1 if language else 0)
    seasons = []
    for i in range(1, season_end):
        val = str(row[i]).strip() if i < len(row) else ""
        if val and val != "`":
            seasons.append(val)

    return {
        "name": name,
        "seasons": seasons,
        "language": language,
        "extra_notes": "",
        "reason": "",
    }


def parse_trash_row(row):
    name = str(row[0]).strip() if row else ""
    if not name:
        return None

    seasons = []
    for i in range(1, 5):
        val = str(row[i]).strip() if i < len(row) else ""
        if val and val != "`":
            seasons.append(val)

    reason = str(row[5]).strip() if len(row) > 5 else ""
    language = str(row[7]).strip() if len(row) > 7 else ""

    return {
        "name": name,
        "seasons": seasons,
        "language": language,
        "extra_notes": "",
        "reason": reason,
    }


def parse_movies_row(row):
    name = str(row[0]).strip() if row else ""
    if not name:
        return None
    return {
        "name": name,
        "seasons": [],
        "language": "",
        "extra_notes": "",
        "reason": "",
    }


def fetch_thumbnail(name, retries=3):
    for attempt in range(retries):
        try:
            url = f"https://api.jikan.moe/v4/anime?q={urllib.parse.quote(name)}&limit=1&sfw=true"
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
                wait = 2 ** (attempt + 1)
                print(f"    Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"    HTTP error for '{name}': {e.code}")
            return "", None
        except Exception as e:
            print(f"    Failed for '{name}': {e}")
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return "", None
    return "", None


def fetch_thumbnails():
    anime_list = Anime.objects.filter(thumbnail_url="").order_by("id")
    total = anime_list.count()
    if total == 0:
        print("\nNo anime need thumbnails.")
        return

    print(f"\nFetching thumbnails for {total} anime...")

    for i, anime in enumerate(anime_list, 1):
        print(f"  [{i}/{total}] {anime.name}", end="", flush=True)
        thumb_url, mal_id = fetch_thumbnail(anime.name)
        if thumb_url:
            anime.thumbnail_url = thumb_url
            anime.mal_id = mal_id
            anime.save(update_fields=["thumbnail_url", "mal_id"])
            print(f" ✓")
        else:
            print(f" ✗")
        time.sleep(1.5)  # Respect Jikan rate limiting

    fetched = Anime.objects.exclude(thumbnail_url="").count()
    print(f"\nThumbnails fetched: {fetched}/{total} missing thumbnails")


def import_sheet(sheet_name, rows, order, limit=None):
    cat, created = Category.objects.get_or_create(
        name=sheet_name, defaults={"order": order}
    )
    if not created:
        print(f"  Category '{sheet_name}' already exists, skipping...")
        return 0

    header_rows = 3
    data_rows = rows[header_rows:]

    if sheet_name == MOVIES_SHEET:
        data_rows = rows[2:]

    count = 0
    for idx, row in enumerate(data_rows):
        if limit and count >= limit:
            break
        if not row or not str(row[0]).strip():
            continue

        if sheet_name == TRASH_SHEET:
            parsed = parse_trash_row(row)
        elif sheet_name == MOVIES_SHEET:
            parsed = parse_movies_row(row)
        else:
            parsed = parse_series_row(row)

        if not parsed:
            continue

        anime = Anime.objects.create(
            category=cat,
            name=parsed["name"],
            language=parsed["language"],
            reason=parsed["reason"],
            extra_notes=parsed["extra_notes"],
            order=count,
        )

        for s_idx, s_label in enumerate(parsed["seasons"]):
            Season.objects.create(
                anime=anime,
                label=s_label,
                order=s_idx,
            )

        count += 1
        print(f"    [{count}] {parsed['name']} ({len(parsed['seasons'])} seasons)")

    return count


def main():
    parser = argparse.ArgumentParser(
        description="Import animelist.ods into Django database"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Limit rows per sheet (for testing)"
    )
    parser.add_argument(
        "--clear", action="store_true", help="Clear all existing data before import"
    )
    parser.add_argument(
        "--thumbnails-only",
        action="store_true",
        help="Only fetch thumbnails for existing entries (skip data import)",
    )
    parser.add_argument(
        "--no-thumbnails",
        action="store_true",
        help="Only import data without fetching thumbnails",
    )
    args = parser.parse_args()

    if args.thumbnails_only:
        fetch_thumbnails()
        return

    if args.clear:
        print("Clearing existing data...")
        Season.objects.all().delete()
        Anime.objects.all().delete()
        Category.objects.all().delete()

    print(f"Reading {ODS_PATH}...")
    data = pyexcel_ods3.get_data(ODS_PATH)

    total = 0
    for order, (sheet_name, rows) in enumerate(data.items()):
        print(f"\n== {sheet_name} ({len(rows)} rows) ==")
        count = import_sheet(sheet_name, rows, order, limit=args.limit)
        total += count
        print(f"  Imported: {count}")

    print(f"\nDone! Total anime imported: {total}")

    if not args.no_thumbnails and total > 0:
        fetch_thumbnails()
    elif args.no_thumbnails:
        print(
            "\nSkipped thumbnail fetching. Run with --thumbnails-only later to fetch them."
        )


if __name__ == "__main__":
    main()
