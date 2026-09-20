import { Sha256 } from "@/lib/pipeline/sha256";

export function stableClientJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableClientJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableClientJson(item)}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  return JSON.stringify(value);
}

export function sha256Hex(bytes: Uint8Array): string {
  return new Sha256().update(bytes).hex();
}

export function sha256Text(value: string): string {
  return sha256Hex(new TextEncoder().encode(value));
}

export function computeClientResultDigest<T extends object>(result: T): string {
  const {
    resultDigest: _digest,
    performance: _performance,
    ...deterministic
  } = result as T & {
    resultDigest?: string;
    performance?: unknown;
  };
  const normalized = { ...deterministic } as Record<string, unknown>;
  const demo = normalized["demo"];
  if (demo && typeof demo === "object" && !Array.isArray(demo)) {
    const { name: _name, lastModified: _lastModified, ...semanticDemo } = demo as Record<
      string,
      unknown
    >;
    normalized["demo"] = semanticDemo;
  }
  return sha256Text(stableClientJson(normalized));
}
