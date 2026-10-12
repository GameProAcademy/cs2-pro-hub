"""Loopback edges for the end-to-end recovery probe.

Two forwarders, both bound to 127.0.0.1, both able to break a request at an
exact point. Neither implements any protocol logic: the bridge behind them is
the application's own TypeScript route handlers and the storage/REST API is the
local Supabase stack.

  BridgeEdge   worker -> (plain HTTP) -> bridge host
  ApiEdge      worker and bridge -> (TLS) -> local Supabase API

The API edge exists because the worker only downloads demos over https and a
local stack speaks http. It terminates TLS with a throwaway certificate created
for the run and forwards bytes unchanged.

Faults: `drop` closes the connection (before = the request never arrives,
after = it is processed and the answer is lost); `kill` SIGKILLs a process
group first (a real crash at that point).
"""
from __future__ import annotations

import http.client
import json
import os
import signal
import ssl
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
       "transfer-encoding", "upgrade", "content-length", "host"}


class Drop(Exception):
    pass


class Faults:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.items: list[dict] = []
        self.calls: list[dict] = []

    def arm(self, point: str, when: str, action: str = "drop", *, pid: int | None = None,
            worker: str | None = None, times: int = 1, after_bytes: int = 0) -> None:
        assert when in ("before", "after", "stream") and action in ("drop", "kill")
        with self.lock:
            self.items.append({"point": point, "when": when, "action": action, "pid": pid, "worker": worker,
                               "left": times, "after_bytes": after_bytes})

    def clear(self) -> None:
        with self.lock:
            self.items.clear()
            self.calls.clear()

    def take(self, point: str, when: str, worker: str | None = None) -> dict | None:
        with self.lock:
            hit = next((f for f in self.items if f["point"] == point and f["when"] == when and f["left"] > 0
                        and (f["worker"] is None or f["worker"] == worker)), None)
            if hit:
                hit["left"] -= 1
            return hit

    def fire(self, point: str, when: str, worker: str | None = None) -> None:
        hit = self.take(point, when, worker)
        if not hit:
            return
        if hit["action"] == "kill":
            kill_group(hit["pid"])
        raise Drop()

    def record(self, **entry) -> None:
        with self.lock:
            self.calls.append(entry)

    def count(self, point: str, **match) -> int:
        with self.lock:
            return sum(1 for call in self.calls if call["point"] == point
                       and all(call.get(key) == value for key, value in match.items()))


def kill_group(pid: int | None) -> None:
    if pid is None:
        return
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _read_body(handler: BaseHTTPRequestHandler) -> bytes:
    if "chunked" in (handler.headers.get("transfer-encoding") or "").lower():
        body = bytearray()
        while True:
            size = int(handler.rfile.readline().split(b";")[0].strip() or b"0", 16)
            if size == 0:
                handler.rfile.readline()
                return bytes(body)
            body += handler.rfile.read(size)
            handler.rfile.readline()
    return handler.rfile.read(int(handler.headers.get("content-length") or 0))


def _forward(handler: BaseHTTPRequestHandler, host: str, port: int, body: bytes, on_stream=None) -> int:
    upstream = http.client.HTTPConnection(host, port, timeout=600)
    headers = {key: value for key, value in handler.headers.items() if key.lower() not in HOP}
    headers["Host"] = f"{host}:{port}"
    headers["Content-Length"] = str(len(body))
    upstream.request(handler.command, handler.path, body=body, headers=headers)
    response = upstream.getresponse()
    payload_length = response.getheader("content-length")
    handler.send_response(response.status)
    for key, value in response.getheaders():
        if key.lower() not in HOP:
            handler.send_header(key, value)
    if payload_length is not None:
        handler.send_header("Content-Length", payload_length)
    handler.send_header("Connection", "close")
    handler.end_headers()
    sent = 0
    while True:
        chunk = response.read(256 * 1024)
        if not chunk:
            break
        handler.wfile.write(chunk)
        sent += len(chunk)
        if on_stream is not None:
            on_stream(sent)
    upstream.close()
    return response.status


def _abort(handler: BaseHTTPRequestHandler) -> None:
    handler.close_connection = True
    try:
        handler.connection.shutdown(2)
    except OSError:
        pass


class BridgeEdge:
    """worker -> bridge host. Points: the action name, or event:<EVENT_TYPE>."""

    def __init__(self, faults: Faults, upstream_port: int) -> None:
        self.faults, self.upstream_port = faults, upstream_port

    def serve(self) -> tuple[ThreadingHTTPServer, int]:
        edge = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:
                return

            def do_POST(self) -> None:  # noqa: N802
                body = _read_body(self)
                try:
                    parsed = json.loads(body or b"{}")
                except ValueError:
                    parsed = {}
                point = self.path.rsplit("/", 1)[-1]
                if point == "h3e91-execution-event":
                    point = f"event:{parsed.get('eventType')}"
                worker = parsed.get("workerId") if isinstance(parsed, dict) else None
                job = parsed.get("jobId") if isinstance(parsed, dict) else None
                try:
                    edge.faults.fire(point, "before", worker)
                    captured: list[bytes] = []
                    status = edge._relay(self, body, captured)
                    answer = {}
                    try:
                        answer = json.loads(b"".join(captured) or b"{}")
                    except ValueError:
                        pass
                    edge.faults.record(point=point, worker=worker, job=job or (answer.get("job_id") if isinstance(answer, dict) else None),
                                       http=status, status=answer.get("status") if isinstance(answer, dict) else None,
                                       code=answer.get("code") if isinstance(answer, dict) else None,
                                       accepted=answer.get("accepted") if isinstance(answer, dict) else None)
                    edge.faults.fire(point, "after", worker)
                    data = b"".join(captured)
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    self.wfile.write(data)
                except Drop:
                    _abort(self)
                except Exception:  # noqa: BLE001
                    _abort(self)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server, server.server_address[1]

    def _relay(self, handler: BaseHTTPRequestHandler, body: bytes, captured: list[bytes]) -> int:
        upstream = http.client.HTTPConnection("127.0.0.1", self.upstream_port, timeout=900)
        headers = {key: value for key, value in handler.headers.items() if key.lower() not in HOP}
        headers["Content-Length"] = str(len(body))
        upstream.request("POST", handler.path, body=body, headers=headers)
        response = upstream.getresponse()
        captured.append(response.read())
        upstream.close()
        return response.status


class ApiEdge:
    """TLS in front of the local Supabase API. Points: storage-upload, demo-download."""

    def __init__(self, faults: Faults, upstream_port: int, directory: Path) -> None:
        self.faults, self.upstream_port = faults, upstream_port
        self.cert, self.key = directory / "edge-cert.pem", directory / "edge-key.pem"
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=localhost",
             "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE",
             "-keyout", str(self.key), "-out", str(self.cert)],
            check=True, capture_output=True,
        )

    def serve(self) -> tuple[ThreadingHTTPServer, int]:
        edge = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:
                return

            def _handle(self) -> None:
                body = _read_body(self)
                path = self.path.split("?", 1)[0]
                point = None
                if "/storage/v1/object/upload/sign/" in path and self.command in ("PUT", "POST"):
                    point = "storage-upload"
                elif "/storage/v1/object/sign/demos/" in path and self.command == "GET":
                    point = "demo-download"
                try:
                    if point:
                        edge.faults.fire(point, "before")
                    stream_fault = edge.faults.take(point, "stream") if point else None

                    def on_stream(sent: int) -> None:
                        if stream_fault and sent >= stream_fault["after_bytes"]:
                            if stream_fault["action"] == "kill":
                                kill_group(stream_fault["pid"])
                            raise Drop()

                    lost_answer = edge.faults.take(point, "after") if point else None
                    if lost_answer:
                        # The upstream commits; the caller never hears about it.
                        upstream = http.client.HTTPConnection("127.0.0.1", edge.upstream_port, timeout=600)
                        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
                        headers["Content-Length"] = str(len(body))
                        upstream.request(self.command, self.path, body=body, headers=headers)
                        answer = upstream.getresponse()
                        answer.read()
                        upstream.close()
                        edge.faults.record(point=point, http=answer.status, answer_lost=True)
                        if lost_answer["action"] == "kill":
                            kill_group(lost_answer["pid"])
                        raise Drop()
                    status = _forward(self, "127.0.0.1", edge.upstream_port, body, on_stream if stream_fault else None)
                    if point:
                        edge.faults.record(point=point, http=status)
                except Drop:
                    _abort(self)
                except Exception:  # noqa: BLE001
                    _abort(self)
                self.close_connection = True

            do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = do_PATCH = _handle  # noqa: N815

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(self.cert), str(self.key))
        server.socket = context.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server, server.server_address[1]
