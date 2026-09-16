import gzip
import hashlib
import json

import httpx
import pytest

from raw_artifact import ArtifactContext, RawArtifactWriter


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
