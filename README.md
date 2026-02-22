# My Anime List

A Django web app to manage your anime watchlist with a tabbed, spreadsheet-style interface.

## Features

- Tabbed categories imported from your ODS file
- Table view: thumbnail, name, seasons (with comments), language, stars (0–10)
- Anime search with MAL autocomplete & thumbnails (via Jikan API)
- Add, edit, delete, and reorder entries
- Add new categories on the fly

## Setup

```bash
pip install django pyexcel-ods3 requests
python manage.py migrate
```

## Importing Data from animelist.ods

**Step 1 — Test with a few entries first:**

```bash
python migrate_ods.py --limit 3
```

This imports only 3 entries per sheet so you can verify everything looks right.

**Step 2 — Open the site and check:**

```bash
python manage.py runserver
```

Go to http://localhost:8000/ and browse through the tabs.

**Step 3 — Full import when satisfied:**

```bash
python migrate_ods.py --clear
```

`--clear` wipes existing data and re-imports everything from the ODS file cleanly.

## Running the Server

```bash
python manage.py runserver
```

Open http://localhost:8000/

## Migration Script Flags

| Flag | Description |
|---|---|
| `--limit N` | Import only N entries per sheet (for testing) |
| `--clear` | Delete all existing data before importing |

## Admin Panel

```bash
python manage.py createsuperuser
```

Then visit http://localhost:8000/admin/ to manage data directly.
