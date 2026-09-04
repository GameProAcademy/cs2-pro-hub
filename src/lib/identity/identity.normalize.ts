/**
 * Identity normalization helpers.
 *
 * Normalization exists to COMPARE, never to claim equality is identity.
 */

/** Lower-cases, trims, strips clan tags/decorations and collapses separators. */
export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const stripped = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  return stripped === "" ? null : stripped;
}

/** SteamID64: 17 digits starting with 7656119. Anything else is rejected. */
export function normalizeSteamId64(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  return /^7656119[0-9]{10}$/.test(value) ? value : null;
}

/** External account ids are compared as exact, trimmed strings. */
export function normalizeExternalId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" || trimmed.length > 128 ? null : trimmed;
}

/**
 * Stable, non-reversible fingerprint for evidence values we should not store
 * verbatim. Deterministic FNV-1a — enough to compare observations, not enough to
 * recover the value.
 */
export function evidenceValueHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}`;
}
