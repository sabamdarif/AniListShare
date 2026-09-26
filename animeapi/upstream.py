"""Source-agnostic exception bases for the metadata providers.

The caching and view layers branch on these so an AniList failure and a TMDb
failure degrade the same way. Each provider subclasses them in its own module.
"""

from __future__ import annotations


class UpstreamError(RuntimeError):
    """A metadata provider could not be reached or answered with an error."""


class UpstreamNotFound(UpstreamError):
    """A metadata provider reported that the requested resource does not exist."""
