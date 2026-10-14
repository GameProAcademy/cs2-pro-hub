import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEPLOYED_WORKER_BUILD_REVISION,
  DEPLOYED_WORKER_REVISION,
  parserLockIdentity,
} from "../parser/adapter";

afterEach(() => vi.unstubAllEnvs());

describe("published parser lock", () => {
  it("reports the code defaults in production when no override exists", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_PARSER_EXPECTED_REVISION", "");
    vi.stubEnv("DEMO_PARSER_EXPECTED_BUILD_REVISION", "");
    const lock = parserLockIdentity();
    expect(lock).toMatchObject({
      revision: DEPLOYED_WORKER_REVISION,
      buildRevision: DEPLOYED_WORKER_BUILD_REVISION,
      revisionRequired: true,
      buildRevisionRequired: true,
      revisionSource: "code",
      buildRevisionSource: "code",
    });
  });

  it("makes a stale environment override visible instead of hiding it", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DEMO_PARSER_EXPECTED_BUILD_REVISION",
      "git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d",
    );
    const lock = parserLockIdentity();
    expect(lock.buildRevision).toBe("git:c8c6d6ec0fdc8c6b9a8fb243d84797ee07a0354d");
    expect(lock.buildRevisionSource).toBe("env");
  });

  it("publishes only identity fields, never a token or URL", () => {
    vi.stubEnv("DEMO_PARSER_TOKEN", "secret-token-value");
    vi.stubEnv("DEMO_PARSER_URL", "https://parser.example.invalid");
    const text = JSON.stringify(parserLockIdentity());
    expect(text).not.toContain("secret-token-value");
    expect(text).not.toContain("parser.example.invalid");
  });
});
