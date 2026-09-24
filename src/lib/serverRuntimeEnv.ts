const SERVER_SECRET_BINDINGS = [
  "PARSER_ATTESTATION_TRANSPORT_SECRET",
  "PARSER_ATTESTATION_HMAC_SECRET",
] as const;

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

/**
 * Lovable/Worker server bindings arrive on the fetch env argument, while
 * existing server-only modules read process.env. Bridge only the two
 * attestation secrets at request time; never return, log, or expose values.
 */
export function bindServerSecretsToProcessEnv(env: unknown): void {
  if (!env || typeof env !== "object") return;

  const bindings = env as Record<string, unknown>;
  const processLike = (globalThis as typeof globalThis & { process?: ProcessLike }).process;
  if (!processLike?.env) return;

  for (const name of SERVER_SECRET_BINDINGS) {
    const value = bindings[name];
    if (typeof value === "string" && value.length > 0) {
      processLike.env[name] = value;
    }
  }
}
