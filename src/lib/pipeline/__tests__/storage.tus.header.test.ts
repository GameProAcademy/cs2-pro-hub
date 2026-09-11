/**
 * STORAGE/TUS GATE regression.
 *
 * The real failure behind `STORAGE_ERROR` was a duplicated Authorization header:
 * declaring `authorization` in the tus `headers` option AND in `onBeforeRequest`
 * makes the XHR layer call setRequestHeader("authorization", ...) twice, and the
 * browser merges both values into "Bearer <a>, Bearer <b>". Supabase Storage then
 * answers 400 with {"code":"AccessDenied","message":"Invalid Compact JWS"}.
 *
 * The bearer token must therefore be attached in exactly one place.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/lib/pipeline/resumableUpload.ts"), "utf8");

describe("TUS authorization header", () => {
  it("attaches the bearer token only through onBeforeRequest", () => {
    expect(source).toContain('request.setHeader("authorization"');
    // No static authorization entry inside the tus `headers` option.
    expect(source).not.toMatch(/headers:\s*\{[^}]*authorization/);
  });

  it("still sends x-upsert and keeps the HTTP diagnostic", () => {
    expect(source).toContain('"x-upsert": "true"');
    expect(source).toContain("http_status=");
    expect(source).toContain("response_body=");
  });
});
