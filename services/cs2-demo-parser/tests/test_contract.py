"""GATE 1E.1 — auth, contract, integrity, parser and envelope guarantees."""

from conftest import DEMO_SHA, auth, empty_parse, make_settings, parse_body

import errors as E
from errors import CorruptedDemoError, InvalidDemoError, UnsupportedDemoError


def code(response) -> str:
    return response.json()["detail"]["error_code"]


# --- AUTH -----------------------------------------------------------------


def test_missing_authorization_is_unauthorized(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body())
    assert response.status_code == 401
    assert code(response) == E.UNAUTHORIZED


def test_wrong_token_is_unauthorized(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post(
        "/v1/parse", json=parse_body(), headers={"Authorization": "Bearer nope"}
    )
    assert response.status_code == 401
    assert code(response) == E.UNAUTHORIZED


def test_non_bearer_scheme_is_unauthorized(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers={"Authorization": "Basic x"})
    assert response.status_code == 401


def test_correct_token_passes(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["contract_version"] == 1


# --- CONTRACT -------------------------------------------------------------


def test_contract_mismatch_is_409(client_factory, ok_download):
    settings = make_settings(contract_version=1)
    client = client_factory(download=ok_download, settings=settings)
    # A supported-but-different version would be CONTRACT_MISMATCH; an unknown
    # version is UNSUPPORTED_CONTRACT_VERSION. Both are 409 and deterministic.
    response = client.post("/v1/parse", json=parse_body(contract_version=7), headers=auth())
    assert response.status_code == 409
    assert code(response) == E.UNSUPPORTED_CONTRACT_VERSION


def test_malformed_body_is_contract_mismatch(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json={"contract_version": 1}, headers=auth())
    assert response.status_code == 409
    assert code(response) == E.CONTRACT_MISMATCH


def test_non_https_url_is_contract_mismatch(client_factory):
    client = client_factory()
    response = client.post(
        "/v1/parse", json=parse_body(demo_url="http://storage.example.com/d.dem"), headers=auth()
    )
    assert response.status_code == 409
    assert code(response) == E.CONTRACT_MISMATCH


def test_oversized_declared_demo_is_413(client_factory):
    client = client_factory(settings=make_settings(max_demo_bytes=100))
    response = client.post("/v1/parse", json=parse_body(file_size=1000), headers=auth())
    assert response.status_code == 413
    assert code(response) == E.DEMO_TOO_LARGE


# --- INTEGRITY ------------------------------------------------------------


def test_hash_mismatch_is_422_hash_mismatch(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body(demo_sha256="b" * 64), headers=auth())
    assert response.status_code == 422
    assert code(response) == E.HASH_MISMATCH
    assert code(response) != E.INVALID_DEMO_FORMAT


def test_file_size_mismatch_is_422_file_size_mismatch(client_factory, tmp_path):
    async def download(_url, _size, _settings):
        path = tmp_path / "short.dem"
        path.write_bytes(b"x" * 10)
        return str(path), DEMO_SHA, 10

    client = client_factory(download=download)
    response = client.post("/v1/parse", json=parse_body(file_size=999), headers=auth())
    assert response.status_code == 422
    assert code(response) == E.FILE_SIZE_MISMATCH


def test_non_hex_sha_is_contract_mismatch(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body(demo_sha256="z" * 64), headers=auth())
    assert response.status_code == 409
    assert code(response) == E.CONTRACT_MISMATCH


def test_wrong_magic_is_invalid_demo_before_parser(client_factory, tmp_path):
    called = False

    async def download(_url, _size, _settings):
        import hashlib

        path = tmp_path / "not-cs2.dem"
        content = b"NOTDEMO!" + b"x" * 512
        path.write_bytes(content)
        return str(path), hashlib.sha256(content).hexdigest(), len(content)

    def parse(_path):
        nonlocal called
        called = True
        return empty_parse(_path)

    import hashlib

    content = b"NOTDEMO!" + b"x" * 512
    client = client_factory(parse_fn=parse, download=download)
    response = client.post(
        "/v1/parse",
        json=parse_body(file_size=len(content), demo_sha256=hashlib.sha256(content).hexdigest()),
        headers=auth(),
    )
    assert response.status_code == 422
    assert code(response) == E.INVALID_DEMO_FORMAT
    assert called is False


# --- PARSER ---------------------------------------------------------------


def _raise(exc):
    def _fn(_path):
        raise exc

    return _fn


def test_invalid_demo_is_invalid_demo_format(client_factory, ok_download):
    client = client_factory(parse_fn=_raise(InvalidDemoError("bad magic")), download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code == 422
    assert code(response) == E.INVALID_DEMO_FORMAT


def test_corrupted_demo_is_corrupted_demo(client_factory, ok_download):
    client = client_factory(parse_fn=_raise(CorruptedDemoError("truncated")), download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert code(response) == E.CORRUPTED_DEMO


def test_unsupported_demo_is_unsupported_demo(client_factory, ok_download):
    client = client_factory(parse_fn=_raise(UnsupportedDemoError("csgo demo")), download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert code(response) == E.UNSUPPORTED_DEMO


def test_unexpected_exception_is_parser_error_not_invalid_demo(client_factory, ok_download):
    client = client_factory(parse_fn=_raise(KeyError("internal bug")), download=ok_download)
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code == 500
    assert code(response) == E.PARSER_ERROR


def test_parse_timeout_is_504_parse_timeout(client_factory, ok_download):
    import time

    def slow(_path):
        time.sleep(1.0)
        return empty_parse(_path)

    client = client_factory(
        parse_fn=slow, download=ok_download, settings=make_settings(parse_timeout_seconds=0.05)
    )
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code == 504
    assert code(response) == E.PARSE_TIMEOUT


def test_oversized_payload_is_413(client_factory, ok_download):
    def big(_path):
        payload = empty_parse(_path)
        payload["events"] = [{"type": "player_death", "data": {"x": "y" * 200}} for _ in range(200)]
        return payload

    client = client_factory(
        parse_fn=big, download=ok_download, settings=make_settings(max_payload_bytes=1024)
    )
    response = client.post("/v1/parse", json=parse_body(), headers=auth())
    assert response.status_code == 413
    assert code(response) == E.PAYLOAD_TOO_LARGE


# --- RESPONSE / SECURITY --------------------------------------------------


def test_success_response_shape_has_no_invented_data(client_factory, ok_download):
    client = client_factory(download=ok_download)
    payload = client.post("/v1/parse", json=parse_body(), headers=auth()).json()
    assert payload["parser"]["name"] == "demoparser2"
    assert payload["parser"]["version"] == "0.42.0"
    assert payload["parser"]["revision"].startswith("git:")
    for key in ("map", "game_version", "tickrate", "duration_seconds", "match_date"):
        assert payload["header"][key] is None
    assert payload["header"]["score"] == {}
    assert payload["header"]["teams"] == {}
    assert payload["players"] == [] and payload["rounds"] == [] and payload["events"] == []


def test_error_responses_never_leak_secrets(client_factory, ok_download):
    from conftest import TOKEN

    client = client_factory(parse_fn=_raise(RuntimeError("/tmp/demo-x.dem exploded")), download=ok_download)
    body = client.post("/v1/parse", json=parse_body(), headers=auth()).text
    assert TOKEN not in body
    assert DEMO_SHA not in body
    assert "storage.example.com" not in body
    assert "/tmp/" not in body
    assert "Traceback" not in body


def test_every_error_uses_the_same_envelope(client_factory, ok_download):
    client = client_factory(download=ok_download)
    response = client.post("/v1/parse", json=parse_body(demo_sha256="c" * 64), headers=auth())
    detail = response.json()["detail"]
    assert set(detail) == {"error_code", "message"}
    assert detail["error_code"] in E.WORKER_ERROR_CODES
    assert isinstance(detail["message"], str) and detail["message"]
