import { createHmac, timingSafeEqual } from "node:crypto";

export function canonicalAttestationJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAttestationJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalAttestationJson(record[key])}`)
    .join(",")}}`;
}

export function safeAttestationEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function signAttestationPayload(canonicalPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(canonicalPayload).digest("hex");
}
