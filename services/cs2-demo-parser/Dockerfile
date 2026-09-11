# CS2 demo parser worker (Railway service: cs2-demo-parser)
# Root directory: services/cs2-demo-parser
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production \
    TMPDIR=/tmp/parser

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root runtime: the worker only needs to read /app and write the temporary
# demo file it deletes right after parsing. UID is stable so a mounted volume
# keeps working across deployments.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin parser \
    && mkdir -p /tmp/parser \
    && chown -R 10001:10001 /app /tmp/parser \
    && chmod 700 /tmp/parser

USER 10001

# PARSER_REVISION must be provided by the deployment (git:<full-commit-sha>).
# There is no fallback: without it the process fails closed at startup.
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
