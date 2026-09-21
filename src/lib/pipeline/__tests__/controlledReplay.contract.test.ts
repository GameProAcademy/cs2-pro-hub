import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const adminSource = readFileSync(resolve("src/lib/pipeline-admin.functions.ts"), "utf8");
const storageSource = readFileSync(resolve("src/lib/pipeline/storage.server.ts"), "utf8");

describe("G.6-R.3 controlled replay contract", () => {
  it("routes same-attempt admin retry through the lifecycle RPC", () => {
    const retryBlock = adminSource.slice(
      adminSource.indexOf("export const adminRetryDemoJob"),
      adminSource.indexOf("const controlledReplayInput"),
    );
    expect(retryBlock).toContain('rpc("retry_demo_job"');
    expect(retryBlock).not.toContain('.update({\n        status: "pending"');
  });

  it("reserves and enqueues a new logical attempt only through official RPCs", () => {
    const replayBlock = adminSource.slice(adminSource.indexOf("adminCreateControlledDemoReplay"));
    expect(replayBlock).toContain('"reserve_demo_upload"');
    expect(replayBlock).toContain('rpc("enqueue_demo_job"');
    expect(replayBlock).toContain('throw new Error("ATTEMPT_10_FORBIDDEN")');
    expect(replayBlock).toContain('Number(reserved["attempt_number"]) !== 9');
    expect(replayBlock).not.toContain('.from("demo_jobs").insert');
    expect(replayBlock).not.toContain('.from("uploads").insert');
  });

  it("uses server-side copy and verifies ownership, size, hash, and source preservation", () => {
    const copyBlock = storageSource.slice(storageSource.indexOf("copyDemoVerified"));
    expect(copyBlock).toContain("assertDemoStoragePath(args.sourcePath");
    expect(copyBlock).toContain("assertDemoStoragePath(");
    expect(copyBlock).toContain(".copy(args.sourcePath, args.destinationPath)");
    expect(copyBlock).toContain("computeStoredDemoSha256(args.destinationPath)");
    expect(copyBlock).toContain("SOURCE_NOT_PRESERVED");
    expect(copyBlock).not.toContain(".remove(");
  });
});