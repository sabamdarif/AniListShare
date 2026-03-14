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
pip install -r requirements.txt
python manage.py migrate
```

### Database Configuration

By default, the app uses **SQLite** for local development. To use **PostgreSQL** (e.g., Prisma Postgres), set `DATABASE_URL` in your `.env` file:

```env
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
```

If `DATABASE_URL` is not set, the app falls back to a local `db.sqlite3` file.

## Google Login Setup

Follow these steps to enable **Sign in with Google**:

### 1. Create a Google OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services → Credentials**.
4. Click **Create Credentials → OAuth client ID**.
5. Select **Web application** as the application type.
6. Give it a name (e.g., `My Anime List`).

### 2. Add Authorized Redirect URIs

Under **Authorized redirect URIs**, add the callback URL for your app:

| Environment       | Redirect URI                                             |
| ----------------- | -------------------------------------------------------- |
| Local development | `http://127.0.0.1:8000/accounts/google/login/callback/`  |
| Local (localhost) | `http://localhost:8000/accounts/google/login/callback/`  |
| Production        | `https://yourdomain.com/accounts/google/login/callback/` |

> **⚠️ Important:** The redirect URI must match **exactly** — including the trailing slash. A mismatch will cause a `redirect_uri_mismatch` (Error 400).

Click **Save**.

### 3. Configure the `.env` File

Copy your **Client ID** and **Client Secret** from the credentials page and add them to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

You can use `.env.example` as a reference template.

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

| Flag        | Description                                   |
| ----------- | --------------------------------------------- |
| `--limit N` | Import only N entries per sheet (for testing) |
| `--clear`   | Delete all existing data before importing     |

## Admin Panel

```bash
python manage.py createsuperuser
```

Then visit http://localhost:8000/admin/ to manage data directly.

## Deploying to Vercel

### 1. Install the Vercel CLI

```bash
npm i -g vercel
```

### 2. Set Environment Variables on Vercel

In your Vercel project settings (**Settings → Environment Variables**), add:

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `DATABASE_URL`         | Your Postgres connection string |
| `DJANGO_SECRET_KEY`    | Generated Django secret key     |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID          |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret      |
| `DEBUG`                | Set to `False` for production   |

### 3. Add Your Vercel Domain to Google OAuth

In the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), add your Vercel domain as an authorized redirect URI:

```
https://your-app.vercel.app/accounts/google/login/callback/
```

### 4. Deploy

```bash
vercel deploy
```
