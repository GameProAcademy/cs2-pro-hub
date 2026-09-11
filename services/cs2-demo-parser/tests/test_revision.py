"""GATE 1E.1 — revision lock, /health, /version and the parser boundary."""

import pytest
from conftest import TOKEN, make_settings

from errors import WorkerConfigurationError
from parser import classify_parser_exception
from settings import (
    DEV_UNPINNED_REVISION,
    is_valid_revision,
    load_settings,
    resolve_revision,
)

SHA = "git:" + "1" * 40


# --- revision resolution --------------------------------------------------


def test_production_requires_revision():
    with pytest.raises(WorkerConfigurationError):
        resolve_revision(None, environment="production")
    with pytest.raises(WorkerConfigurationError):
        resolve_revision("   ", environment="production")


def test_production_rejects_the_old_pypi_fallback():
    with pytest.raises(WorkerConfigurationError):
        resolve_revision("pypi-0.42.0", environment="production")
    assert is_valid_revision("pypi-0.42.0") is False


def test_production_accepts_immutable_revision():
    assert resolve_revision(SHA, environment="production") == SHA


def test_development_fallback_is_explicitly_unpinned():
    assert resolve_revision(None, environment="development") == DEV_UNPINNED_REVISION
    assert is_valid_revision(DEV_UNPINNED_REVISION) is False


def test_load_settings_fails_closed_without_revision_in_production():
    with pytest.raises(WorkerConfigurationError):
        load_settings({"PARSER_TOKEN": TOKEN, "ENVIRONMENT": "production"})


def test_load_settings_requires_token():
    with pytest.raises(WorkerConfigurationError):
        load_settings({"ENVIRONMENT": "development"})


def test_load_settings_rejects_unsupported_contract_version():
    with pytest.raises(WorkerConfigurationError):
        load_settings(
            {
                "PARSER_TOKEN": TOKEN,
                "ENVIRONMENT": "production",
                "PARSER_REVISION": SHA,
                "PARSER_CONTRACT_VERSION": "2",
            }
        )


def test_load_settings_reads_the_pinned_revision():
    settings = load_settings(
        {"PARSER_TOKEN": TOKEN, "ENVIRONMENT": "production", "PARSER_REVISION": SHA}
    )
    assert settings.revision == SHA
    assert settings.revision_is_pinned is True
    assert settings.contract_version == 1


# --- endpoints ------------------------------------------------------------


def test_health_is_simple_and_dependency_free(client_factory):
    response = client_factory().get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version_reports_the_running_identity(client_factory):
    settings = make_settings(revision=SHA)
    payload = client_factory(settings=settings).get("/version").json()
    assert payload == {
        "parser": {"name": "demoparser2", "version": "0.42.0", "revision": SHA},
        "contract_version": 1,
    }


def test_version_revision_matches_the_process_revision(client_factory, ok_download):
    settings = make_settings(revision=SHA)
    client = client_factory(settings=settings, download=ok_download)
    version_revision = client.get("/version").json()["parser"]["revision"]
    parsed = client.post(
        "/v1/parse",
        json={
            "contract_version": 1,
            "upload_id": "u",
            "demo_url": "https://storage.example.com/d.dem",
            "demo_sha256": "0" * 64,
            "file_size": 519,
        },
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    # Integrity fails (deliberate), but the identity source is the same object.
    assert version_revision == SHA
    assert parsed.status_code == 422


def test_version_does_not_leak_the_token(client_factory):
    body = client_factory().get("/version").text
    assert TOKEN not in body


# --- parser exception classification -------------------------------------


def test_classify_only_uses_positive_evidence():
    assert type(classify_parser_exception(RuntimeError("invalid demo header"))).__name__ == (
        "InvalidDemoError"
    )
    assert type(classify_parser_exception(RuntimeError("unexpected EOF"))).__name__ == (
        "CorruptedDemoError"
    )
    assert type(classify_parser_exception(RuntimeError("unsupported protocol version"))).__name__ == (
        "UnsupportedDemoError"
    )
    unknown = KeyError("some internal bug")
    assert classify_parser_exception(unknown) is unknown
