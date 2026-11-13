"""Shared privacy guard for the PM6 compatibility probes.

Probe outputs may be committed (as summaries) or pasted in reports, so they must never carry
Steam IDs, player names, chat text or server names. The probes only emit counts, column names,
types and platform tokens; this guard is the last line of defence before anything is written.
"""
from __future__ import annotations

import json
import re
from typing import Any

STEAM_ID64 = re.compile(r"7656119\d{10}")
FORBIDDEN_KEYS = frozenset({"server_name", "client_name", "user_name", "name", "text", "chat_message",
                            "steamid", "user_steamid", "attacker_steamid", "xuid"})


class PrivacyViolation(ValueError):
    pass


def assert_no_identifiers(payload: Any) -> None:
    """Raise PrivacyViolation if the JSON form of payload carries an identifier."""
    text = json.dumps(payload, default=str, ensure_ascii=False)
    if STEAM_ID64.search(text):
        raise PrivacyViolation("probe output contains a SteamID64")

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                # Column inventories (lists of names) are allowed; values under identity keys are not.
                if key in FORBIDDEN_KEYS and not isinstance(value, (list, tuple, dict)) and value not in (None, ""):
                    raise PrivacyViolation(f"probe output carries a value for identity key {path}{key}")
                walk(value, f"{path}{key}.")
        elif isinstance(node, (list, tuple)):
            for item in node:
                walk(item, path)

    walk(payload, "")


def write_json(path: str, payload: Any) -> None:
    assert_no_identifiers(payload)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=1, default=str, ensure_ascii=False)
