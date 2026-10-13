"""Resolve the A9.1 real-DEM source from the official reference fixture.

The application re-proves the fixture registered in `r5_forensic_staging` (authorized
SHA-256 and size observed, bytes readable, not deleted, object physically present
with the authorized size) and returns a short-lived signed URL for exactly that
object. This module only checks the response shape and that the advertised
identity is the authorized one; `execute.py` still verifies the downloaded bytes.

The URL is returned to the caller and never printed, logged or written to disk.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ENDPOINT = "https://gamepro.network/api/public/a91-reference-fixture"
SOURCE = "OFFICIAL_R5_FORENSIC_STAGING"
SHA = "0caa7c9744deec106095895d2dacd19cbfdae689f99e29b0dd4d446b4ec8ae3d"
SIZE = 473748061


def validate(document: object) -> str:
    """Return the URL when the response names exactly the authorized fixture."""
    if not isinstance(document, dict):
        raise ValueError("REFERENCE_FIXTURE_RESPONSE_INVALID")
    if document.get("source") != SOURCE:
        raise ValueError("REFERENCE_FIXTURE_SOURCE_MISMATCH")
    if document.get("sha256") != SHA or document.get("sizeBytes") != SIZE:
        raise ValueError("REFERENCE_FIXTURE_IDENTITY_MISMATCH")
    url = document.get("url")
    if not isinstance(url, str) or "\n" in url or "\r" in url:
        raise ValueError("REFERENCE_FIXTURE_URL_INVALID")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("REFERENCE_FIXTURE_URL_INVALID")
    return url


def resolve(transport_secret: str, opener=urllib.request.urlopen) -> str:
    if len(transport_secret) < 32:
        raise ValueError("REFERENCE_FIXTURE_TRANSPORT_MISSING")
    request = urllib.request.Request(
        ENDPOINT,
        data=b"{}",
        method="POST",
        headers={"authorization": f"Bearer {transport_secret}", "content-type": "application/json",
                 "User-Agent": "gamepro-a91-reference-fixture/1"},
    )
    try:
        with opener(request, timeout=60) as response:
            document = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise ValueError(f"REFERENCE_FIXTURE_HTTP_{error.code}") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise ValueError("REFERENCE_FIXTURE_UNREACHABLE") from None
    return validate(document)
