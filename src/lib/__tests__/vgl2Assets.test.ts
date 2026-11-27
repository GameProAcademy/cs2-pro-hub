/**
 * VGL 2.0 continuation — every SVG in the CS2 pack is used as a CSS mask, and a mask image only
 * renders when the file declares the SVG namespace (found in production: flashbang.svg).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const svgs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? svgs(join(dir, e.name)) : e.name.endsWith(".svg") ? [join(dir, e.name)] : [],
  );

describe("CS2 SVG assets", () => {
  it("every SVG declares the SVG namespace (required by mask-image)", () => {
    const files = svgs(resolve("public/cs2"));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files)
      expect(readFileSync(f, "utf8").slice(0, 400), f).toContain(
        'xmlns="http://www.w3.org/2000/svg"',
      );
  });
});
