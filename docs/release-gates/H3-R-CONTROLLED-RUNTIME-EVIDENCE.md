# H.3-R — Controlled Runtime Evidence Instrumentation

STATUS: **IMPLEMENTED / MERGED / DEPLOYED / LIVE PREFLIGHT OBSERVED**

## Purpose

H.3-R prepares the Railway parser runtime to produce a secret-free, exact-runtime evidence envelope before the first real DEM execution.

## Evidence exposed

- Python runtime version;
- demoparser2 package version;
- declared parser version;
- immutable parser revision;
- optional exact build revision;
- contract version;
- configured demo/payload/time limits;
- Linux cgroup memory limit/current usage when available;
- Linux cgroup CPU quota/period when available;
- current process RSS;
- process high-water memory fields;
- process-lifetime ru_maxrss, clearly marked as such;
- explicit secretsIncluded=false.

## Current deployment

The H.3-R instrumentation was merged to the mainline and the controlled Railway runtime was deployed on the frozen parser-worker production branch.

Live preflight evidence is recorded in:
`docs/release-gates/H3-R-LIVE-RAILWAY-PREFLIGHT-2026-09-24.md`

Observed live identity:
- demoparser2: 0.42.0
- parser/build revision: git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76
- contract: 1
- Python: 3.12.14
- cgroup memory: 3,999,997,952 bytes
- CPU quota: 400,000 us / 100,000 us period
- secretsIncluded: false

This evidence proves the live runtime envelope only. It does not prove safe parsing of the 473,748,061-byte Cache DEM.

## Next gate

H.3-E freezes the exact Cache execution envelope. A successful preflight still does not authorize the Cache DEM. The first real parse remains a separate controlled execution event.