# Client parser Canonical admission boundary

Browser output is untrusted and cannot authorize Canonical persistence. The authenticated endpoint is a dry-run validator only and always returns `canonicalAdmission: "BLOCKED"` and `persisted: false`.

Validation is bounded by payload bytes, depth, nodes, keys, players, discovered/parsed events, event samples, and tick samples. It rejects functions, cycles, binary objects, exotic prototypes, forbidden DEM/RAW/full-tick keys, non-finite measurements, full or authoritative tick claims, inconsistent inventory counts, forged versions, identities, source revision, artifact status/hashes, catalog/contract/capability/result/manifest digests, and malformed classifications.

The browser result contains no server-owned RAW artifact, upload binding, final physical reconciliation, or trusted parser execution proof. It therefore cannot satisfy the existing server-owned Canonical prerequisite. Future work must create a separate, reviewed server-verification protocol; this POC provides no bypass.