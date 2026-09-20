# demoparser2 WASM × Python parity

Parity is field-level and fail-closed. A matching parser name/version is necessary but not sufficient. A comparison may return only `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, `NOT_AVAILABLE_ON_WASM`, `NOT_AVAILABLE_ON_PYTHON`, or `PARSE_FAILED`; absence is never converted into equality.

| Dimension                                          | Status                | Reason                                                    |
| -------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| header, map, version, playback ticks, tickrate     | NOT_RUN               | No real browser artifact/DEM result                       |
| player count and identities                        | NOT_AVAILABLE_ON_WASM | `parsePlayerInfo` is not proven on a 0.42 browser runtime |
| discovered event inventory                         | NOT_RUN               | No real browser artifact/DEM result                       |
| death, hurt, round start/end, bomb, grenade counts | NOT_RUN               | No same-DEM Python/WASM corpus result                     |
| event tick ordering                                | NOT_RUN               | No same-DEM Python/WASM corpus result                     |
| controlled tick values                             | NOT_RUN               | Probe is bounded and non-authoritative                    |
| position, health, armor, weapon, economy           | NOT_RUN               | No same-DEM Python/WASM corpus result                     |
| round boundaries                                   | NOT_RUN               | No same-DEM Python/WASM corpus result                     |

The comparator emits all 22 dimensions independently and does not hide mismatches. Promotion requires an authorized corpus, exact artifact provenance, independent Python output, documented numeric tolerances, deterministic reruns, and zero unexplained semantic failures.
