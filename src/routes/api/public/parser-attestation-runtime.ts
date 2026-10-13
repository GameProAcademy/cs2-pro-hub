import { createFileRoute } from "@tanstack/react-router";

import { bridgeWorkerIdentity } from "@/lib/h3e91WorkerIdentity";

const FINGERPRINT = {
  status: "VERIFIED_SOURCE_FINGERPRINT",
  release: "H.3-E.5-RUNTIME-PARITY-2026-10-06",
  attestationSourceCommit: "ba83278fc20f57bb9b3bf2caba7745b099e71ab8",
  parserAttestationSourceSha: "f45a979eae71819c7f5493ff8f4aa0cbfd0b9398",
  parserAttestationRouteSha: "5e700571320ca1e3d5440e4ea96a8ebf46771002",
  serverEntrySourceSha: "71f84a2187d152b8e0b9f278b49620eaba4f785d",
  workerCriticalHash: "ecaac3968d68e1ed8fc03f8dfea42c223869f473",
} as const;

export const Route = createFileRoute("/api/public/parser-attestation-runtime")({
  server: {
    handlers: {
      // `bridge` is read at request time: the worker build the execution
      // bridge accepts (a commit hash, not a secret).
      GET: () => Response.json({ ...FINGERPRINT, bridge: bridgeWorkerIdentity() }, { status: 200 }),
    },
  },
});
