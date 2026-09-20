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
