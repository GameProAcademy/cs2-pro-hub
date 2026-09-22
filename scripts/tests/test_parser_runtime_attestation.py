from scripts.parser_runtime_attestation import digest, runtime_identity, stable_json


def test_canonical_serialization_is_deterministic():
    left = {"b": 2, "a": {"z": False, "x": None}}
    right = {"a": {"x": None, "z": False}, "b": 2}
    assert stable_json(left) == stable_json(right)
    assert digest(left) == digest(right)


def test_runtime_identity_preserves_required_fields():
    payload = {"parser": {"name": "demoparser2", "version": "0.42.0", "revision": "git:x",
                          "semantic_revision": "git:x", "build_revision": "git:x"}, "contract_version": 1}
    assert runtime_identity(payload) == {"name": "demoparser2", "version": "0.42.0",
        "revision": "git:x", "semantic_revision": "git:x", "build_revision": "git:x", "contract_version": 1}
