"""Typo tolerant name matching for the anime search endpoint.

Pure on purpose: the caller decides which names to pass in, so the ranking
rules can be pinned by tests. Names reach the database from users, AniList and
spreadsheets, so case, accents and punctuation are normalized away before
anything is compared, and a difflib pass catches the misspellings a substring
match cannot.
"""

import unicodedata
from difflib import SequenceMatcher

# Mean per token ratio below which a difflib match is noise rather than a typo.
FUZZY_CUTOFF = 0.7

# Upper bound on names scored in Python, so a huge library cannot stall a request.
SCAN_LIMIT = 2000

# Literal tiers sit above 1.0, so every fuzzy match ranks below every literal one.
PREFIX_SCORE = 4.0
SUBSTRING_SCORE = 3.0
TOKEN_SCORE = 2.0


def normalize(text):
    """Casefold, drop accents, and collapse everything non-alphanumeric to single spaces."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    flattened = "".join(
        c if c.isalnum() else " " for c in without_accents.casefold()
    )
    return " ".join(flattened.split())


def tokens(text):
    return normalize(text).split()


def _fuzzy_ratio(query_tokens, name_tokens):
    """Mean of each query token's best difflib ratio against any name token."""
    matcher = SequenceMatcher(None)
    total = 0.0
    for query_token in query_tokens:
        best = 0.0
        matcher.set_seq1(query_token)
        for name_token in name_tokens:
            matcher.set_seq2(name_token)
            if matcher.real_quick_ratio() <= best or matcher.quick_ratio() <= best:
                continue
            ratio = matcher.ratio()
            if ratio > best:
                best = ratio
        total += best
    return total / len(query_tokens)


def score(name, query):
    """Rank one name against a query. 0.0 means no match at all."""
    name_norm = normalize(name)
    query_norm = normalize(query)
    if not name_norm or not query_norm:
        return 0.0

    if name_norm.startswith(query_norm):
        return PREFIX_SCORE
    if query_norm in name_norm:
        return SUBSTRING_SCORE

    name_tokens = name_norm.split()
    query_tokens = query_norm.split()
    if all(any(n.startswith(q) for n in name_tokens) for q in query_tokens):
        return TOKEN_SCORE

    ratio = _fuzzy_ratio(query_tokens, name_tokens)
    return ratio if ratio >= FUZZY_CUTOFF else 0.0


def rank(candidates, query, limit):
    """Pick the best ``limit`` keys from ``(key, name)`` pairs, best match first."""
    if not normalize(query) or limit <= 0:
        return []

    scored = []
    for key, name in candidates:
        value = score(name, query)
        if value:
            scored.append((-value, normalize(name), key))

    scored.sort()
    return [key for _, _, key in scored[:limit]]
