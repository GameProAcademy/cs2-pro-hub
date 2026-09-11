# CS2 demo parser worker (Railway service: cs2-demo-parser)
# Root directory: services/cs2-demo-parser
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# PARSER_REVISION must be provided by the deployment (git:<full-commit-sha>).
# There is no fallback: without it the process fails closed at startup.
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
