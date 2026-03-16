#!/bin/bash

/usr/local/bin/uv venv /vercel/path0/.vercel/python/.venv --python 3.12

/usr/local/bin/uv pip install -r requirements.txt --python /vercel/path0/.vercel/python/.venv/bin/python

source /vercel/path0/.vercel/python/.venv/bin/activate

python manage.py createcachetable --database default 2>/dev/null || true
python manage.py migrate --noinput
python manage.py collectstatic --noinput
