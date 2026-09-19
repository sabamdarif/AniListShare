#!/usr/bin/env bash
# Pre-commit gate: rejects an em dash (or "--" used as a dash) in the staged
# diff, then runs Django's system check and the test suite. Run from anywhere.
set -euo pipefail

cd "$(dirname "$0")"

# Built from an escape so this file stays free of the character it bans.
em_dash=$(printf '\u2014')
if [ -z "$em_dash" ]; then
    echo "check-before-commit: could not build the em dash pattern" >&2
    exit 1
fi

added=$(git diff --cached -U0 --no-color | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)

if [ -z "$added" ]; then
    echo "==> no staged additions, skipping the dash check"
else
    echo "==> em dash and '--' as dash in staged additions"
    if printf '%s\n' "$added" | grep -nF -e "$em_dash"; then
        echo "FAIL: em dash above. Use a comma, a colon, parentheses or two sentences." >&2
        exit 1
    fi
    if printf '%s\n' "$added" | grep -nE '[[:alnum:]] -- [[:alnum:]]'; then
        echo "FAIL: '--' used as a dash above." >&2
        exit 1
    fi
fi

echo "==> django system check"
uv run python manage.py check

echo "==> pytest"
uv run pytest -q
