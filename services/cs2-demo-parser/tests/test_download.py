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


# ---- a partial demo is never left on disk ----------------------------------
import asyncio  # noqa: E402
import glob  # noqa: E402
import os  # noqa: E402


def _leftovers(directory) -> list[str]:
    root = str(directory)
    legacy = glob.glob(os.path.join(root, "demo-*.dem"))
    isolated = glob.glob(os.path.join(root, "**", "demo.dem"), recursive=True)
    return sorted(os.path.basename(path) for path in [*legacy, *isolated])


class _HangingStream(_FakeStream):
    def __init__(self, reached: asyncio.Event):
        super().__init__(200)
        self._reached = reached

    async def aiter_bytes(self):
        yield b"x" * 64
        self._reached.set()
        await asyncio.sleep(3600)


def test_a_cancelled_download_leaves_no_partial_demo(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))

    async def scenario():
        reached = asyncio.Event()
        monkeypatch.setattr(app_module.httpx, "AsyncClient",
                            lambda **_kwargs: _FakeClient(lambda: _HangingStream(reached)))
        task = asyncio.ensure_future(
            app_module._download("https://synthetic.invalid/demo.dem", 4096, make_settings()))
        await reached.wait()
        assert len(_leftovers(tmp_path)) == 1  # the partial file exists while downloading
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())
    assert _leftovers(tmp_path) == []


@pytest.mark.parametrize("failure", [
    RuntimeError("unexpected transport state"), KeyError("x"), MemoryError(),
    httpx.ReadError("reset"), httpx.ReadTimeout("slow"), OSError("disk"),
])
def test_any_failed_download_leaves_no_partial_demo(monkeypatch, tmp_path, failure):
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(app_module.httpx, "AsyncClient",
                        lambda **_kwargs: _FakeClient(lambda: _FakeStream(200, raise_exc=failure)))
    with pytest.raises(BaseException):  # noqa: B017 - the type is asserted elsewhere; here only the file matters
        asyncio.run(app_module._download("https://synthetic.invalid/demo.dem", 4096, make_settings()))
    assert _leftovers(tmp_path) == []


def test_a_successful_download_hands_exactly_one_file_to_the_caller(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(app_module.httpx, "AsyncClient",
                        lambda **_kwargs: _FakeClient(lambda: _FakeStream(200, chunks=(b"ab", b"cd"))))
    path, _digest, size = asyncio.run(
        app_module._download("https://synthetic.invalid/demo.dem", 4, make_settings()))
    assert size == 4 and _leftovers(tmp_path) == [os.path.basename(path)]
    with open(path, "rb") as handle:
        assert handle.read() == b"abcd"

@pytest.mark.parametrize("sidecar", ["parser-result-test.json", "parser-result-test.json.tmp"])
def test_cleanup_removes_demo_and_owned_temp_directory_even_with_sidecars(tmp_path, sidecar):
    parent = tmp_path / "cs2-demo-test_123"
    parent.mkdir()
    demo = parent / "demo.dem"
    demo.write_bytes(b"synthetic demo")
    (parent / sidecar).write_text("temporary parser output")

    app_module._cleanup(str(demo))

    assert not demo.exists()
    assert not parent.exists()


def test_cleanup_does_not_recursively_remove_unowned_directory(tmp_path):
    parent = tmp_path / "not-worker-owned"
    parent.mkdir()
    demo = parent / "demo.dem"
    demo.write_bytes(b"synthetic demo")
    unrelated = parent / "keep.txt"
    unrelated.write_text("keep")

    app_module._cleanup(str(demo))

    assert not demo.exists()
    assert unrelated.read_text() == "keep"
    assert parent.exists()

def test_parse_lifecycle_removes_exact_temp_dir_when_file_cleanup_is_incomplete(monkeypatch, tmp_path):
    import hashlib

    payload = app_module.CS2_DEMO_MAGIC + b"\\x00" * 512
    digest = hashlib.sha256(payload).hexdigest()
    temp_dir = tmp_path / "cs2-demo-lifecycle123"
    temp_dir.mkdir()
    demo = temp_dir / "demo.dem"
    demo.write_bytes(payload)
    (temp_dir / "parser-result-test.json").write_text("temporary sidecar")
    cleanup_dirs = []

    async def fake_download(_url, _size, _settings, *, cleanup_dirs=None):
        if cleanup_dirs is not None:
            cleanup_dirs.append(str(temp_dir))
        return str(demo), digest, len(payload)

    monkeypatch.setattr(app_module, "_download", fake_download)
    # Simulate file-level cleanup failing to remove the directory or sidecars.
    monkeypatch.setattr(app_module, "_cleanup", lambda _path: None)
    body = app_module.ParseRequest(**parse_body(file_size=len(payload), demo_sha256=digest))

    asyncio.run(
        app_module._parse_downloaded(
            body,
            make_settings(),
            lambda _path: {"header": {}, "players": [], "rounds": [], "events": [], "warnings": []},
            finalize_raw=False,
            cleanup_dirs=cleanup_dirs,
        )
    )

    assert cleanup_dirs == [str(temp_dir)]
    assert not temp_dir.exists()

def test_parse_request_cleans_registered_directory_if_download_handoff_is_cancelled(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.tempfile, "tempdir", str(tmp_path))
    temp_dir = tmp_path / "cs2-demo-cancel123"
    demo = temp_dir / "demo.dem"

    async def cancelled_download(_url, _size, _settings, *, cleanup_dirs=None):
        temp_dir.mkdir()
        demo.write_bytes(b"partial test fixture")
        if cleanup_dirs is not None:
            cleanup_dirs.append(str(temp_dir))
        # Model cancellation after the directory exists but before the caller
        # receives the downloaded path.
        raise asyncio.CancelledError()

    monkeypatch.setattr(app_module, "_download", cancelled_download)
    body = app_module.ParseRequest(**parse_body())

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(app_module._parse_request(body, make_settings(), lambda _path: {}))

    assert not temp_dir.exists()
