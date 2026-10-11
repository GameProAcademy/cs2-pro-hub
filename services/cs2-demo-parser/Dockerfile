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

# Runtime allowlist: never place reference CLI, tests, development scripts or
# documentation in the production image. Keep this list in sync with the
# production-import and image-isolation checks in the quality gate.
COPY adapter.py app.py capability_catalog.py demo_integrity.py errors.py forensic_audit.py h3e91_execution.py hot_payload.py parser.py parser_child.py parser_isolated.py raw_artifact.py raw_evidence.py runtime_evidence.py settings.py worker.py ./

# Immutable build identity. The commit the image was built from is written INTO
# the image, so /version can report what was compiled instead of repeating a
# variable someone typed. Railway supplies RAILWAY_GIT_COMMIT_SHA to the build;
# CI passes BUILD_COMMIT_SHA. Anything that is not a full commit id is recorded
# as unknown, never guessed.
ARG RAILWAY_GIT_COMMIT_SHA=""
ARG BUILD_COMMIT_SHA=""
RUN python -c "import json,re,sys; a,b=sys.argv[1:3]; s=b or a; ok=bool(re.fullmatch(r'[0-9a-f]{40}', s)); json.dump({'commit': s if ok else None, 'source': ('build-arg' if b else 'railway') if ok else None}, open('BUILD_INFO.json','w'))" "$RAILWAY_GIT_COMMIT_SHA" "$BUILD_COMMIT_SHA"

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
