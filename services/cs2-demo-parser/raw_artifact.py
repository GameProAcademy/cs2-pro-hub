"""Incremental JSONL-gzip RAW artifact writer for the private managed Storage bucket."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import logging
import math
import resource
import time
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
RAW_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024 * 1024
MAX_CHUNKS_PER_SECTION = 100_000
MAX_CHUNKS_TOTAL = 200_000
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


def _json_safe(value: Any) -> Any:
    """Normalize only values JSON cannot represent, without mutating parser data."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _stable(value: Any) -> bytes:
    return json.dumps(
        _json_safe(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _records(value: Any) -> Iterable[Any]:
    if value is None:
        return
    if isinstance(value, dict) or isinstance(value, (str, bytes)):
        yield value
        return
    try:
        yield from value
    except TypeError:
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


def _audit_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    """Small, deterministic evidence summary; the APP owns the final decision."""
    return {
        "raw_status": evidence.get("raw_status"),
        "raw_audit_status": evidence.get("raw_audit_status"),
        "raw_block_reasons": sorted(str(item) for item in (evidence.get("raw_block_reasons") or [])),
        "gates": sorted(
            ({"gate": str(item.get("gate")), "status": str(item.get("status"))}
             for item in (evidence.get("gates") or []) if isinstance(item, dict)),
            key=lambda item: item["gate"],
        ),
        "field_mappings": sorted(
            ({"raw_field": str(item.get("raw_field")), "status": str(item.get("status")),
              "reason_present": bool(str(item.get("reason") or "").strip())}
             for item in (evidence.get("field_mappings") or []) if isinstance(item, dict)),
            key=lambda item: item["raw_field"],
        ),
    }


def _audit_evidence_digest(evidence: dict[str, Any]) -> str:
    return hashlib.sha256(_stable(_audit_evidence(evidence))).hexdigest()


def _grenade_measurements(rows: Any) -> dict[str, Any]:
    records = [row for row in (rows or []) if isinstance(row, dict)]
    identity_field = next((field for field in ("entity_id", "grenade_id", "projectile_id")
                           if any(row.get(field) is not None for row in records)), None)
    result: dict[str, Any] = {"rows": len(records), "identity_field": identity_field}
    if identity_field is not None:
        counts: dict[str, int] = {}
        for row in records:
            value = row.get(identity_field)
            if value is not None:
                key = str(value)
                counts[key] = counts.get(key, 0) + 1
        result.update({
            "distinct_projectiles": len(counts),
            "average_rows_per_projectile": round(sum(counts.values()) / len(counts), 3) if counts else None,
            "maximum_rows_per_projectile": max(counts.values(), default=None),
        })
    return result


class RawArtifactWriter:
    def __init__(self, *, context: ArtifactContext, bridge, client: httpx.AsyncClient) -> None:
        self.context = context
        self.bridge = bridge
        self.client = client

    async def _store_chunk(self, artifact_id: str, section: str, index: int, rows: list[bytes],
                           first_row: int, previous: str | None) -> dict[str, Any]:
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as stream:
            for row in rows:
                stream.write(row)
        body = buffer.getvalue()
        if len(body) > CHUNK_HARD_MAX_BYTES:
            raise RuntimeError("RAW_CHUNK_TOO_LARGE")
        sha256 = hashlib.sha256(body).hexdigest()
        metadata = {
            "artifactId": artifact_id, "section": section, "chunkIndex": index,
            "firstRow": first_row, "lastRow": first_row + len(rows) - 1,
            "rowCount": len(rows), "byteSize": len(body), "sha256": sha256,
            "previousChunkSha256": previous,
        }
        prepared = await self.bridge("raw-chunk-prepare", metadata)
        if not prepared.get("alreadyVerified"):
            response = await self.client.put(
                prepared["uploadUrl"], content=body,
                headers={"content-type": "application/gzip", "x-upsert": "true"},
            )
            response.raise_for_status()
            await self.bridge("raw-chunk-verify", {
                "artifactId": artifact_id, "section": section, "chunkIndex": index,
            })
        logger.info("raw_chunk_stored section=%s chunk=%s rows=%s bytes=%s sha=%s",
                    section, index, len(rows), len(body), sha256[:12])
        return {"section": section, "chunk_index": index, "storage_path": prepared["path"],
                "first_row": first_row, "last_row": first_row + len(rows) - 1,
                "row_count": len(rows), "byte_size": len(body), "sha256": sha256,
                "previous_chunk_sha256": previous}

    async def write(self, evidence: dict[str, Any], performance: dict[str, Any] | None = None) -> dict[str, Any]:
        started = time.perf_counter()
        artifact = await self.bridge("raw-artifact-init", {})
        if artifact.get("status") == "ready":
            return self._reference(artifact)
        artifact_id = str(artifact["id"])
        if artifact.get("recovered"):
            logger.info("raw_artifact_recovery artifact=%s", artifact_id)
        chunks: list[dict[str, Any]] = []
        section_measurements: dict[str, dict[str, int]] = {}
        grenade_measurements = _grenade_measurements(evidence.get("grenade_samples"))
        previous: str | None = None
        sections = _section_payloads(evidence)
        for section in SECTION_ORDER:
            logger.info("raw_section_start section=%s", section)
            pending: list[bytes] = []
            raw_bytes = 0
            section_uncompressed_bytes = 0
            first_row = 0
            chunk_index = 0
            for row_number, record in enumerate(_records(sections[section])):
                line = _stable(record) + b"\n"
                section_uncompressed_bytes += len(line)
                if len(gzip.compress(line, mtime=0)) > CHUNK_HARD_MAX_BYTES:
                    raise RuntimeError("RAW_RECORD_TOO_LARGE")
                pending.append(line)
                raw_bytes += len(line)
                if raw_bytes >= CHUNK_TARGET_BYTES:
                    if chunk_index >= MAX_CHUNKS_PER_SECTION or len(chunks) >= MAX_CHUNKS_TOTAL:
                        raise RuntimeError("RAW_CHUNK_LIMIT_EXCEEDED")
                    chunk = await self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                    chunks.append(chunk); previous = chunk["sha256"]
                    if sum(item["byte_size"] for item in chunks) > RAW_ARTIFACT_MAX_BYTES:
                        raise RuntimeError("RAW_ARTIFACT_TOO_LARGE")
                    first_row = row_number + 1; chunk_index += 1; pending = []; raw_bytes = 0
            if pending:
                if chunk_index >= MAX_CHUNKS_PER_SECTION or len(chunks) >= MAX_CHUNKS_TOTAL:
                    raise RuntimeError("RAW_CHUNK_LIMIT_EXCEEDED")
                chunk = await self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                chunks.append(chunk); previous = chunk["sha256"]
                if sum(item["byte_size"] for item in chunks) > RAW_ARTIFACT_MAX_BYTES:
                    raise RuntimeError("RAW_ARTIFACT_TOO_LARGE")
            logger.info("raw_section_complete section=%s chunks=%s", section,
                        sum(1 for item in chunks if item["section"] == section))
            own_chunks = [item for item in chunks if item["section"] == section]
            section_measurements[section] = {
                "rows": sum(item["row_count"] for item in own_chunks),
                "uncompressed_bytes": section_uncompressed_bytes,
                "compressed_bytes": sum(item["byte_size"] for item in own_chunks),
                "chunks": len(own_chunks),
                "largest_chunk_bytes": max((item["byte_size"] for item in own_chunks), default=0),
            }
            section_measurements[section]["average_chunk_bytes"] = (
                round(section_measurements[section]["compressed_bytes"] / len(own_chunks))
                if own_chunks else 0
            )
            logger.info(
                "raw_section_metrics section=%s rows=%s uncompressed_bytes=%s compressed_bytes=%s chunks=%s largest_chunk_bytes=%s average_chunk_bytes=%s",
                section, *section_measurements[section].values(),
            )
            raw_key = {"players": "raw_player_info", "rounds": "round_evidence",
                       "events": "raw_events", "ticks": "tick_samples",
                       "grenades": "grenade_samples", "player-info": "player_coverage",
                       "economy": "economy_coverage"}.get(section)
            if raw_key:
                evidence[raw_key] = []
            if section == "game-state":
                evidence["tick_coverage"] = []; evidence["grenade_coverage"] = []
        summaries = []
        for section in SECTION_ORDER:
            own = [item for item in chunks if item["section"] == section]
            summaries.append({"name": section, "chunk_count": len(own),
                              "row_count": sum(item["row_count"] for item in own),
                              "byte_count": sum(item["byte_size"] for item in own),
                              "digest": hashlib.sha256(_stable([item["sha256"] for item in own])).hexdigest()})
        root_digest = hashlib.sha256(_stable(summaries)).hexdigest()
        audit_evidence = _audit_evidence(evidence)
        manifest = {"schema_version": RAW_SCHEMA_VERSION, "demo_sha256": self.context.demo_sha256.lower(),
                    "upload_id": self.context.upload_id, "job_id": self.context.job_id,
                    "attempt_number": self.context.attempt_number, "parser": self.context.parser,
                    "contract_version": self.context.contract_version, "sections": summaries,
                    "root_digest": root_digest, "created_at": artifact.get("created_at"), "status": "ready",
                    "raw_status": "ready",
                    # Informational only. The APP derives and persists the final
                    # decision from audit_evidence instead of trusting this field.
                    "audit_status": "approved" if evidence.get("raw_audit_status") == "APPROVED" else "blocked",
                    "audit_evidence": audit_evidence,
                    "audit_evidence_digest": _audit_evidence_digest(evidence),
                     "measurements": {
                         "sections": section_measurements,
                         "grenades": grenade_measurements,
                         "performance": {
                             **(performance or {}),
                             "raw_write_ms": round((time.perf_counter() - started) * 1000),
                             "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                         },
                     },
                    "raw_block_reasons": evidence.get("raw_block_reasons") or []}
        ready = await self.bridge("raw-artifact-finalize", {
            "artifactId": artifact_id, "rootDigest": root_digest, "manifest": manifest,
        })
        logger.info("raw_artifact_ready artifact=%s chunks=%s rows=%s bytes=%s digest=%s",
                    artifact_id, ready.get("total_chunks"), ready.get("total_rows"),
                    ready.get("total_bytes"), root_digest[:12])
        return self._reference(ready)

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
