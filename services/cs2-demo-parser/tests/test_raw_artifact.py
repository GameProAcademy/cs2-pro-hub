import gzip
import hashlib
import json

import httpx
import pytest

import raw_artifact
from raw_artifact import ArtifactContext, RawArtifactWriter, _grenade_measurements, _json_safe, _stable


class FakeAsyncClient:
    def __init__(self):
        self.objects = {}
    async def put(self, url, content=b"", headers=None):
        self.objects[url] = content
        return httpx.Response(200, request=httpx.Request("PUT", url))


@pytest.mark.asyncio
async def test_raw_artifact_is_chunked_hashed_and_idempotent():
    client = FakeAsyncClient()
    artifact = {"id": "artifact", "created_at": "now", "storage_bucket": "cs2-raw-evidence",
                "manifest_storage_path": "user/upload/attempt-2/manifest.json", "status": "uploading",
                "raw_status": "writing", "audit_status": "running"}
    chunks = []
    finalized = []

    async def bridge(action, body):
        if action == "raw-artifact-init":
            return artifact
        if action == "raw-chunk-prepare":
            chunks.append(dict(body))
            return {"path": f"user/upload/attempt-2/{body['section']}/{body['chunkIndex']}.gz",
                    "uploadUrl": f"https://storage.example/{len(chunks)}"}
        if action == "raw-chunk-verify":
            return {"verified": True}
        if action == "raw-artifact-finalize":
            finalized.append(body)
            return {**artifact, "status": "ready", "raw_status": "ready", "audit_status": "approved",
                    "root_digest": body["rootDigest"], "total_chunks": len(chunks),
                    "total_rows": sum(item["rowCount"] for item in chunks),
                    "total_bytes": sum(item["byteSize"] for item in chunks)}
        raise AssertionError(action)

    context = ArtifactContext(job_id="job", upload_id="upload", user_id="user", attempt_number=2,
                              demo_sha256="a" * 64, parser={"name": "demoparser2"}, contract_version=1)
    writer = RawArtifactWriter(context=context, bridge=bridge, client=client)
    evidence = {"manifest": {"raw_header": {"map": "de_cache"}},
                "raw_events": [{"tick": index} for index in range(20)], "grenade_samples": [{"tick": 1}],
                "raw_audit_status": "APPROVED"}
    ref = await writer.write(evidence)
    assert ref["status"] == "ready" and ref["total_chunks"] > 0
    previous = None
    for index, chunk in enumerate(chunks, start=1):
        body = client.objects[f"https://storage.example/{index}"]
        assert hashlib.sha256(body).hexdigest() == chunk["sha256"]
        assert chunk["previousChunkSha256"] == previous
        assert json.loads(gzip.decompress(body).splitlines()[0]) is not None
        previous = chunk["sha256"]
    measurements = finalized[0]["manifest"]["measurements"]
    assert measurements["sections"]["events"]["rows"] == 20
    assert measurements["sections"]["events"]["uncompressed_bytes"] > 0
    assert measurements["sections"]["grenades"]["compressed_bytes"] > 0
    assert measurements["performance"]["raw_write_ms"] >= 0
    assert measurements["performance"]["peak_rss_kib"] > 0


@pytest.mark.asyncio
async def test_raw_artifact_fails_closed_when_total_chunk_cap_is_reached(monkeypatch):
    monkeypatch.setattr(raw_artifact, "MAX_CHUNKS_TOTAL", 0)
    client = FakeAsyncClient()

    async def bridge(action, body):
        if action == "raw-artifact-init":
            return {"id": "artifact", "created_at": "now", "status": "uploading"}
        raise AssertionError(action)

    context = ArtifactContext(job_id="job", upload_id="upload", user_id="user", attempt_number=1,
                              demo_sha256="a" * 64, parser={"name": "demoparser2"}, contract_version=1)
    with pytest.raises(RuntimeError, match="RAW_CHUNK_LIMIT_EXCEEDED"):
        await RawArtifactWriter(context=context, bridge=bridge, client=client).write(
            {"manifest": {"raw_header": {"map": "de_cache"}}}
        )


def test_grenade_measurements_use_real_projectile_identity_when_available():
    measured = _grenade_measurements([
        {"entity_id": 10, "tick": 1}, {"entity_id": 10, "tick": 2},
        {"entity_id": 11, "tick": 3},
    ])
    assert measured == {"rows": 3, "identity_field": "entity_id", "distinct_projectiles": 2,
                        "average_rows_per_projectile": 1.5, "maximum_rows_per_projectile": 2}


def test_grenade_measurements_do_not_invent_projectile_identity():
    assert _grenade_measurements([{"tick": 1}, {"tick": 2}]) == {
        "rows": 2, "identity_field": None,
    }


@pytest.mark.asyncio
async def test_partial_retry_reuses_verified_chunks_without_reuploading():
    client = FakeAsyncClient()
    artifact = {"id": "artifact", "created_at": "now", "storage_bucket": "cs2-raw-evidence",
                "manifest_storage_path": "user/upload/attempt-7/manifest.json", "status": "uploading",
                "raw_status": "writing", "audit_status": "running"}
    prepared = {}
    finalize_calls = []

    async def bridge(action, body):
        if action == "raw-artifact-init":
            return artifact
        if action == "raw-chunk-prepare":
            key = (body["section"], body["chunkIndex"])
            if key in prepared:
                assert prepared[key] == body
                return {"path": f"user/upload/attempt-7/{body['section']}/{body['chunkIndex']}.gz",
                        "alreadyVerified": True}
            prepared[key] = dict(body)
            return {"path": f"user/upload/attempt-7/{body['section']}/{body['chunkIndex']}.gz",
                    "uploadUrl": f"https://storage.example/{len(prepared)}"}
        if action == "raw-chunk-verify":
            return {"verified": True}
        if action == "raw-artifact-finalize":
            finalize_calls.append(body)
            return {**artifact, "status": "ready", "raw_status": "ready", "audit_status": "approved",
                    "root_digest": body["rootDigest"], "total_chunks": len(prepared),
                    "total_rows": sum(item["rowCount"] for item in prepared.values()),
                    "total_bytes": sum(item["byteSize"] for item in prepared.values())}
        raise AssertionError(action)

    context = ArtifactContext(job_id="job", upload_id="upload", user_id="user", attempt_number=7,
                              demo_sha256="a" * 64, parser={"name": "demoparser2"}, contract_version=1)
    evidence = {"manifest": {"raw_header": {"map": "de_cache"}},
                "raw_events": [{"tick": index} for index in range(5)],
                "raw_audit_status": "APPROVED"}
    first = await RawArtifactWriter(context=context, bridge=bridge, client=client).write(dict(evidence))
    uploaded_once = len(client.objects)
    second = await RawArtifactWriter(context=context, bridge=bridge, client=client).write(dict(evidence))
    assert first["root_digest"] == second["root_digest"]
    assert len(client.objects) == uploaded_once
    assert finalize_calls[0]["manifest"] == finalize_calls[1]["manifest"]
    audit = finalize_calls[0]["manifest"]["audit_evidence"]
    assert audit["raw_audit_status"] == "APPROVED"
    assert audit["raw_block_reasons"] == []


def test_physical_chunk_mutation_changes_sha256():
    body = gzip.compress(b'{"tick":1}\n', mtime=0)
    changed = bytearray(body)
    changed[-1] ^= 1
    assert hashlib.sha256(body).hexdigest() != hashlib.sha256(changed).hexdigest()


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_float_becomes_json_null(value):
    assert _stable({"x": value}) == b'{"x":null}'


def test_json_boundary_normalizes_nested_lists_and_tuples_without_mutating_input():
    source = {"rows": [1.25, float("nan"), {"velocity": (float("inf"), -3.5)}]}
    normalized = _json_safe(source)
    assert normalized == {"rows": [1.25, None, {"velocity": [None, -3.5]}]}
    assert source["rows"][0] == 1.25
    assert source["rows"][2]["velocity"][1] == -3.5


def test_json_boundary_preserves_supported_scalar_types():
    value = {"float": 12.375, "integer": 17, "text": "NaN", "missing": None, "flag": True}
    assert json.loads(_stable(value)) == value


def test_strict_serialization_is_deterministic_and_keeps_allow_nan_disabled(monkeypatch):
    calls = []
    original = json.dumps

    def recording_dumps(value, **kwargs):
        calls.append(kwargs)
        return original(value, **kwargs)

    monkeypatch.setattr(json, "dumps", recording_dumps)
    value = {"z": float("nan"), "a": [float("inf"), 1.5]}
    first = _stable(value)
    second = _stable(value)
    assert first == second == b'{"a":[null,1.5],"z":null}'
    assert calls and all(call["allow_nan"] is False for call in calls)


def test_realistic_tick_with_non_finite_coordinates_serializes_without_losing_record():
    tick = {
        "tick": 18234,
        "steamid": 76561198000000000,
        "position": {"x": 128.5, "y": float("nan"), "z": float("-inf")},
        "velocity": [12.0, float("inf"), 0.0],
    }
    decoded = json.loads(_stable(tick))
    assert decoded["tick"] == 18234
    assert decoded["steamid"] == 76561198000000000
    assert decoded["position"] == {"x": 128.5, "y": None, "z": None}
    assert decoded["velocity"] == [12.0, None, 0.0]


@pytest.mark.asyncio
async def test_nan_is_normalized_for_multiple_raw_sections_and_hashes_are_repeatable():
    async def run_once():
        client = FakeAsyncClient()
        artifact = {"id": "artifact", "created_at": "now", "storage_bucket": "cs2-raw-evidence",
                    "manifest_storage_path": "user/upload/attempt-7/manifest.json", "status": "uploading",
                    "raw_status": "writing", "audit_status": "running"}
        chunks = []

        async def bridge(action, body):
            if action == "raw-artifact-init":
                return artifact
            if action == "raw-chunk-prepare":
                chunks.append(dict(body))
                return {"path": f"p/{body['section']}/{body['chunkIndex']}.gz",
                        "uploadUrl": f"https://storage.example/{len(chunks)}"}
            if action == "raw-chunk-verify":
                return {"verified": True}
            if action == "raw-artifact-finalize":
                return {**artifact, "status": "ready", "raw_status": "ready", "audit_status": "approved",
                        "root_digest": body["rootDigest"], "total_chunks": len(chunks),
                        "total_rows": sum(item["rowCount"] for item in chunks),
                        "total_bytes": sum(item["byteSize"] for item in chunks)}
            raise AssertionError(action)

        context = ArtifactContext(job_id="job", upload_id="upload", user_id="user", attempt_number=7,
                                  demo_sha256="a" * 64, parser={"name": "demoparser2"}, contract_version=1)
        evidence = {
            "manifest": {"raw_header": {"duration": float("nan")}},
            "raw_player_info": [{"rating": float("inf")}],
            "round_evidence": [{"clock": float("-inf")}],
            "raw_events": [{"damage": float("nan")}],
            "tick_samples": [{"x": float("nan")}],
            "grenade_samples": [{"distance": float("inf")}],
            "player_coverage": [{"ratio": float("-inf")}],
            "tick_coverage": [{"value": float("nan")}],
            "economy_coverage": [{"value": float("inf")}],
            "forensic_inventory": {"ratio": float("nan")},
            "raw_audit_status": "APPROVED",
        }
        reference = await RawArtifactWriter(context=context, bridge=bridge, client=client).write(evidence)
        physical = [client.objects[url] for url in sorted(client.objects)]
        assert all(b"NaN" not in body and b"Infinity" not in body for body in map(gzip.decompress, physical))
        return reference["root_digest"], [hashlib.sha256(body).hexdigest() for body in physical]

    assert await run_once() == await run_once()
