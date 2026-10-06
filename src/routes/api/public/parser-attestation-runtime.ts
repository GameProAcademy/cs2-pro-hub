import { createFileRoute } from "@tanstack/react-router";

const FINGERPRINT = {
  status: "VERIFIED_SOURCE_FINGERPRINT",
  release: "H.3-E.5-RUNTIME-PARITY-2026-10-06",
  attestationSourceCommit: "ba83278fc20f57bb9b3bf2caba7745b099e71ab8",
  parserAttestationSourceSha: "f45a979eae71819c7f5493ff8f4aa0cbfd0b9398",
  parserAttestationRouteSha: "5e700571320ca1e3d5440e4ea96a8ebf46771002",
  serverEntrySourceSha: "71f84a2187d152b8e0b9f278b49620eaba4f785d",
  workerCriticalHash: "50a53b607d26f00b4de05c5e8998611959e27bd1",
} as const;

export const Route = createFileRoute("/api/public/parser-attestation-runtime")({
  server: {
    handlers: {
      GET: () => Response.json(FINGERPRINT, { status: 200 }),
    },
  },
});
