"""Disposable-only RAW, HOT, terminalization and queue operations for R11.2."""
from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit

from f553.r11.lifecycle import http, ident, object_path, private_bucket, sql

PARSER_ROOT = Path(__file__).resolve().parents[3] / "services/cs2-demo-parser"
if str(PARSER_ROOT) not in sys.path:
    sys.path.insert(0, str(PARSER_ROOT))

from hot_payload import build_hot_payload, hot_payload_measurements
from raw_artifact import ArtifactContext, RawArtifactWriter, RAW_BUCKET, SECTION_ORDER, _stable


def json_expr(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "'" + encoded.replace("'", "''") + "'::jsonb"


def row_json(db: dict[str, str], query: str) -> dict:
    """Return one JSON row for either SELECT or DML ... RETURNING.

    PostgreSQL does not permit INSERT/UPDATE/DELETE directly inside a
    subquery in the FROM clause. The previous implementation generated
    SELECT row_to_json(r) FROM (INSERT ... RETURNING ...) r and therefore
    failed the first integrated RAW operation with a syntax error near
    INTO. Data-modifying CTEs are the supported PostgreSQL form and keep
    the returned row semantics identical for the disposable harness.
    """
    statement = query.strip().rstrip(";")
    verb = statement.split(None, 1)[0].upper() if statement else ""
    if verb in {"INSERT", "UPDATE", "DELETE"}:
        wrapped = f"WITH dml AS ({statement}) SELECT row_to_json(dml) FROM dml;"
    else:
        wrapped = f"SELECT row_to_json(r) FROM ({statement}) r;"
    value = sql(db, wrapped)
    if not value:
        raise RuntimeError("R11_EXPECTED_DATABASE_ROW")
    return json.loads(value)


class _Response:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code < 200 or self.status_code >= 300:
            raise RuntimeError(f"R11_RAW_STORAGE_HTTP_{self.status_code}")


class LocalStorageClient:
    """Minimal async transport accepted by the production RAW writer."""

    def __init__(self, api_url: str, key: str) -> None:
        self.api_url = api_url
        self.key = key

    async def put(self, url: str, content: bytes = b"", headers: dict | None = None) -> _Response:
        parsed = urlsplit(url)
        if parsed.scheme != "r11-local" or parsed.netloc != RAW_BUCKET:
            raise RuntimeError("R11_RAW_UPLOAD_URL_NOT_LOCAL")
        status, _ = http(self.api_url, self.key, object_path(RAW_BUCKET, parsed.path.lstrip("/")),
                         "POST", content, (headers or {}).get("content-type", "application/gzip"))
        return _Response(status)


class LocalRawBridge:
    """Local implementation of the production RAW bridge state machine."""

    def __init__(self, db: dict[str, str], api_url: str, key: str, claim: dict, worker_id: str) -> None:
        self.db = db
        self.api_url = api_url
        self.key = key
        self.claim = claim
        self.worker_id = worker_id
        self.prefix = f"{claim['user_id']}/{claim['upload_id']}/attempt-{claim['attempt_number']}"

    def current(self) -> None:
        current = sql(self.db, "SELECT count(*) FROM public.demo_jobs WHERE "
                      f"id='{ident(self.claim['job_id'])}' AND upload_id='{ident(self.claim['upload_id'])}' "
                      f"AND queue_message_id={int(self.claim['message_id'])} "
                      f"AND dispatch_attempt={int(self.claim['attempt'])} AND worker_id='{self.worker_id}' "
                      "AND status='processing' AND lease_expires_at > now();")
        if current != "1":
            raise RuntimeError("R11_RAW_JOB_LEASE_NOT_CURRENT")

    async def __call__(self, action: str, body: dict) -> dict:
        self.current()
        if action == "raw-artifact-init":
            existing = sql(self.db, "SELECT row_to_json(a) FROM public.raw_evidence_artifacts a WHERE "
                           f"job_id='{ident(self.claim['job_id'])}';")
            if existing:
                return json.loads(existing)
            return row_json(self.db, "INSERT INTO public.raw_evidence_artifacts "
                "(job_id,upload_id,user_id,attempt_number,demo_sha256,storage_bucket,storage_prefix,"
                "manifest_storage_path,schema_version,status,raw_status,audit_status) VALUES "
                f"('{ident(self.claim['job_id'])}','{ident(self.claim['upload_id'])}',"
                f"'{ident(self.claim['user_id'])}',{int(self.claim['attempt_number'])},"
                f"'{self.claim['demo_sha256']}','{RAW_BUCKET}','{self.prefix}',"
                f"'{self.prefix}/manifest.json',1,'uploading','writing','running') RETURNING *")
        if action == "raw-chunk-prepare":
            artifact = ident(body["artifactId"])
            section = str(body["section"])
            index = int(body["chunkIndex"])
            if section not in SECTION_ORDER or index < 0:
                raise RuntimeError("R11_RAW_CHUNK_COORDINATES_INVALID")
            path = f"{self.prefix}/{section}/chunk-{index:06d}.jsonl.gz"
            existing = sql(self.db, "SELECT row_to_json(c) FROM public.raw_evidence_chunks c WHERE "
                           f"artifact_id='{artifact}' AND section='{section}' AND chunk_index={index};")
            expected = {"first_row": int(body["firstRow"]), "last_row": int(body["lastRow"]),
                        "row_count": int(body["rowCount"]), "byte_size": int(body["byteSize"]),
                        "sha256": body["sha256"], "previous_chunk_sha256": body.get("previousChunkSha256"),
                        "storage_path": path}
            if existing:
                current = json.loads(existing)
                if any(current.get(key) != value for key, value in expected.items()):
                    raise RuntimeError("R11_RAW_CHUNK_IDENTITY_CONFLICT")
                if current["status"] == "verified":
                    return {"path": path, "alreadyVerified": True}
            else:
                previous = "NULL" if expected["previous_chunk_sha256"] is None else f"'{expected['previous_chunk_sha256']}'"
                sql(self.db, "INSERT INTO public.raw_evidence_chunks "
                    "(artifact_id,section,chunk_index,storage_path,first_row,last_row,row_count,byte_size,sha256,previous_chunk_sha256,status) VALUES "
                    f"('{artifact}','{section}',{index},'{path}',{expected['first_row']},{expected['last_row']},"
                    f"{expected['row_count']},{expected['byte_size']},'{expected['sha256']}',{previous},'uploading');")
            return {"path": path, "uploadUrl": f"r11-local://{RAW_BUCKET}/{path}"}
        if action == "raw-chunk-verify":
            artifact = ident(body["artifactId"])
            section = str(body["section"])
            index = int(body["chunkIndex"])
            chunk = row_json(self.db, "SELECT storage_path,byte_size,sha256 FROM public.raw_evidence_chunks WHERE "
                             f"artifact_id='{artifact}' AND section='{section}' AND chunk_index={index}")
            _, stored = http(self.api_url, self.key, object_path(RAW_BUCKET, chunk["storage_path"]))
            if len(stored) != chunk["byte_size"] or hashlib.sha256(stored).hexdigest() != chunk["sha256"]:
                raise RuntimeError("R11_RAW_CHUNK_READBACK_MISMATCH")
            sql(self.db, "UPDATE public.raw_evidence_chunks SET status='verified',uploaded_at=now(),verified_at=now() WHERE "
                f"artifact_id='{artifact}' AND section='{section}' AND chunk_index={index};")
            return {"verified": True, "bytes": len(stored), "sha256": chunk["sha256"]}
        if action == "raw-artifact-finalize":
            artifact = ident(body["artifactId"])
            chunks = json.loads(sql(self.db, "SELECT coalesce(json_agg(c),'[]') FROM "
                "(SELECT section,chunk_index,row_count,byte_size,sha256,previous_chunk_sha256,status "
                f"FROM public.raw_evidence_chunks WHERE artifact_id='{artifact}') c;"))
            ordered = sorted(chunks, key=lambda c: (SECTION_ORDER.index(c["section"]), c["chunk_index"]))
            if not ordered or any(chunk["status"] != "verified" for chunk in ordered):
                raise RuntimeError("R11_RAW_ARTIFACT_INCOMPLETE")
            previous = None
            for chunk in ordered:
                if chunk["previous_chunk_sha256"] != previous:
                    raise RuntimeError("R11_RAW_CHAIN_MISMATCH")
                previous = chunk["sha256"]
            summaries = []
            for section in SECTION_ORDER:
                own = [chunk for chunk in ordered if chunk["section"] == section]
                summaries.append({"name": section, "chunk_count": len(own),
                                  "row_count": sum(chunk["row_count"] for chunk in own),
                                  "byte_count": sum(chunk["byte_size"] for chunk in own),
                                  "digest": hashlib.sha256(_stable([chunk["sha256"] for chunk in own])).hexdigest()})
            computed = hashlib.sha256(_stable(summaries)).hexdigest()
            manifest = body["manifest"]
            if computed != body["rootDigest"] or manifest.get("root_digest") != computed or manifest.get("sections") != summaries:
                raise RuntimeError("R11_RAW_ROOT_OR_MANIFEST_MISMATCH")
            manifest["audit_status"] = "approved" if manifest.get("audit_status") == "approved" else "blocked"
            manifest_store = put_read(self.api_url, self.key, RAW_BUCKET, f"{self.prefix}/manifest.json", _stable(manifest))
            ready = row_json(self.db, "UPDATE public.raw_evidence_artifacts SET "
                f"total_chunks={len(ordered)},total_rows={sum(c['row_count'] for c in ordered)},"
                f"total_bytes={sum(c['byte_size'] for c in ordered)},status='ready',raw_status='ready',"
                f"audit_status='{manifest['audit_status']}',root_digest='{computed}',ready_at=now(),updated_at=now() "
                f"WHERE id='{artifact}' RETURNING *")
            ready["manifest_storage"] = manifest_store
            return ready
        raise RuntimeError("R11_UNKNOWN_RAW_BRIDGE_ACTION")


def put_read(api_url: str, key: str, bucket: str, path: str, content: bytes) -> dict:
    endpoint = object_path(bucket, path)
    status, _ = http(api_url, key, endpoint, "POST", content, "application/json" if path.endswith(".json") else "application/octet-stream")
    read_status, readback = http(api_url, key, endpoint)
    digest = hashlib.sha256(content).hexdigest()
    if status not in (200, 201) or read_status != 200 or readback != content:
        raise RuntimeError("R11_STORAGE_READBACK_MISMATCH")
    return {"path": path, "bytes": len(content), "sha256": digest,
            "read_sha256": hashlib.sha256(readback).hexdigest(), "write_status": status, "read_status": read_status}


def reconstruct_raw(db: dict[str, str], api_url: str, key: str, artifact_id: str) -> dict:
    artifact = row_json(db, f"SELECT * FROM public.raw_evidence_artifacts WHERE id='{ident(artifact_id)}'")
    chunks = json.loads(sql(db, "SELECT coalesce(json_agg(c),'[]') FROM "
        f"(SELECT * FROM public.raw_evidence_chunks WHERE artifact_id='{ident(artifact_id)}') c;"))
    ordered = sorted(chunks, key=lambda c: (SECTION_ORDER.index(c["section"]), c["chunk_index"]))
    sections: dict[str, list] = {name: [] for name in SECTION_ORDER}
    storage = []
    previous = None
    for chunk in ordered:
        _, body = http(api_url, key, object_path(RAW_BUCKET, chunk["storage_path"]))
        digest = hashlib.sha256(body).hexdigest()
        if digest != chunk["sha256"] or len(body) != chunk["byte_size"] or chunk["previous_chunk_sha256"] != previous:
            raise RuntimeError("R11_RAW_RECONSTRUCTION_INTEGRITY_FAILURE")
        rows = [json.loads(line) for line in gzip.decompress(body).splitlines()]
        if len(rows) != chunk["row_count"]:
            raise RuntimeError("R11_RAW_RECONSTRUCTION_ROW_MISMATCH")
        sections[chunk["section"]].extend(rows)
        previous = digest
        storage.append({"path": chunk["storage_path"], "bytes": len(body), "sha256": digest, "read_back": True})
    _, manifest_bytes = http(api_url, key, object_path(RAW_BUCKET, artifact["manifest_storage_path"]))
    manifest = json.loads(manifest_bytes)
    if manifest["root_digest"] != artifact["root_digest"]:
        raise RuntimeError("R11_RAW_MANIFEST_DATABASE_MISMATCH")
    evidence = {"manifest": {"raw_header": sections["header"][0] if sections["header"] else {}},
                "raw_player_info": sections["players"], "round_evidence": sections["rounds"],
                "raw_events": sections["events"], "tick_samples": sections["ticks"],
                "grenade_samples": sections["grenades"], "player_coverage": sections["player-info"],
                "tick_coverage": [], "grenade_coverage": [], "economy_coverage": sections["economy"]}
    return {"artifact": artifact, "chunks": ordered, "manifest": manifest, "evidence": evidence,
            "storage": storage, "snapshot_digest": hashlib.sha256(_stable({"artifact": artifact, "chunks": ordered, "manifest": manifest})).hexdigest()}


async def persist_raw(db: dict[str, str], api_url: str, key: str, claim: dict,
                      worker_id: str, parsed: dict) -> tuple[dict, dict]:
    private_bucket(api_url, key, RAW_BUCKET)
    parser = {"name": "demoparser2", "version": parsed["parser_version"],
              "revision": "0.42.0", "semantic_revision": "0.42.0", "build_revision": None}
    context = ArtifactContext(job_id=claim["job_id"], upload_id=claim["upload_id"],
                              user_id=claim["user_id"], attempt_number=int(claim["attempt_number"]),
                              demo_sha256=claim["demo_sha256"], parser=parser, contract_version=1)
    bridge = LocalRawBridge(db, api_url, key, claim, worker_id)
    reference = await RawArtifactWriter(context=context, bridge=bridge,
                                        client=LocalStorageClient(api_url, key)).write(parsed["output"]["raw_evidence"])
    return reference, reconstruct_raw(db, api_url, key, reference["artifact_id"])


def persist_hot_and_finish(db: dict[str, str], claim: dict, parsed: dict,
                           raw: dict, reconstructed: dict) -> dict:
    parser = {"name": "demoparser2", "version": parsed["parser_version"],
              "revision": "0.42.0", "semantic_revision": "0.42.0", "build_revision": None}
    hot = build_hot_payload(parsed["output"], parser=parser, contract_version=1,
                            demo_sha256=claim["demo_sha256"], upload_id=claim["upload_id"],
                            evidence=reconstructed["evidence"])
    hot["raw"] = {"artifact_id": raw["artifact_id"], "root_digest": raw["root_digest"]}
    hot_digest = hashlib.sha256(_stable(hot)).hexdigest()
    map_name = str(hot["header"].get("map_name") or "unknown").replace("'", "")
    match_id = sql(db, "INSERT INTO public.matches (upload_id,platform,map,rounds,canonical_status,finished,terminal,"
                   "round_count,canonical_source,quality,demo_metadata) VALUES "
                   f"('{ident(claim['upload_id'])}','demo','{map_name}',{len(hot['rounds'])},'completed',true,true,"
                   f"{len(hot['rounds'])},'demo',{json_expr(hot['quality'])},"
                   f"{json_expr({'hot_digest': hot_digest, 'raw_artifact_id': raw['artifact_id'], 'raw_root_digest': raw['root_digest'], 'parser_execution_id': parsed['parser_execution_id']})}) RETURNING id;")
    metadata = {"job_id": claim["job_id"], "attempt_number": claim["attempt_number"],
                "raw_artifact_id": raw["artifact_id"], "raw_root_digest": raw["root_digest"],
                "hot_digest": hot_digest, "parser_execution_id": parsed["parser_execution_id"],
                "hot_measurements": hot_payload_measurements(hot)}
    match_source_id = sql(db, "INSERT INTO public.match_sources "
        "(match_id,source,source_contract_version,source_version,fetched_at,status,quality,fingerprint,upload_id,metadata) VALUES "
        f"('{match_id}','demo','1','{parsed['parser_version']}',now(),'complete',"
        f"{json_expr(hot['quality'])},'{hot_digest}','{ident(claim['upload_id'])}',{json_expr(metadata)}) RETURNING id;")
    terminal_payload = {"match_id": match_id, "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "duration_ms": max(1, round((parsed["parser_finish"] - parsed["parser_start"]) * 1000)),
                        "parser_name": "demoparser2", "parser_version": parsed["parser_version"],
                        "parser_revision": "0.42.0", "schema_version": 1, "analysis_version": "r11.2",
                        "rounds_detected": parsed["rounds"], "rounds_valid": parsed["rounds"],
                        "players_detected": parsed["players"], "events_detected": parsed["events"],
                        "extraction_confidence": 1, "partial_parse": False, "quality_flags": []}
    if sql(db, f"SELECT public.finish_demo_job_processed('{ident(claim['job_id'])}',{json_expr(terminal_payload)});") != "t":
        raise RuntimeError("R11_FINISHED_REJECTED")
    snapshot = row_json(db, "SELECT id,upload_id,status,stage,match_id,attempt_number,finished_at "
                        f"FROM public.demo_jobs WHERE id='{ident(claim['job_id'])}'")
    if snapshot["status"] != "processed" or snapshot["match_id"] != match_id:
        raise RuntimeError("R11_FINISHED_STATE_MISMATCH")
    # matches.id is generated by the disposable database schema and is not part of the UUID identity contract.
    # Preserve its native textual representation for match_sources and finish_demo_job_processed;
    # coercing it through ident() incorrectly assumes the column is UUID.
    return {"hot_identity": {"schema_version": hot["schema_version"],
                              "demo": hot["demo"], "parser": hot["parser"],
                              "raw": hot["raw"], "quality": hot["quality"]},
            "hot_digest": hot_digest, "match_id": match_id,
            "match_source_id": match_source_id, "terminal": snapshot}


def acknowledge(db: dict[str, str], claim: dict) -> dict:
    before = sql(db, f"SELECT count(*) FROM pgmq.q_demo_parse WHERE msg_id={int(claim['message_id'])};")
    archived = sql(db, f"SELECT pgmq.archive('demo_parse',{int(claim['message_id'])});")
    after = sql(db, f"SELECT count(*) FROM pgmq.q_demo_parse WHERE msg_id={int(claim['message_id'])};")
    archive_count = sql(db, f"SELECT count(*) FROM pgmq.a_demo_parse WHERE msg_id={int(claim['message_id'])};")
    if archived != "t" or before != "1" or after != "0" or archive_count != "1":
        raise RuntimeError("R11_ACK_STATE_MISMATCH")
    return {"message_id": int(claim["message_id"]), "queue_before": int(before),
            "archive_result": True, "queue_after": int(after), "archive_count": int(archive_count),
            "acknowledged_at": time.time()}


def run_integrated(db: dict[str, str], api_url: str, key: str, claim: dict,
                   worker_id: str, parsed: dict, acknowledge_message: bool = True) -> dict:
    raw, reconstructed = asyncio.run(persist_raw(db, api_url, key, claim, worker_id, parsed))
    completed = persist_hot_and_finish(db, claim, parsed, raw, reconstructed)
    reconstruction_summary = {"artifact": reconstructed["artifact"],
                              "chunks": reconstructed["chunks"],
                              "manifest": reconstructed["manifest"],
                              "storage": reconstructed["storage"],
                              "snapshot_digest": reconstructed["snapshot_digest"]}
    result = {"raw": raw, "raw_reconstruction": reconstruction_summary, **completed,
              "checkpoint": "FINISHED_BEFORE_ACK", "parser_execution_count": 1}
    if acknowledge_message:
        result["ack"] = acknowledge(db, claim)
        result["checkpoint"] = "ACKNOWLEDGED"
    return result