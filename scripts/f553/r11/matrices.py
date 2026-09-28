"""Real-operation R11.2 disposable evidence matrices.

All cases execute against the local disposable Supabase stack only. The matrices
contain observations produced by real PostgreSQL/pgmq/Storage operations; they
are not synthetic PASS records.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import time
from pathlib import Path
import urllib.error
import urllib.request

from f553.r11.lifecycle import sql

PHASE = "F.5.3-CLOSURE.8-R11.2"
VERSION = 12
ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/release-gates"


def _digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _http(api_url: str, key: str, path: str, method: str = "GET", body: bytes | None = None,
          content_type: str = "application/octet-stream") -> tuple[int, bytes]:
    if not api_url.startswith("http://localhost:54321") and not api_url.startswith("http://127.0.0.1:54321"):
        raise RuntimeError("R11_MATRIX_NONLOCAL_API_REFUSED")
    req = urllib.request.Request(
        api_url.rstrip("/") + path,
        data=body,
        method=method,
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"R11_MATRIX_HTTP_{exc.code}:{path}") from exc


def _base(evidence: dict, name: str, cases: list[dict]) -> dict:
    return {
        "phase": PHASE,
        "evidence_version": VERSION,
        "run_id": evidence["run_id"],
        "commit_sha": evidence["commit_sha"],
        "workflow_run_id": evidence["workflow_run_id"],
        "workflow_run_attempt": evidence["workflow_run_attempt"],
        "workflow": evidence["workflow"],
        "job": evidence["job"],
        "ref": evidence["ref"],
        "matrix": name,
        "executed": True,
        "case_count": len(cases),
        "cases": cases,
    }


def _case(provenance: dict, case_id: str, fixture_id: str, category: str,
          operation: str, before: object, after: object, result: str, **extra) -> dict:
    return {
        "case_id": case_id,
        "fixture_id": fixture_id,
        "category": category,
        "operation": operation,
        "executed": True,
        "result": result,
        "before_digest": _digest(before),
        "after_digest": _digest(after),
        "evidence": extra,
        "timestamp": time.time(),
        **provenance,
    }


def _provenance(evidence: dict) -> dict:
    return {k: evidence[k] for k in (
        "run_id", "commit_sha", "workflow_run_id", "workflow_run_attempt",
        "workflow", "job", "ref"
    )}


def run_race_matrix(db: dict, evidence: dict) -> dict:
    provenance = _provenance(evidence)
    cases = []
    for i in range(50):
        queue = f"r11_race_{evidence['run_id'].replace('-', '')[:12]}_{i:02d}"
        sql(db, f"SELECT pgmq.create('{queue}');")
        try:
            msg = sql(db, f"SELECT pgmq.send('{queue}', '{{"case":{i}}}'::jsonb);")

            def read_once() -> str:
                return sql(db, f"SELECT msg_id FROM pgmq.read('{queue}', 30, 1);")

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                first, second = pool.map(lambda _: read_once(), (0, 1))
            winner = [value for value in (first, second) if value]
            loser = [value for value in (first, second) if not value]
            archive = sql(db, f"SELECT pgmq.archive('{queue}', {msg});")
            after = {
                "first": first,
                "second": second,
                "winner_count": len(winner),
                "loser_count": len(loser),
                "archive": archive,
                "queued": sql(db, f"SELECT count(*) FROM pgmq.q_{queue} WHERE msg_id={msg};"),
                "archived": sql(db, f"SELECT count(*) FROM pgmq.a_{queue} WHERE msg_id={msg};"),
            }
            passed = (
                len(winner) == 1 and len(loser) == 1
                and winner[0] == msg and archive == "t"
                and after["queued"] == "0" and after["archived"] == "1"
            )
            cases.append(_case(
                provenance, f"RACE-{i+1:03d}", queue, "pgmq_claim_visibility_race",
                "two_concurrent_reads_one_message", {"message_id": msg},
                after, "PASS" if passed else "FAIL",
                queue=queue, first=first, second=second, winner_count=len(winner),
                loser_count=len(loser), archive=archive,
            ))
            if not passed:
                raise RuntimeError(f"R11_RACE_CASE_FAILED:{i+1}")
        finally:
            sql(db, f"SELECT pgmq.drop_queue('{queue}');")
    result = _base(evidence, "race", cases)
    (DOCS / "f553-r11-race-matrix.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def run_failure_matrix(db: dict, evidence: dict, lifecycle: dict) -> dict:
    provenance = _provenance(evidence)
    cases = []
    identity = lifecycle["identity"]
    for i in range(50):
        mode = i % 5
        if mode == 0:
            queue = f"r11_fail_dup_archive_{evidence['run_id'].replace('-', '')[:10]}_{i:02d}"
            sql(db, f"SELECT pgmq.create('{queue}');")
            try:
                msg = sql(db, f"SELECT pgmq.send('{queue}', '{{"failure_case":{i}}}'::jsonb);")
                first = sql(db, f"SELECT pgmq.archive('{queue}', {msg});")
                second = sql(db, f"SELECT pgmq.archive('{queue}', {msg});")
                before = {"message_id": msg, "first_archive": first}
                after = {"second_archive": second,
                         "archived": sql(db, f"SELECT count(*) FROM pgmq.a_{queue} WHERE msg_id={msg};")}
                passed = first == "t" and second == "f" and after["archived"] == "1"
                fixture_id = queue
            finally:
                sql(db, f"SELECT pgmq.drop_queue('{queue}');")
            cases.append(_case(provenance, f"FAIL-{i+1:03d}", fixture_id,
                               "ack_duplicate", "archive_same_message_twice",
                               before, after, "PASS" if passed else "FAIL",
                               queue=queue, first_archive=first, second_archive=second))
        elif mode == 1:
            queue = f"r11_fail_missing_archive_{evidence['run_id'].replace('-', '')[:10]}_{i:02d}"
            sql(db, f"SELECT pgmq.create('{queue}');")
            try:
                missing_id = str(900000000 + i)
                before = {"message_id": missing_id, "queue": queue}
                result = sql(db, f"SELECT pgmq.archive('{queue}', {missing_id});")
                after = {"archive_result": result,
                         "queue_rows": sql(db, f"SELECT count(*) FROM pgmq.q_{queue};")}
                passed = result == "f" and after["queue_rows"] == "0"
            finally:
                sql(db, f"SELECT pgmq.drop_queue('{queue}');")
            cases.append(_case(provenance, f"FAIL-{i+1:03d}", queue,
                               "ack_missing_message", "archive_nonexistent_message",
                               before, after, "PASS" if passed else "FAIL",
                               queue=queue, missing_message_id=missing_id))
        elif mode == 2:
            queue = f"r11_fail_empty_read_{evidence['run_id'].replace('-', '')[:10]}_{i:02d}"
            sql(db, f"SELECT pgmq.create('{queue}');")
            try:
                before = {"queue": queue, "queued": sql(db, f"SELECT count(*) FROM pgmq.q_{queue};")}
                result = sql(db, f"SELECT msg_id FROM pgmq.read('{queue}', 1, 1);")
                after = {"read_result": result}
                passed = result == ""
            finally:
                sql(db, f"SELECT pgmq.drop_queue('{queue}');")
            cases.append(_case(provenance, f"FAIL-{i+1:03d}", queue,
                               "queue_empty_delivery", "read_empty_queue",
                               before, after, "PASS" if passed else "FAIL",
                               queue=queue, read_result=result))
        elif mode == 3:
            before = {"job_status": sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{identity['job_id']}';")}
            result = sql(db, "SELECT public.fail_demo_parse_message("
                             f"'{identity['job_id']}'::uuid,{int(identity['message_id'])},"
                             f"{int(identity['attempt_number'])},'r11-matrix-stale-{i}',"
                             "'MATRIX_DUPLICATE_AFTER_TERMINAL','expected terminal rejection',true);")
            after = {"function_result": result,
                     "job_status": sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{identity['job_id']}';")}
            parsed = json.loads(result)
            passed = parsed.get("accepted") is False and after["job_status"] == "processed"
            cases.append(_case(provenance, f"FAIL-{i+1:03d}", identity["upload_id"],
                               "terminal_replay_rejection", "fail_processed_job",
                               before, after, "PASS" if passed else "FAIL",
                               job_id=identity["job_id"], message_id=identity["message_id"],
                               accepted=parsed.get("accepted")))
        else:
            before = {"job_status": sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{identity['job_id']}';")}
            raw = sql(db, f"SELECT public.enqueue_demo_job('{identity['upload_id']}'::uuid,'{identity['user_id']}'::uuid);")
            after = {"enqueue_result": raw,
                     "job_status": sql(db, f"SELECT status FROM public.demo_jobs WHERE id='{identity['job_id']}';")}
            parsed = json.loads(raw)
            passed = parsed.get("queued") is False and parsed.get("duplicate") is True and parsed.get("status") == "processed"
            cases.append(_case(provenance, f"FAIL-{i+1:03d}", identity["upload_id"],
                               "terminal_enqueue_rejection", "enqueue_processed_job",
                               before, after, "PASS" if passed else "FAIL",
                               job_id=identity["job_id"], enqueue=parsed))
        if cases[-1]["result"] != "PASS":
            raise RuntimeError(f"R11_FAILURE_CASE_FAILED:{i+1}")
    result = _base(evidence, "failure", cases)
    (DOCS / "f553-r11-failure-matrix.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def _mutate(data: bytes, index: int) -> bytes:
    b = bytearray(data)
    if not b:
        return b"\x00"
    mode = index % 16
    if mode == 0: b[0] ^= 0xFF
    elif mode == 1: b[len(b)//2] ^= 0x01
    elif mode == 2: b[-1] ^= 0x80
    elif mode == 3: b = b[:-1]
    elif mode == 4: b = b[:max(1, len(b)//2)]
    elif mode == 5: b.extend(b"R11")
    elif mode == 6: b = b"R11" + b
    elif mode == 7: b[:32] = bytes(32)
    elif mode == 8: b[:64] = reversed(b[:64])
    elif mode == 9: b[0], b[-1] = b[-1], b[0]
    elif mode == 10: b[:2] = b"ZZ"
    elif mode == 11: b[-4:] = b"R11!"
    elif mode == 12: b.insert(len(b)//2, 0x7F)
    elif mode == 13: del b[len(b)//2]
    elif mode == 14:
        for p in range(0, len(b), 17): b[p] ^= 0x55
    else:
        b = b[1:] + b[:1]
    return bytes(b)


def run_raw_corruption_matrix(db: dict, api_url: str, key: str, evidence: dict,
                              lifecycle: dict) -> dict:
    provenance = _provenance(evidence)
    worker = lifecycle["worker"]
    artifact_id = worker["raw"]["artifact_id"]
    chunk = json.loads(sql(db, "SELECT row_to_json(c) FROM public.raw_evidence_chunks c "
                           f"WHERE artifact_id='{artifact_id}' ORDER BY section,chunk_index LIMIT 1;"))
    status, original = _http(api_url, key, "/storage/v1/object/cs2-raw-evidence/" + chunk["storage_path"])
    if status != 200:
        raise RuntimeError("R11_RAW_MATRIX_SOURCE_READ_FAILED")
    expected_sha = chunk["sha256"]
    cases = []
    for i in range(16):
        mutated = _mutate(original, i)
        path = f"r11-disposable/{evidence['run_id']}/corruption/{artifact_id}/{i:02d}.bin"
        endpoint = "/storage/v1/object/cs2-raw-evidence/" + path
        write_status, _ = _http(api_url, key, endpoint, "POST", mutated)
        read_status, read_back = _http(api_url, key, endpoint)
        observed_sha = hashlib.sha256(read_back).hexdigest()
        mismatch = len(read_back) != int(chunk["byte_size"]) or observed_sha != expected_sha
        before = {"expected_size": int(chunk["byte_size"]), "expected_sha256": expected_sha}
        after = {"observed_size": len(read_back), "observed_sha256": observed_sha, "mismatch": mismatch}
        cases.append(_case(
            provenance, f"RAW-{i+1:02d}", path, "raw_integrity_corruption",
            "mutate_upload_readback_compare", before, after, "PASS" if write_status in (200,201)
            and read_status == 200 and read_back == mutated and mismatch else "FAIL",
            artifact_id=artifact_id, section=chunk["section"], chunk_index=chunk["chunk_index"],
            storage_path=path, write_status=write_status, read_status=read_status,
            original_size=int(chunk["byte_size"]), mutated_size=len(read_back),
            original_sha256=expected_sha, mutated_sha256=observed_sha,
        ))
        try:
            _http(api_url, key, endpoint, "DELETE")
        except RuntimeError:
            pass
        if cases[-1]["result"] != "PASS":
            raise RuntimeError(f"R11_RAW_CORRUPTION_CASE_FAILED:{i+1}")
    result = _base(evidence, "raw-corruption", cases)
    result["source_artifact_id"] = artifact_id
    result["source_chunk"] = {"section": chunk["section"], "chunk_index": chunk["chunk_index"],
                              "storage_path": chunk["storage_path"], "sha256": expected_sha,
                              "byte_size": int(chunk["byte_size"])}
    (DOCS / "f553-r11-raw-corruption-matrix.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def run_all(db: dict, api_url: str, key: str, evidence: dict, lifecycle: dict) -> dict:
    return {
        "race": run_race_matrix(db, evidence),
        "failure": run_failure_matrix(db, evidence, lifecycle),
        "raw-corruption": run_raw_corruption_matrix(db, api_url, key, evidence, lifecycle),
    }
