# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AniListShare

A Django app for keeping an anime watchlist. A signed-in user groups titles into ordered categories, records seasons and episode progress, shares a list by link, copies someone else's list into their own, and imports or exports it as an ODS file. The site also serves its own Jikan v4 compatible anime metadata API backed by AniList, so the frontend never depends on a third party for metadata.

Python 3.14, managed by `uv`. No npm, no bundler, no build step: the frontend is plain IIFE scripts and per-component CSS served by Django.

### Hard requirements

These are not preferences. A change that breaks one of them is wrong even if it works:

- **`/api/v4/` is a Jikan v4 contract, not an internal API.** Paths carry no trailing slash, parameter names and accepted values follow Jikan, and response shapes and error bodies stay Jikan shaped, because callers outside this repo depend on that. Where AniList has no equivalent for a Jikan field, emit the key with `null` or an empty list rather than a plausible guess.
- **`/api/v4/` stays public and out of DRF.** Those views are plain Django deliberately: the configured anonymous DRF throttle allows 100 requests per day, which would take the homepage down. Do not add authentication or throttle classes to them.
- **An upstream failure degrades, it never becomes a 500.** A failing AniList call serves stale cache where one exists and otherwise returns a Jikan shaped error body, never a traceback.
- **Every `/api/v1/` queryset is scoped to `request.user`.** A category's identity in a URL is its `user_category_id` (per-user, 1-based), never the database primary key, and an id arriving in a request body is re-filtered by user before it is used.
- **Anime list writes go through the browser's SyncQueue** into `POST /api/v1/animes/bulk_sync/`. The per-anime endpoints still exist, but the table UI queues create, update and delete actions and replays them as one batch, which is what keeps optimistic state and temp ids consistent.

## How to Work Here

### Output style

No narration: don't explain what you're checking or why. No reasoning trace, no tool-call list. Work silently: speak only for a blocking question or a finding the user genuinely needs to know, in a 1-2 line status, e.g.:
`tasks 1-5 (engine) done, tasks 6-13 (commands, tests, frontend) remain.`

Never use an em dash (or `--` standing in for one) in a sentence, anywhere: replies, comments, commit messages, docs. A comma, a colon, parentheses or two sentences always say it.

### Before implementing a feature

For anything past a small fix, switch to plan mode before writing code. Research how this is typically solved, specifically the idiomatic way in this project's language, not just the generic pattern that shows up first. Once a candidate solution turns up, don't take it on faith: ask why it's actually the best fit, whether a better option exists, and what could go wrong with it given this project's specific constraints. Only start implementing once it survives that scrutiny.

### YAGNI

Default to the laziest solution that actually works, and write nothing that is not needed. This governs code, comments and commit messages alike.

Stop at the first rung that holds:

1. does this need to exist at all (skip speculative work);
2. does this repo already have a helper or pattern for it;
3. does the stdlib do it;
4. can it be one line;
5. only then, the minimum new code.

#### Third-party modules

Don't let this ladder tip into reinventing a wheel. Reach for a well-maintained third-party module over hand-rolling or stretching the stdlib when either holds:

- the stdlib can technically do it, but not performantly enough for what this needs;
- doing it yourself would take enough work that you'd effectively end up building your own version of the module.

Only pick a module that is actively maintained and reasonably current. An abandoned or stale package is worse than writing the code yourself, no matter how much it would save today. Check current documentation (for example via Context7 MCP, or the module's own docs) for its real current API before writing against it, rather than trusting memory.

No unrequested abstractions: no interface for one implementation, no config option for a value that never changes, no scaffolding "for later". Write it when there is a reason to, not because the shape of the file suggests it.

If it takes a paragraph to justify, do not do it. A workaround that needs a long explanation to look acceptable is the wrong workaround, so fix the code instead. The length of the justification is the signal.

Never skimp on: input validation at trust boundaries, error handling that prevents data loss, security, or anything explicitly requested. Being lazy is about not adding; it is never about dropping a check.

#### Comments

Before writing a comment, check it against all four:

- A comment exists to save the next contributor time, so keep it short and plain.
- Does the code already say this? -> don't write it.
- Am I describing a change I just made? -> that belongs in the commit, not here.
- Would a future reader (human or agent) get this wrong without a note? -> only if yes, write it.

One line, two at most, atop the function or class. Never inline. A comment that fails this check gets deleted, not kept "just in case."

#### Commit messages

Before writing a body, check it against all three:

- Does the subject line alone already say it? -> stop, no body.
- Am I about to list the diff bullet-by-bullet? -> stop, that's not a body.
- Am I recapping reasoning that already lives in a comment or this file? -> cut it.

Only write a body if the subject truly can't carry the why. More than 5 lines means the commit is too big or the message is padded: split the commit, don't pad the message.

Commits follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, e.g. `fix(auth): ...`, `feat(export): ...`, `test(e2e): ...`. Pick the type from what the commit does (`fix`, `feat`, `test`, `refactor`, `docs`, `chore`) and the scope from the subsystem touched. A bare `scope: subject` with no type is not acceptable.

#### Enforced, not just requested

Two rules above are checked by tooling, not left to compliance:

- em dash: `./check-before-commit.sh` greps the staged diff for an em dash or a `--` used as a dash, and fails before running anything else.
- commit body length: `.githooks/commit-msg` rejects a body over 5 lines. It is live because this repo sets `core.hooksPath` to `.githooks`, so a fresh clone needs `git config core.hooksPath .githooks` once.

Comments can't be enforced this cheaply, a heuristic can't tell a needed invariant from clutter, so that one stays on the checklist above.

#### This file

Same rules apply here too, and it is loaded into every request, so a line that does not change what an agent does is pure cost. Record the invariant, not the bug that taught it: why one commit did what it did belongs in that commit, and why a line is the way it is belongs on the line.

### On long sessions

This file doesn't decay with turn count, and it doesn't come out of a compaction any weaker than it went in. If anything you recall from earlier in this session conflicts with what's written here, this file wins, not your summary of your own past behavior. Before writing a comment, a commit message, or picking a solution, re-check against the rule itself, not against what you remember doing a few turns ago.

### Coding rules

- Don't write monolithic code; the codebase should be modular and structured, but don't just start making everything modular. Codebases are made modular so it's easy to maintain and find any relevant section fast. It's not to make a giant mess of thousands of files that utterly confuses the devs.
- Be careful with unrequested destructive actions (deletions, force-pushes, overwrites).
- Keep comments in sync with the code they sit on; a stale comment is worse than none.
- When referencing anything in comments or commits, make sure the thing you are referencing is valid in a way other users/contributors seeing it on their own system can understand and access: don't reference anything that only exists on your system or is only accessible to you.
- License header on every file: an SPDX line, a copyright line, then a short module docstring, a handful of lines stating what the file owns and any real invariant. Never a paragraph. If a file's own doc keeps growing past that, the excess belongs as a note at the specific lines it concerns, not stacked into the header.
- Fix a wrong header whenever you are in the file, even where your change did not touch what it got wrong. Reading enough of a file to change it is the only thing that catches a header that has drifted, so a stale line found there is repaired there, not left for a commit that happens to need it.
- Tests: focused, not slop. Skip smoke/regression tests that only confirm a deletion.
- Indentation always follows `.editorconfig`.

### Build, test, lint

```bash
uv sync                                            # install/refresh .venv from uv.lock
uv run python manage.py migrate                    # apply migrations (SQLite locally)
uv run python manage.py runserver                  # dev server
uv run pytest                                      # whole suite, about two seconds
uv run pytest animeapi/tests/test_params.py        # one file
uv run pytest animeapi/tests/test_params.py::test_parse_int_rejects_non_integers   # one test
uv run pytest -k search                            # by keyword
uv run python manage.py check                      # Django system check
./check-before-commit.sh                           # dash gate, then check, then pytest
uv run --group dev scripts/build_nerd_icons.py     # regenerate the icon subset and its CSS
```

`check-before-commit.sh` covers the dash rule, `manage.py check` and the full suite. It does not run a linter or a type checker, and neither is configured here: there is no ruff config in the repo, and `pyrightconfig.json` reports a handful of pre-existing type errors, so neither is a gate. Both tools are worth running by hand when you touch a file they flag.

Tests run under `AniListShare.settings_test`, which pins the environment to in-memory SQLite and a throwaway secret key before Django loads. It exists because pytest-django calls `django.setup()` before any `conftest.py` is imported, so a test cannot set these itself. The suite lives in `animeapi/tests/`; `api/tests/` is already listed in `testpaths` but holds no test file yet.

## What Is Already Documented

`README.md` is a single line, so there is no user-facing reference to keep in sync yet. `.env.example` is the configuration reference: it documents every variable `AniListShare/settings.py` reads, including the Google OAuth pair, the Gmail SMTP credentials, the Neon `DATABASE_URL`, the `ANILIST_*` overrides and `CACHE_URL`. The module docstrings in `animeapi/` are the design record for the Jikan compatibility decisions, and are worth reading before changing any response shape.

Two things belong only here. There is no LICENSE file at the repo root, so the SPDX line in the Coding rules has no canonical value yet (`jikan/LICENSE` is the upstream PHP library's). And `jikan/` is an untracked copy of the real Jikan PHP source, kept as the reference for the v4 contract: nothing builds it, no PHP toolchain is installed, and it is not part of the app.

## Architecture

```
browser (templates + core/static/core/js)
  -> /api/v1/   DRF + JWT       -> core.models -> SQLite (dev) | Neon Postgres (prod)
  -> /api/v4/   plain Django    -> animeapi    -> AniList GraphQL -> Django cache -> Vercel edge cache
```

`core.models` is the only data layer, and `animeapi` never imports `core`: the public metadata API does not read the database at all. The two APIs share no code, only the templates that call them.

### Entry point and dispatch

- `AniListShare/settings.py` - every environment-driven setting. Notable: the `ANIME_API_CACHE_TTLS` table that `animeapi/caching.py` reads, the DRF throttle rates, the SimpleJWT lifetimes, and the fall back to SQLite whenever DEBUG.
- `AniListShare/settings_test.py` - pins the environment before Django setup, as described above.
- `AniListShare/urls.py` - mounts the four URL groups. Admin, django-browser-reload and django-silk are routed only under DEBUG, so `/admin/` does not exist in production.
- `core/models.py` - `Category`, `Anime`, `Season`, `ShareLink`. Owns the `user_category_id` contract and per-category ordering.
- `core/views.py` - the HTML pages. `shared_list_view` resolves a share token and passes `owner_name`; the page's data arrives by JS from the share API rather than in the context.
- `api/views.py` - all `/api/v1/` behaviour, including the category and anime reorder endpoints and `bulk_sync`.
- `api/serializers.py` - the validation rules: star rating bounds, watched count against total episodes, ownership checks on nested writes.
- `animeapi/views.py` - the `/api/v4/` endpoints and the decorator that applies Jikan's envelope and cache headers.
- `animeapi/params.py` - Jikan query parameters to AniList variables. Pure, and unit tested.
- `animeapi/queries.py` - the GraphQL documents, one per endpoint.
- `animeapi/mappers.py` - AniList payloads to Jikan response shapes. Pure and unit tested, and the only place a response shape is decided.
- `animeapi/anilist.py` - the GraphQL transport: timeouts, retries, and the error types the views branch on.
- `animeapi/caching.py` - read-through cache keyed per endpoint, with stale-on-error.
- `accounts/` - thin pages around allauth, which supplies login, Google OAuth, MFA and email verification. Templates here override allauth's defaults.
- `accounts/views.py` - the account settings and deletion pages, plus the endpoint that exchanges a Django session for a JWT pair.
- `core/static/core/js/jwt_auth.js` - `window.apiFetch`, the single entry point for authenticated calls: attaches the bearer token, refreshes once on a 401, and toasts DRF error bodies.
- `core/static/core/js/sync_queue.js` - the batched, localStorage-persisted write path for anime edits.

### Common tasks

**Adding a `/api/v4/` endpoint.** In order: route in `animeapi/urls.py`; handler in `animeapi/views.py` using the existing decorator and cache helper; parameter translation in `params.py`; a GraphQL document in `queries.py`; the response shape in `mappers.py`; a TTL entry in `ANIME_API_CACHE_TTLS` in `settings.py`; tests in `animeapi/tests/`.

**Adding an `/api/v1/` endpoint.** Route in `api/urls.py`, view in `api/views.py` with the queryset filtered by `request.user`, validation in `api/serializers.py`.

**Adding frontend behaviour.** A new IIFE in `core/static/core/js/`, a `<script defer>` tag in the template that needs it, and a matching file in `core/static/core/css/`. Follow the existing pattern: one IIFE per file, exports hung on `window`, no imports.

**Adding a Nerd Font icon.** Use the `nf-*` class in a template or JS, then run the icon script so the subsetted font and its CSS pick up the new glyph. A class that is used but not built renders as a blank box.
