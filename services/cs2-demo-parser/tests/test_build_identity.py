"""/version reports the commit written into the image, not a configured string."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import app as app_module
import settings as settings_module
from conftest import make_settings

SHA = "0123456789abcdef0123456789abcdef01234567"


def write(tmp_path, payload) -> str:
    (tmp_path / "BUILD_INFO.json").write_text(payload if isinstance(payload, str) else json.dumps(payload))
    return str(tmp_path)


def test_the_embedded_commit_is_read_from_the_image(tmp_path):
    directory = write(tmp_path, {"commit": SHA, "source": "railway"})
    assert settings_module.image_build_identity(directory) == {"commit": SHA, "embedded": True, "source": "railway"}


@pytest.mark.parametrize("payload", [
    None, "", "not json", "[]", {"commit": None, "source": None}, {"commit": "abc"}, {"commit": SHA.upper()},
    {"commit": SHA + "0"}, {"commit": "git:" + SHA}, {"commit": 123},
])
def test_anything_else_is_unknown_never_guessed(tmp_path, payload):
    directory = str(tmp_path) if payload is None else write(tmp_path, payload)
    assert settings_module.image_build_identity(directory) == {"commit": None, "embedded": False, "source": None}


def test_no_environment_variable_can_change_it(tmp_path, monkeypatch):
    directory = write(tmp_path, {"commit": SHA, "source": "build-arg"})
    for name in ("RAILWAY_GIT_COMMIT_SHA", "BUILD_COMMIT_SHA", "PARSER_REVISION", "PARSER_BUILD_REVISION"):
        monkeypatch.setenv(name, "f" * 40)
    assert settings_module.image_build_identity(directory)["commit"] == SHA


def version(monkeypatch, image, **overrides):
    monkeypatch.setattr(app_module, "image_build_identity", lambda: image)
    with TestClient(app_module.create_app(make_settings(**overrides), parse_fn=lambda _path: {})) as client:
        return client.get("/version").json()


def test_version_relates_build_commit_parser_revision_and_contract(monkeypatch):
    body = version(monkeypatch, {"commit": SHA, "embedded": True, "source": "railway"}, revision="git:" + SHA)
    assert body["build"] == {"commit": SHA, "embedded": True, "source": "railway", "declared_revision_matches": True}
    assert body["parser"]["revision"] == "git:" + SHA and body["contract_version"] == 1
    assert body["parser"]["name"] and body["parser"]["version"]


def test_version_says_when_the_declared_revision_names_another_build(monkeypatch):
    body = version(monkeypatch, {"commit": SHA, "embedded": True, "source": "railway"}, revision="git:" + "a" * 40)
    assert body["build"]["declared_revision_matches"] is False
    # The declared build revision, when present, is the one compared.
    body = version(monkeypatch, {"commit": SHA, "embedded": True, "source": "railway"},
                   revision="git:" + "a" * 40, build_revision="git:" + SHA)
    assert body["build"]["declared_revision_matches"] is True


def test_version_does_not_claim_a_match_without_an_embedded_commit(monkeypatch):
    body = version(monkeypatch, {"commit": None, "embedded": False, "source": None})
    assert body["build"] == {"commit": None, "embedded": False, "source": None, "declared_revision_matches": None}


def test_existing_identity_fields_are_unchanged(monkeypatch):
    body = version(monkeypatch, {"commit": None, "embedded": False, "source": None})
    assert set(body) == {"parser", "contract_version", "build"}
    assert set(body["parser"]) == {"name", "version", "revision", "semantic_revision", "build_revision"}
