/**
 * Immutable boundary between CS2 PRO and the training platform (hub.gamepro.academy,
 * WordPress + Tutor LMS). CS2 PRO only recommends catalog lessons and links to them; it never
 * reads, stores or infers lesson progress, completion, history or Tutor LMS activity, never
 * shares accounts or authentication, and never calls WordPress or Tutor LMS.
 * See docs/design/UX_FOUNDATIONS.md §9 and docs/TRAINING_CATALOG.md.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { pickRecommendations, type CatalogCandidate } from "@/lib/catalog/catalogSelect";

const ROOT = resolve(".");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(resolve(ROOT, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(resolve(ROOT, full));
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|py|sql|toml|json|ya?ml)$/.test(name)) out.push(full);
  }
  return out;
}

const isTest = (f: string) => /(__tests__|\/tests?\/|\.test\.|_test\.py|test_)/.test(f);

/** Production code and configuration: app, database, worker, scripts, CI, Supabase config. */
const PRODUCT_FILES = ["src", "supabase", "services", "scripts", ".github/workflows"]
  .flatMap((d) => walk(d))
  .concat(
    ["supabase/config.toml", "package.json"].filter((f) => {
      try {
        return statSync(resolve(ROOT, f)).isFile();
      } catch {
        return false;
      }
    }),
  )
  .filter((f) => !isTest(f));

const MIGRATIONS = walk("supabase/migrations").filter((f) => f.endsWith(".sql"));

/** WordPress / Tutor LMS integration surfaces (APIs, admin, XML-RPC, tables, plugins). */
const LMS_INTEGRATION =
  /(wp-json|wp-admin|wp-login|xmlrpc\.php|admin-ajax\.php|\btutor[_/ -]?(lms|v\d|api|enrol|enroll|progress|course|lesson|quiz|user)|tutorlms|\bwp_(users|usermeta|posts|postmeta|options|comments|learnpress)|wordpress[_-]?(api|db|database|token|secret|key|user|auth|webhook|sync))/i;

const HUB_HOST = /hub(\\)?\.gamepro(\\)?\.academy/i;

/** The only places the hub's address may appear: URL validation, the offline import, copy. */
const HUB_ALLOWED = [
  "src/lib/catalog/catalogCore.ts",
  "scripts/catalog/build-import-sql.ts",
  "supabase/migrations/20261103120000_training_catalog.sql",
  "supabase/seed/training-catalog/",
  "src/i18n/locales/catalog/",
  "src/i18n/locales/ux/",
];

/** Learning-tracking or account-linking columns a catalog table must never get. */
const CATALOG_FORBIDDEN_COLUMN =
  /^(user_id|player_id|profile_id|account_id|owner_id|auth_|wp_|tutor_|progress|percent|completed|completion|complete|is_complete|enrolled|enrollment|enrolment|watched|viewed|opened|started|finished|last_(seen|opened|viewed|watched)|history|activity|grade|score|rating)/i;

/** Tables that would hold learning state or a WordPress mirror, anywhere in the schema. */
const FORBIDDEN_TABLE =
  /(tutor|wordpress|\bwp_|lms_|_lms\b|lesson_(progress|completion|status|views?|history|activity)|course_(progress|completion|enrol|enroll)|enrol(l)?ments?|learning_(history|progress|activity))/i;

describe("no WordPress / Tutor LMS integration", () => {
  it("scans a meaningful set of product files", () => {
    expect(PRODUCT_FILES.length).toBeGreaterThan(200);
    expect(MIGRATIONS.length).toBeGreaterThan(20);
  });

  it("no product code, migration, worker, script or CI workflow talks to WordPress or Tutor LMS", () => {
    const hits = PRODUCT_FILES.flatMap((f) =>
      read(f)
        .split("\n")
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => LMS_INTEGRATION.test(line)),
    ).map(({ f, i, line }) => `${f}:${i}: ${line.trim().slice(0, 120)}`);
    expect(hits).toEqual([]);
  });

  it("the hub address appears only in the catalog URL rules, the offline import and copy", () => {
    const offenders = PRODUCT_FILES.filter((f) => HUB_HOST.test(read(f))).filter(
      (f) => !HUB_ALLOWED.some((a) => (a.endsWith("/") ? f.startsWith(a) : f === a)),
    );
    expect(offenders).toEqual([]);
  });

  it("nothing fetches the hub: the only network client near training is the AI provider", () => {
    const near = PRODUCT_FILES.filter((f) =>
      /^src\/(lib\/(catalog|training|coach)|components\/(training|coach)|routes\/_authenticated\/(training|coach))/.test(
        relative(ROOT, resolve(ROOT, f)),
      ),
    );
    expect(near.length).toBeGreaterThan(5);
    const fetching = near.filter((f) =>
      /\bfetch\s*\(|axios|XMLHttpRequest|EventSource/.test(read(f)),
    );
    expect(fetching).toEqual(["src/lib/coach/coachProvider.server.ts"]);
    expect(read("src/lib/coach/coachProvider.server.ts")).not.toMatch(HUB_HOST);
  });

  it("no secret or environment variable for WordPress or Tutor LMS", () => {
    const envHits = PRODUCT_FILES.filter((f) =>
      /\b(process\.env|import\.meta\.env|Deno\.env\.get|os\.environ)\b[^\n]*(WORDPRESS|TUTOR|\bWP_|LMS)/i.test(
        read(f),
      ),
    );
    expect(envHits).toEqual([]);
  });
});

describe("the catalog holds lessons, never learning state", () => {
  it("no migration creates a learning-tracking or WordPress-mirror table", () => {
    const bad = MIGRATIONS.flatMap((f) =>
      [...read(f).matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?"?(\w+)"?/gi)]
        .map((m) => m[1]!)
        .filter((t) => FORBIDDEN_TABLE.test(t))
        .map((t) => `${f}: ${t}`),
    );
    expect(bad).toEqual([]);
  });

  it("no catalog table has a user link or a progress/completion/history column", () => {
    const columns: string[] = [];
    for (const f of MIGRATIONS) {
      const sql = read(f);
      for (const m of sql.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(catalog_\w+)"?\s*\(([\s\S]*?)\n\);/gi,
      )) {
        for (const line of m[2]!.split("\n")) {
          const col = /^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i.exec(line)?.[1];
          if (col && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)$/i.test(col))
            columns.push(`${m[1]}.${col}`);
        }
      }
      for (const m of sql.matchAll(
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?(catalog_\w+)"?\s+([\s\S]*?);/gi,
      )) {
        for (const a of m[2]!.matchAll(
          /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s+[a-z]/gi,
        )) {
          if (!/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(a[1]!))
            columns.push(`${m[1]}.${a[1]}`);
        }
      }
    }
    // The parser really sees the catalog schema (guards against a vacuous pass).
    expect(columns).toEqual(
      expect.arrayContaining(["catalog_lessons.url", "catalog_courses.title"]),
    );
    // catalog_import_runs.actor is the admin who ran an import (audit), not a learner.
    const bad = columns.filter((c) => CATALOG_FORBIDDEN_COLUMN.test(c.split(".")[1]!));
    expect(bad).toEqual([]);
  });

  it("the catalog read selects only allowed lesson/course fields", () => {
    const src = read("src/lib/catalog/catalogData.server.ts");
    const selects = [...src.matchAll(/\.select\(\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(selects.length).toBe(2);
    const ALLOWED = new Set([
      "id",
      "key",
      "title",
      "url",
      "locale",
      "language_status",
      "active",
      "topics",
      "position",
      "summary",
      "track",
      "group:catalog_content_groups(key",
    ]);
    const fields = selects.flatMap((s) => s.split(",").map((x) => x.trim().replace(/\)$/, "")));
    expect(fields.filter((x) => !ALLOWED.has(x))).toEqual([]);
  });
});

describe("recommendations come from CS2 PRO data and logic only", () => {
  const candidate: CatalogCandidate = {
    id: "l1",
    kind: "lesson",
    title: "Smokes de Mirage",
    url: "https://hub.gamepro.academy/courses/cs2-in-game-br/lessons/smokes-mirage/",
    locale: "pt-BR",
    language_status: "confirmed",
    active: true,
    group_active: true,
    group_key: "in_game_utility",
    track: "counter_strike_in_game",
    topics: ["utility"],
    position: 1,
  };

  it("a recommendation carries only catalog reference fields and the CS2 PRO need", () => {
    const [rec] = pickRecommendations(
      [candidate],
      [{ topic: "utility", weight: 1, source: "dna", detail: "utility" }],
      "pt-BR",
    );
    expect(rec).toBeDefined();
    expect(Object.keys(rec!).sort()).toEqual(["id", "kind", "need", "title", "track", "url"]);
    expect(Object.keys(rec!.need).sort()).toEqual(["detail", "source", "topic", "weight"]);
  });

  it("needs only come from DNA, declared goals, maps played or the Coach message", () => {
    expect(read("src/lib/catalog/catalogSelect.ts")).toMatch(
      /export type NeedSource = "dna" \| "goal" \| "message" \| "map";/,
    );
  });

  it("the Coach receives title, URL, track and CS2 PRO's own reason, nothing from the LMS", () => {
    const coach = read("src/lib/coach.functions.ts");
    const mapped =
      /facts\.catalogSuggestions = pickRecommendations\([\s\S]*?\.map\(\(r\) => \(\{([\s\S]*?)\}\)\);/.exec(
        coach,
      )?.[1];
    expect(mapped).toBeDefined();
    const keys = [...mapped!.matchAll(/^\s*(\w+)\s*[:,]/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual(["kind", "reason", "title", "track", "url"]);
    const type = /catalogSuggestions: Array<\{([\s\S]*?)\}>;/.exec(
      read("src/lib/coach/coachContext.ts"),
    )?.[1];
    const typeKeys = [...type!.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(typeKeys).toEqual(["kind", "reason", "title", "track", "url"]);
  });

  it("the training plan and the Coach read only CS2 PRO tables", () => {
    for (const f of ["src/lib/training.functions.ts", "src/lib/coach.functions.ts"]) {
      const tables = [...read(f).matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]!);
      expect(tables.filter((t) => FORBIDDEN_TABLE.test(t))).toEqual([]);
    }
  });
});

describe("what the player is told", () => {
  const LOCALES: Locale[] = ["pt-BR", "pt-PT", "en", "es", "fr"];

  it("training copy never implies CS2 PRO sees lesson progress", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      const realTraining = Object.entries(dict).filter(([k]) => k.startsWith("training.real."));
      expect(realTraining.length, locale).toBeGreaterThan(10);
      const claims = realTraining.filter(([, v]) => /progr[eè]s|progreso/i.test(v));
      expect(claims, locale).toEqual([]);
      expect(dict["training.real.accessNote"], locale).toContain("hub.gamepro.academy");
    }
  });

  it("lesson links open in a new tab without referrer or opener", () => {
    const ui = read("src/components/training/RealTrainingPlan.tsx");
    expect(ui).toContain('target="_blank"');
    expect(ui).toContain('rel="noopener noreferrer"');
    expect(ui).not.toMatch(/rel="(?![^"]*noreferrer)[^"]*"/);
  });
});
