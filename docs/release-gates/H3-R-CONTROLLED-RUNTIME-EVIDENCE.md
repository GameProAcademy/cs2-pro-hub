# H.3-R — Controlled Runtime Evidence Instrumentation

STATUS: **IMPLEMENTED / NOT DEPLOYED**

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

## Deployment rule

This branch is intentionally NOT DEPLOYED to Railway production by this milestone.
The Railway service is connected to infra/cs2-parser-worker-v8, and pushes to a connected GitHub branch can automatically deploy. Therefore the instrumentation remains isolated until CI and deployment are explicitly reviewed.

## Next gate

After CI acceptance, the branch can be merged/deployed to the controlled Railway parser runtime. Only then should the runtime pre-flight endpoint be called.

A successful pre-flight still does not authorize the Cache DEM. The first real parse remains a separate controlled execution event.