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

    async def write(self, evidence: dict[str, Any]) -> dict[str, Any]:
        artifact = await self.bridge("raw-artifact-init", {})
        if artifact.get("status") == "ready":
            return self._reference(artifact)
        artifact_id = str(artifact["id"])
        chunks: list[dict[str, Any]] = []
        previous: str | None = None
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
                    chunk = await self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                    chunks.append(chunk); previous = chunk["sha256"]
                    first_row = row_number + 1; chunk_index += 1; pending = []; raw_bytes = 0
            if pending:
                chunk = await self._store_chunk(artifact_id, section, chunk_index, pending, first_row, previous)
                chunks.append(chunk); previous = chunk["sha256"]
            logger.info("raw_section_complete section=%s chunks=%s", section,
                        sum(1 for item in chunks if item["section"] == section))
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
        manifest = {"schema_version": RAW_SCHEMA_VERSION, "demo_sha256": self.context.demo_sha256.lower(),
                    "upload_id": self.context.upload_id, "job_id": self.context.job_id,
                    "attempt_number": self.context.attempt_number, "parser": self.context.parser,
                    "contract_version": self.context.contract_version, "sections": summaries,
                    "root_digest": root_digest, "created_at": artifact.get("created_at"), "status": "ready",
                    "raw_status": "ready",
                    "audit_status": "approved" if evidence.get("raw_audit_status") == "APPROVED" else "blocked",
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
