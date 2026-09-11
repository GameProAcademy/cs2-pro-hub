import pytest
from fastapi.testclient import TestClient

from app import create_app
from errors import WorkerConfigurationError
from settings import DEV_UNPINNED_REVISION, Settings, load_settings


def _settings(revision="git:" + "a" * 40):
    return Settings(
        token="test-token",
        revision=revision,
        contract_version=1,
        environment="production",
        max_demo_bytes=1024 * 1024,
        max_payload_bytes=1024 * 1024,
        download_timeout_seconds=1.0,
        parse_timeout_seconds=1.0,
    )


def test_health_and_version_expose_pinned_identity():
    app = create_app(_settings())
    client = TestClient(app)

    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/version").json() == {
        "parser": {
            "name": "demoparser2",
            "version": "0.42.0",
            "revision": "git:" + "a" * 40,
        },
        "contract_version": 1,
    }


def test_missing_auth_is_standard_envelope():
    app = create_app(_settings())
    response = TestClient(app).post("/v1/parse", json={})

    assert response.status_code == 401
    assert set(response.json()) == {"detail"}
    assert response.json()["detail"]["error_code"] == "UNAUTHORIZED"


def test_contract_mismatch_is_standard_envelope():
    app = create_app(_settings())
    response = TestClient(app).post(
        "/v1/parse",
        headers={"Authorization": "Bearer test-token"},
        json={
            "contract_version": 99,
            "upload_id": "upload",
            "demo_url": "https://example.invalid/demo.dem",
            "demo_sha256": "a" * 64,
            "file_size": 1,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["error_code"] == "UNSUPPORTED_CONTRACT_VERSION"


def test_production_revision_fails_closed_when_missing():
    with pytest.raises(WorkerConfigurationError):
        load_settings({"ENVIRONMENT": "production", "PARSER_TOKEN": "secret"})


def test_dev_revision_is_explicitly_unpinned():
    settings = load_settings({"ENVIRONMENT": "development", "PARSER_TOKEN": "secret"})
    assert settings.revision == DEV_UNPINNED_REVISION
    assert settings.revision_is_pinned is False


def test_legacy_revision_is_rejected():
    with pytest.raises(WorkerConfigurationError):
        load_settings(
            {
                "ENVIRONMENT": "production",
                "PARSER_TOKEN": "secret",
                "PARSER_REVISION": "pypi-0.42.0",
            }
        )
