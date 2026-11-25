import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** R-25: no personal e-mail address in the repository (tests use example.com / .invalid). */
const ALLOWED_DOMAINS =
  /@(example\.(com|org|net)|[a-z0-9.-]+\.(invalid|example|test)|gamepro\.academy|anthropic\.com|users\.noreply\.github\.com|lovable\.dev)$/i;
const PLACEHOLDERS = /^(you|seu|o\.seu|tu|vous|name|nome|user|usuario)@email\.com$/i;

describe("R-25: repository e-mail addresses", () => {
  it("only product, placeholder or reserved-domain addresses", () => {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-ohIE",
        "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[a-z]{2,}",
        "--",
        "src",
        "docs",
        "scripts",
        "supabase",
        "services",
      ],
      { encoding: "utf8" },
    );
    const offenders = [...new Set(out.split("\n").filter(Boolean))].filter(
      (a) =>
        !ALLOWED_DOMAINS.test(a) &&
        !PLACEHOLDERS.test(a) &&
        !/^[a-z0-9.-]+@(gamersclub\.com\.br)$/i.test(a),
    );
    expect(offenders).toEqual([]);
  });
});
