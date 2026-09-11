"""GATE 1E.1 — download failures are transport failures, never bad demos."""

import httpx
import pytest
from conftest import auth, make_settings, parse_body

import app as app_module
import errors as E


class _FakeStream:
    def __init__(self, status_code: int, chunks=(), raise_exc=None):
        self.status_code = status_code
        self._chunks = chunks
        self._raise = raise_exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def aiter_bytes(self):
        if self._raise is not None:
            raise self._raise
        for chunk in self._chunks:
            yield chunk


class _FakeClient:
    def __init__(self, stream_factory):
        self._stream_factory = stream_factory

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    def stream(self, _method, _url):
        return self._stream_factory()


@pytest.fixture()
def with_transport(monkeypatch):
    def apply(stream_factory):
        monkeypatch.setattr(
            app_module.httpx,
            "AsyncClient",
            lambda **_kwargs: _FakeClient(stream_factory),
        )

    return apply


def code(response) -> str:
    return response.json()["detail"]["error_code"]


def _post(client):
    return client.post("/v1/parse", json=parse_body(), headers=auth())


def test_storage_4xx_is_download_error(client_factory, with_transport):
    with_transport(lambda: _FakeStream(403))
    response = _post(client_factory())
    assert response.status_code == 502
    assert code(response) == E.DOWNLOAD_ERROR


def test_expired_signed_url_302_is_download_error(client_factory, with_transport):
    with_transport(lambda: _FakeStream(302))
    assert code(_post(client_factory())) == E.DOWNLOAD_ERROR


def test_storage_5xx_is_download_failed(client_factory, with_transport):
    with_transport(lambda: _FakeStream(503))
    response = _post(client_factory())
    assert response.status_code == 503
    assert code(response) == E.DOWNLOAD_FAILED


def test_download_timeout_is_download_timeout(client_factory, with_transport):
    with_transport(lambda: _FakeStream(200, raise_exc=httpx.ReadTimeout("slow")))
    response = _post(client_factory())
    assert response.status_code == 504
    assert code(response) == E.DOWNLOAD_TIMEOUT


def test_aborted_connection_is_download_error(client_factory, with_transport):
    with_transport(lambda: _FakeStream(200, raise_exc=httpx.ReadError("reset")))
    response = _post(client_factory())
    assert response.status_code == 502
    assert code(response) == E.DOWNLOAD_ERROR


def test_more_bytes_than_declared_is_file_size_mismatch(client_factory, with_transport):
    with_transport(lambda: _FakeStream(200, chunks=[b"x" * 4096]))
    response = _post(client_factory())
    assert response.status_code == 422
    assert code(response) == E.FILE_SIZE_MISMATCH


def test_bytes_above_ceiling_is_demo_too_large(client_factory, with_transport):
    with_transport(lambda: _FakeStream(200, chunks=[b"x" * 64, b"x" * 64]))
    client = client_factory(settings=make_settings(max_demo_bytes=100))
    response = client.post("/v1/parse", json=parse_body(file_size=99), headers=auth())
    assert response.status_code == 413
    assert code(response) == E.DEMO_TOO_LARGE


def test_download_never_reports_invalid_demo_format(client_factory, with_transport):
    for stream in (
        lambda: _FakeStream(404),
        lambda: _FakeStream(500),
        lambda: _FakeStream(200, raise_exc=httpx.ConnectError("dns")),
    ):
        with_transport(stream)
        assert code(_post(client_factory())) != E.INVALID_DEMO_FORMAT
