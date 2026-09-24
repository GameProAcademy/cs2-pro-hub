# H.3-R — Live Railway Runtime Preflight Evidence — 2026-09-24

STATUS: **OBSERVED / PRE-EXECUTION EVIDENCE**

## Deployment

- service: cs2-demo-parser
- environment: production
- deployment: 7a540da0-3a69-44c0-9c42-40209f903fa7
- source branch: infra/cs2-parser-worker-v8
- controlled instrumentation commit: ff0cc222f514c01eda6e26d7bb95271a8b0c9b04
- deployment status: SUCCESS
- replicas: 1

## Parser identity

- name: demoparser2
- package version: 0.42.0
- parser revision: git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76
- build revision: git:5703b1d88f21ee57fdd1d83722edf30e0f0c6f76
- contract: 1
- Python: 3.12.14

## Runtime envelope

- cgroup memory limit: 3,999,997,952 bytes
- cgroup current memory at preflight: 35,618,816 bytes
- CPU quota: 400,000 us
- CPU period: 100,000 us
- configured MAX_DEMO_BYTES: 1,610,612,736 bytes
- configured MAX_PAYLOAD_BYTES: 8,388,608 bytes
- download timeout: 120 s
- parse timeout: 240 s
- secrets included: false

## Interpretation

This proves the live Railway runtime identity and configured container envelope. It does not prove that the Cache DEM can be parsed safely. The current process memory observation is only a preflight snapshot; the isolated parser child must be observed during the exact controlled DEM execution.

## Important historical observation

Railway logs contain a prior real parser execution from 2026-09-19 with child RSS samples around 1.0 GiB and a worker high-water reading around 425–426 MiB. That historical run is NOT admitted as Cache evidence because its exact DEM identity and SHA are not cryptographically bound in the retained log evidence available here. It must not be used to close H.3.

## Current gate

- Browser >128 MiB: BLOCKED.
- Live Railway runtime preflight: OBSERVED.
- Exact Cache identity: registered.
- Retention authorization: PENDING.
- Fresh execution attestation: PENDING.
- Explicit execution authorization record: PENDING.
- First controlled Cache execution: NOT RUN in the current evidence envelope.
- Canonical admission: LOCKED.