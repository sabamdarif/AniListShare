"""
Supabase client utility.

Provides a lazily-initialised Supabase client using ``SUPABASE_URL`` and
``SUPABASE_SERVICE_ROLE_KEY`` from environment variables (loaded via
``django.conf.settings``).

Usage::

    from myanimelist.supabase_client import get_supabase_client

    client = get_supabase_client()
    if client:
        # Use client.storage, client.table(), etc.
        ...
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_client = None
_initialised = False


def get_supabase_client():
    """Return a Supabase client instance, or ``None`` if credentials are missing.

    The client is created once and cached for the lifetime of the process.
    """
    global _client, _initialised  # noqa: PLW0603

    if _initialised:
        return _client

    _initialised = True

    url = getattr(settings, "SUPABASE_URL", "") or ""
    key = getattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "") or ""

    if not url or not key:
        logger.warning(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — "
            "Supabase client will not be available."
        )
        return None

    try:
        from supabase import create_client  # type: ignore[import-untyped]

        _client = create_client(url, key)
        logger.info("Supabase client initialised successfully.")
    except ImportError:
        logger.error(
            "The 'supabase' package is not installed. Run: pip install supabase"
        )
    except Exception:
        logger.exception("Failed to initialise Supabase client.")

    return _client
