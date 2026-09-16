"""Incremental JSONL-gzip RAW artifact writer for the private managed Storage bucket."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import chain
from typing import Any, Iterable
from urllib.parse import quote

import httpx

logger = logging.getLogger("cs2-demo-parser")
RAW_BUCKET = "cs2-raw-evidence"
RAW_SCHEMA_VERSION = 1
CHUNK_TARGET_BYTES = 4 * 1024 * 1024
CHUNK_HARD_MAX_BYTES = 8 * 1024 * 1024
SECTION_ORDER = (
    "header", "players", "rounds", "events", "ticks", "grenades", "player-info",
    "game-state", "economy", "forensic",
)


@dataclass(frozen=True)
class ArtifactContext:
    job_id: str
    upload_id: str
    user_id: str
    attempt_number: int
    demo_sha256: str
    parser: dict[str, Any]
    contract_version: int


def _stable(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _records(value: Any) -> Iterable[Any]:
    if isinstance(value, list):
        yield from value
    elif value is not None:
        yield value


def _section_payloads(evidence: dict[str, Any]) -> dict[str, Iterable[Any]]:
    manifest = evidence.get("manifest") or {}
    return {
        "header": [manifest.get("raw_header") or {}],
        "players": evidence.get("raw_player_info") or [],
        "rounds": evidence.get("round_evidence") or [],
        "events": evidence.get("raw_events") or [],
        "ticks": evidence.get("tick_samples") or [],
        "grenades": evidence.get("grenade_samples") or [],
        "player-info": evidence.get("player_coverage") or [],
        "game-state": chain(evidence.get("tick_coverage") or [], evidence.get("grenade_coverage") or []),
        "economy": evidence.get("economy_coverage") or [],
        "forensic": [
            {
                "event_coverage": evidence.get("event_coverage") or [],
                "field_mappings": evidence.get("field_mappings") or [],
                "gates": evidence.get("gates") or [],
                "forensic_inventory": evidence.get("forensic_inventory") or {},
                "raw_status": evidence.get("raw_status"),
                "raw_audit_status": evidence.get("raw_audit_status"),
                "raw_block_reasons": evidence.get("raw_block_reasons") or [],
            }
        ],
    }


def _now() -> str:
    return datetime.now(UTC).isoformat()


class RawArtifactWriter:
    def __init__(self, *, backend_url: str, service_key: str, context: ArtifactContext,
                 client: httpx.Client | None = None) -> None:
        self.backend_url = backend_url.rstrip("/")
        self.service_key = service_key
        self.context = context
        self.client = client or httpx.Client(timeout=120.0, follow_redirects=False)
        self._owns_client = client is None
        self.headers = {"apikey": service_key, "authorization": f"Bearer {service_key}"}
        self.prefix = f"{context.user_id}/{context.upload_id}/attempt-{context.attempt_number}"

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def _rest(self, method: str, table: str, **kwargs: Any) -> httpx.Response:
        headers = {**self.headers, **kwargs.pop("headers", {})}
        response = self.client.request(method, f"{self.backend_url}/rest/v1/{table}", headers=headers, **kwargs)
        response.raise_for_status()
        return response

    def _existing(self) -> dict[str, Any] | None:
        response = self._rest("GET", "raw_evidence_artifacts", params={
            "job_id": f"eq.{self.context.job_id}", "select": "*", "limit": "1",
        })
        rows = response.json()
        return rows[0] if isinstance(rows, list) and rows else None

    def _create(self) -> dict[str, Any]:
        existing = self._existing()
        if existing:
            if (existing.get("upload_id") != self.context.upload_id or
                    existing.get("demo_sha256") != self.context.demo_sha256.lower() or
                    existing.get("attempt_number") != self.context.attempt_number):
                raise RuntimeError("RAW_ARTIFACT_IDENTITY_CONFLICT")
            return existing
        response = self._rest("POST", "raw_evidence_artifacts", headers={"Prefer": "return=representation"}, json={
            "job_id": self.context.job_id, "upload_id": self.context.upload_id,
            "user_id": self.context.user_id, "attempt_number": self.context.attempt_number,
            "demo_sha256": self.context.demo_sha256.lower(), "storage_bucket": RAW_BUCKET,
            "storage_prefix": self.prefix, "manifest_storage_path": f"{self.prefix}/manifest.json",
            "schema_version": RAW_SCHEMA_VERSION, "status": "creating", "raw_status": "pending",
            "audit_status": "pending",
        })
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise RuntimeError("RAW_ARTIFACT_CREATE_FAILED")
        logger.info("raw_artifact_create artifact=%s", rows[0]["id"])
        return rows[0]

    def _patch_artifact(self, artifact_id: str, values: dict[str, Any]) -> None:
        self._rest("PATCH", "raw_evidence_artifacts", params={"id": f"eq.{artifact_id}"},
                   headers={"Prefer": "return=minimal"}, json=values)

    def _upload_verified(self, path: str, body: bytes) -> None:
        encoded = quote(path, safe="/")
        response = self.client.post(f"{self.backend_url}/storage/v1/object/{RAW_BUCKET}/{encoded}",
                                    headers={**self.headers, "content-type": "application/gzip", "x-upsert": "true"}, content=body)
        response.raise_for_status()
        verify = self.client.get(f"{self.backend_url}/storage/v1/object/authenticated/{RAW_BUCKET}/{encoded}", headers=self.headers)
        verify.raise_for_status()
        if hashlib.sha256(verify.content).hexdigest() != hashlib.sha256(body).hexdigest():
            raise RuntimeError("RAW_CHUNK_VERIFY_FAILED")

    def _upload_manifest(self, path: str, body: bytes) -> None:
        encoded = quote(path, safe="/")
        response = self.client.post(f"{self.backend_url}/storage/v1/object/{RAW_BUCKET}/{encoded}",
                                    headers={**self.headers, "content-type": "application/json", "x-upsert": "true"}, content=body)
        response.raise_for_status()

    def _store_chunk(self, artifact_id: str, section: str, index: int, rows: list[bytes],
                     first_row: int, previous: str | None) -> dict[str, Any]:
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as stream:
            for row in rows:
                stream.write(row)
        body = buffer.getvalue()
        if len(body) > CHUNK_HARD_MAX_BYTES:
            raise RuntimeError("RAW_CHUNK_TOO_LARGE")
        sha256 = hashlib.sha256(body).hexdigest()
        path = f"{self.prefix}/{section}/chunk-{index:06d}.jsonl.gz"
        self._rest("POST", "raw_evidence_chunks", headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                   params={"on_conflict": "artifact_id,section,chunk_index"}, json={
                       "artifact_id": artifact_id, "section": section, "chunk_index": index,
                       "storage_path": path, "first_row": first_row,
                       "last_row": first_row + len(rows) - 1, "row_count": len(rows),
                       "byte_size": len(body), "sha256": sha256,
                       "previous_chunk_sha256": previous, "status": "uploading",
                   })
        self._upload_verified(path, body)
        self._rest("PATCH", "raw_evidence_chunks",
                   params={"artifact_id": f"eq.{artifact_id}", "section": f"eq.{section}", "chunk_index": f"eq.{index}"},
                   headers={"Prefer": "return=minimal"},
                   json={"status": "verified", "uploaded_at": _now(), "verified_at": _now()})
        logger.info("raw_chunk_stored section=%s chunk=%s rows=%s bytes=%s sha=%s",
                    section, index, len(rows), len(body), sha256[:12])
        return {"section": section, "chunk_index": index, "storage_path": path,
                "first_row": first_row, "last_row": first_row + len(rows) - 1,
                "row_count": len(rows), "byte_size": len(body), "sha256": sha256,
                "previous_chunk_sha256": previous}

    def write(self, evidence: dict[str, Any]) -> dict[str, Any]:
        artifact = self._create()
        if artifact.get("status") == "ready":
            return self._reference(artifact)
        artifact_id = str(artifact["id"])
        self._patch_artifact(artifact_id, {"status": "uploading", "raw_status": "writing", "audit_status": "running"})
        chunks: list[dict[str, Any]] = []
        previous: str | None = None
        try:
            sections = _section_payloads(evidence)
            for section in SECTION_ORDER:
                logger.info("raw_section_start section=%s", section)
                pending: list[bytes] = []
                raw_bytes = 0
                first_row = 0
                chunk_index = 0
                for row_number, record in enumerate(_records(sections[section])):
                    line = _stable(record) + b"\n"
                    if len(gzip.compress(line, mtime=0)) > CHUNK_HARD_MAX_BYTES:
                        raise RuntimeError("RAW_RECORD_TOO_LARGE")
                    pending.append(line)
                    raw_bytes += len(line)
                    if raw_bytes >= CHUNK_TARGET_BYTES:
                        chunk = self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                        chunks.append(chunk); previous = chunk["sha256"]
                        first_row = row_number + 1; chunk_index += 1; pending = []; raw_bytes = 0
                if pending:
                    chunk = self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                    chunks.append(chunk); previous = chunk["sha256"]
                logger.info("raw_section_complete section=%s chunks=%s", section,
                            sum(1 for item in chunks if item["section"] == section))
                raw_key = {
                    "players": "raw_player_info", "rounds": "round_evidence",
                    "events": "raw_events", "ticks": "tick_samples",
                    "grenades": "grenade_samples", "player-info": "player_coverage",
                    "economy": "economy_coverage",
                }.get(section)
                if raw_key:
                    evidence[raw_key] = []
                if section == "game-state":
                    evidence["tick_coverage"] = []
                    evidence["grenade_coverage"] = []
            summaries = []
            for section in SECTION_ORDER:
                own = [item for item in chunks if item["section"] == section]
                summaries.append({"name": section, "chunk_count": len(own),
                                  "row_count": sum(item["row_count"] for item in own),
                                  "byte_count": sum(item["byte_size"] for item in own),
                                  "digest": hashlib.sha256(_stable([item["sha256"] for item in own])).hexdigest()})
            root_digest = hashlib.sha256(_stable(summaries)).hexdigest()
            manifest = {
                "schema_version": RAW_SCHEMA_VERSION, "demo_sha256": self.context.demo_sha256.lower(),
                "upload_id": self.context.upload_id, "job_id": self.context.job_id,
                "attempt_number": self.context.attempt_number, "parser": self.context.parser,
                "contract_version": self.context.contract_version, "sections": summaries,
                "root_digest": root_digest, "created_at": artifact.get("created_at"), "status": "ready",
                "raw_status": "ready", "audit_status": "approved" if evidence.get("raw_audit_status") == "APPROVED" else "blocked",
                "raw_block_reasons": evidence.get("raw_block_reasons") or [],
            }
            manifest_path = f"{self.prefix}/manifest.json"
            self._upload_manifest(manifest_path, _stable(manifest))
            totals = {"total_chunks": len(chunks), "total_rows": sum(c["row_count"] for c in chunks),
                      "total_bytes": sum(c["byte_size"] for c in chunks)}
            audit_status = manifest["audit_status"]
            self._patch_artifact(artifact_id, {**totals, "status": "ready", "raw_status": "ready",
                                              "audit_status": audit_status, "root_digest": root_digest,
                                              "ready_at": _now()})
            ready = {**artifact, **totals, "status": "ready", "raw_status": "ready",
                     "audit_status": audit_status, "root_digest": root_digest,
                     "manifest_storage_path": manifest_path}
            logger.info("raw_artifact_ready artifact=%s chunks=%s rows=%s bytes=%s digest=%s",
                        artifact_id, totals["total_chunks"], totals["total_rows"], totals["total_bytes"], root_digest[:12])
            return self._reference(ready)
        except Exception as error:
            self._patch_artifact(artifact_id, {"status": "failed", "raw_status": "failed", "audit_status": "failed",
                                              "error_code": type(error).__name__, "error_message": str(error)[:300],
                                              "failed_at": _now()})
            raise

    def _reference(self, artifact: dict[str, Any]) -> dict[str, Any]:
        return {"schema_version": RAW_SCHEMA_VERSION, "artifact_id": artifact["id"],
                "bucket": artifact.get("storage_bucket", RAW_BUCKET),
                "manifest_storage_path": artifact["manifest_storage_path"],
                "root_digest": artifact["root_digest"], "status": artifact["status"],
                "raw_status": artifact["raw_status"], "audit_status": artifact["audit_status"],
                "job_id": self.context.job_id, "upload_id": self.context.upload_id,
                "user_id": self.context.user_id, "attempt_number": self.context.attempt_number,
                "demo_sha256": self.context.demo_sha256.lower(), "parser": self.context.parser,
                "contract_version": self.context.contract_version,
                "total_chunks": artifact.get("total_chunks", 0), "total_rows": artifact.get("total_rows", 0),
                "total_bytes": artifact.get("total_bytes", 0)}
