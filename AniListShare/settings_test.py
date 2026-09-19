"""Settings used by the test suite.

pytest-django calls django.setup() while loading its plugin — before any
conftest.py is imported — so the environment has to be pinned here, at import
time of the settings module itself. This gives the tests a known SECRET_KEY
(JWT signing needs one, and CI has no .env), SQLite instead of whatever
DATABASE_URL a developer has locally, and no HTTPS redirect. load_dotenv() in
settings.py does not override variables that already exist, so these win.
"""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-insecure-key")
os.environ["DATABASE_URL"] = ""
os.environ["DEBUG_MODE"] = "false"
os.environ["SECURE_SSL_REDIRECT"] = "false"

from .settings import *  # noqa: E402,F403

# Never touch the checked-out db.sqlite3, even if the fallback above changes.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}


# django.test.Client talks to "testserver". Without this, a developer whose
# .env pins ALLOWED_HOSTS to their real domain gets a 400 from every client
# request, while CI (no .env) would pass — the worst possible split.
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
