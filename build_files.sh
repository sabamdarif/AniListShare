#!/bin/bash
# Vercel build script — install deps and collect static files
pip install --break-system-packages -r requirements.txt
python manage.py collectstatic --noinput

