import gzip
import hashlib
import json

from raw_artifact import ArtifactContext, RawArtifactWriter


class FakeResponse:
    def __init__(self, payload=None, content=b""):
        self._payload = payload
        self.content = content
    def raise_for_status(self): pass
    def json(self): return self._payload


class FakeClient:
    def __init__(self):
        self.artifact = None; self.chunks = []; self.objects = {}
    def request(self, method, url, headers=None, params=None, json=None):
        table = url.rsplit("/", 1)[-1]
        if table == "raw_evidence_artifacts" and method == "GET":
            return FakeResponse([self.artifact] if self.artifact else [])
        if table == "raw_evidence_artifacts" and method == "POST":
            self.artifact = {"id": "artifact", "created_at": "now", **json}
            return FakeResponse([self.artifact])
        if table == "raw_evidence_artifacts" and method == "PATCH":
            self.artifact.update(json); return FakeResponse()
        if table == "raw_evidence_chunks" and method == "POST":
            self.chunks.append(dict(json)); return FakeResponse()
        if table == "raw_evidence_chunks" and method == "PATCH":
            for chunk in self.chunks:
                if chunk["section"] == params["section"][3:] and chunk["chunk_index"] == int(params["chunk_index"][3:]):
                    chunk.update(json)
            return FakeResponse()
        raise AssertionError((method, url, params))
    def post(self, url, headers=None, content=b""):
        path = url.split("/cs2-raw-evidence/", 1)[1]
        self.objects[path] = content; return FakeResponse()
    def get(self, url, headers=None):
        path = url.split("/cs2-raw-evidence/", 1)[1]
        return FakeResponse(content=self.objects[path])


def test_raw_artifact_is_chunked_hashed_and_idempotent():
    client = FakeClient()
    context = ArtifactContext(job_id="job", upload_id="upload", user_id="user", attempt_number=2,
                              demo_sha256="a" * 64, parser={"name": "demoparser2"}, contract_version=1)
    writer = RawArtifactWriter(backend_url="https://backend.example", service_key="secret",
                               context=context, client=client)
    evidence = {"manifest": {"raw_header": {"map": "de_cache"}},
                "raw_events": [{"tick": index} for index in range(20)], "grenade_samples": [{"tick": 1}],
                "raw_audit_status": "APPROVED"}
    ref = writer.write(evidence)
    assert ref["status"] == "ready" and ref["total_chunks"] > 0
    assert ref["root_digest"] == client.artifact["root_digest"]
    previous = None
    for chunk in client.chunks:
        body = client.objects[chunk["storage_path"]]
        assert hashlib.sha256(body).hexdigest() == chunk["sha256"]
        assert chunk["previous_chunk_sha256"] == previous
        assert json.loads(gzip.decompress(body).splitlines()[0]) is not None
        previous = chunk["sha256"]
    assert writer.write({})["artifact_id"] == "artifact"