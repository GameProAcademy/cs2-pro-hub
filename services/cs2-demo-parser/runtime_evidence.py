"""Non-secret runtime evidence for controlled parser readiness.

This module exposes only runtime facts needed by H.3 and never reads or
returns credentials, URLs, raw DEM contents, file paths, or all environment vars.
"""

from __future__ import annotations

import platform
import resource
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any

def _read_text(path: str) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None

def _parse_bytes(value: str | None) -> int | None:
    if value is None or value == "" or value == "max":
        return None
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None

def _cgroup_memory() -> dict[str, int | None]:
    max_bytes = _parse_bytes(_read_text("/sys/fs/cgroup/memory.max"))
    current_bytes = _parse_bytes(_read_text("/sys/fs/cgroup/memory.current"))
    if max_bytes is None and current_bytes is None:
        max_bytes = _parse_bytes(_read_text("/sys/fs/cgroup/memory/memory.limit_in_bytes"))
        current_bytes = _parse_bytes(_read_text("/sys/fs/cgroup/memory/memory.usage_in_bytes"))
    return {"limit_bytes": max_bytes, "current_bytes": current_bytes}

def _cgroup_cpu() -> dict[str, int | None]:
    raw = _read_text("/sys/fs/cgroup/cpu.max")
    if raw:
        parts = raw.split()
        if len(parts) == 2:
            quota = None if parts[0] == "max" else _parse_bytes(parts[0])
            period = _parse_bytes(parts[1])
            return {"quota_us": quota, "period_us": period}
    quota = _parse_bytes(_read_text("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"))
    period = _parse_bytes(_read_text("/sys/fs/cgroup/cpu/cpu.cfs_period_us"))
    return {"quota_us": quota, "period_us": period}

def _process_memory() -> dict[str, int | None]:
    rss_bytes = None
    hwm_bytes = None
    status = _read_text("/proc/self/status")
    if status:
        for line in status.splitlines():
            key, _, value = line.partition(":")
            if key in {"VmRSS", "VmHWM"}:
                parts = value.strip().split()
                if parts and parts[0].isdigit():
                    bytes_value = int(parts[0]) * 1024
                    if key == "VmRSS":
                        rss_bytes = bytes_value
                    else:
                        hwm_bytes = bytes_value
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return {"rss_bytes": rss_bytes, "hwm_bytes": hwm_bytes, "ru_maxrss_bytes": int(usage.ru_maxrss) * 1024}

def _package_version(name: str) -> str | None:
    try:
        return package_version(name)
    except PackageNotFoundError:
        return None

def collect_runtime_evidence(settings: Any) -> dict[str, Any]:
    """Return a deterministic, secret-free runtime evidence envelope."""
    memory = _cgroup_memory()
    cpu = _cgroup_cpu()
    process = _process_memory()
    return {
        "evidenceClass": "CONTROLLED_RUNTIME_PRE_FLIGHT",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "parser": {
            "name": "demoparser2",
            "packageVersion": _package_version("demoparser2"),
            "declaredVersion": "0.42.0",
            "revision": settings.revision,
            "buildRevision": settings.build_revision,
            "contractVersion": settings.contract_version,
        },
        "limits": {
            "maxDemoBytes": settings.max_demo_bytes,
            "maxPayloadBytes": settings.max_payload_bytes,
            "downloadTimeoutSeconds": settings.download_timeout_seconds,
            "parseTimeoutSeconds": settings.parse_timeout_seconds,
        },
        "container": {
            "memoryLimitBytes": memory["limit_bytes"],
            "memoryCurrentBytes": memory["current_bytes"],
            "cpuQuotaUs": cpu["quota_us"],
            "cpuPeriodUs": cpu["period_us"],
        },
        "processMemory": process,
        "production": settings.is_production,
        "secretsIncluded": False,
    }

def parse_memory_snapshot() -> dict[str, int | None]:
    """Return a fresh process-memory snapshot for per-request instrumentation."""
    return _process_memory()