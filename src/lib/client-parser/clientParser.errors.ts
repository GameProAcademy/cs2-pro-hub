import type { ClientParserErrorCode } from "./clientParser.types";

export class ClientParserError extends Error {
  constructor(readonly code: ClientParserErrorCode) {
    super(code);
    this.name = "ClientParserError";
  }
}

export function clientParserErrorCode(error: unknown): ClientParserErrorCode {
  return error instanceof ClientParserError ? error.code : "CLIENT_WORKER_FAILED";
}

/** Classifies only recognizable fatal runtime failures; never returns raw diagnostics. */
export function fatalWasmErrorCode(error: unknown): ClientParserErrorCode | null {
  const message = error instanceof Error ? error.message : "";
  if (
    /out of memory|memory allocation failed|failed to (?:grow|allocate) memory|memory\.grow|cannot enlarge memory|unable to grow.*memory/i.test(
      message,
    )
  )
    return "CLIENT_WASM_MEMORY_FAILURE";
  if (error instanceof WebAssembly.RuntimeError) return "CLIENT_WASM_RUNTIME_TRAP";
  return null;
}

export function throwIfFatalWasmError(error: unknown): void {
  const code = fatalWasmErrorCode(error);
  if (code) throw new ClientParserError(code);
}
