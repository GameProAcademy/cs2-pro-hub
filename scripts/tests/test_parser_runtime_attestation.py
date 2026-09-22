from scripts.parser_runtime_attestation import digest, git_blob_sha1, runtime_identity, stable_json


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


def test_git_blob_hash_uses_object_database_framing():
    assert git_blob_sha1(b"test content\n") == "d670460b4b4aece5915caf5c68d12f560a9fe3e4"
