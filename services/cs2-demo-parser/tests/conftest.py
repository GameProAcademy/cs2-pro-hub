import hashlib
import os
from typing import Any

import pytest

# Never let importing the module boot a real, config-dependent app instance.
os.environ["PARSER_SKIP_BOOTSTRAP"] = "1"

import app as app_module  # noqa: E402
from settings import Settings  # noqa: E402

TOKEN = "test-token-value"
DEMO_BYTES = b"PBDEMS2" + b"\x00" * 512
DEMO_SHA = hashlib.sha256(DEMO_BYTES).hexdigest()


def make_settings(**overrides: Any) -> Settings:
    base = dict(
        token=TOKEN,
        revision="git:" + "a" * 40,
        contract_version=1,
        environment="production",
        max_demo_bytes=1024 * 1024,
        max_payload_bytes=1024 * 1024,
        download_timeout_seconds=5.0,
        parse_timeout_seconds=5.0,
        bridge_url=None,
        bridge_secret=None,
        worker_id="test-worker",
        queue_poll_seconds=0.01,
        queue_heartbeat_seconds=0.05,
        backend_url=None,
        backend_service_key=None,
    )
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def empty_parse(_path: str) -> dict[str, Any]:
    return {
        "header": {
            "map": None,
            "game_version": None,
            "tickrate": None,
            "duration_seconds": None,
            "match_date": None,
            "score": {},
            "teams": {},
        },
        "players": [],
        "rounds": [],
        "events": [],
        "warnings": [],
    }


@pytest.fixture()
def client_factory():
    from fastapi.testclient import TestClient

    def build(parse_fn=empty_parse, settings=None, download=None):
        if download is not None:
            app_module._download = download  # type: ignore[assignment]
        application = app_module.create_app(settings or make_settings(), parse_fn)
        return TestClient(application, raise_server_exceptions=False)

    original_download = app_module._download
    yield build
    app_module._download = original_download  # type: ignore[assignment]


@pytest.fixture()
def ok_download(tmp_path):
    async def _download(_url, _size, _settings):
        path = tmp_path / "demo.dem"
        path.write_bytes(DEMO_BYTES)
        return str(path), DEMO_SHA, len(DEMO_BYTES)

    return _download


def parse_body(**overrides: Any) -> dict[str, Any]:
    body = {
        "contract_version": 1,
        "upload_id": "11111111-1111-1111-1111-111111111111",
        "demo_url": "https://storage.example.com/demo.dem?token=redacted",
        "demo_sha256": DEMO_SHA,
        "file_size": len(DEMO_BYTES),
    }
    body.update(overrides)
    return body


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
