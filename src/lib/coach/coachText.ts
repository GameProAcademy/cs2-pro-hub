/**
 * AI Coach reply text → safe, readable blocks (pure; no HTML is ever produced).
 *
 * Models sometimes answer with LaTeX (`\frac{kills}{deaths}`, `\text{KAST}`, `$...$`)
 * even when told not to (production test 2026-10-28, `openai/gpt-oss-20b` via
 * OpenRouter). The page has no math renderer, so math markup is rewritten into plain
 * text instead of being shown literally. The output is a list of typed blocks that the
 * React component renders as text nodes: model output can never become markup.
 */

const SYMBOLS: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  approx: "≈",
  neq: "≠",
  ne: "≠",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  pm: "±",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  infty: "∞",
  sum: "Σ",
  Delta: "Δ",
  ldots: "…",
  dots: "…",
  cdots: "…",
};

const WRAPPERS = /\\(?:text|textbf|textit|mathrm|mathbf|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g;

/** Rewrite LaTeX math markup into plain, readable text. Idempotent on plain text. */
export function plainMath(input: string): string {
  let text = input;
  // Delimiters: $$..$$, \[..\], \(..\) always; $..$ only when it contains a command,
  // so prices like "$5" stay untouched.
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  text = text.replace(/\$([^$\n]*\\[a-zA-Z][^$\n]*)\$/g, "$1");
  // \left( \right) and spacing commands.
  text = text.replace(/\\(?:left|right)\s*([()[\]|.])/g, (_, d: string) => (d === "." ? "" : d));
  text = text.replace(/\\(?:quad|qquad|,|;|:|!)/g, " ");
  // Text wrappers (repeat for nesting).
  for (let i = 0; i < 5; i++) {
    const next = text.replace(WRAPPERS, "$1");
    if (next === text) break;
    text = next;
  }
  // Fractions, innermost first.
  const frac = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/;
  for (let i = 0; i < 10 && frac.test(text); i++) {
    text = text.replace(frac, (_, a: string, b: string) => {
      const wrap = (v: string) => (/[\s+\-×·]/.test(v.trim()) ? `(${v.trim()})` : v.trim());
      return `${wrap(a)} / ${wrap(b)}`;
    });
  }
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  text = text.replace(/\^\{2\}|\^2(?![0-9])/g, "²");
  text = text.replace(/\^\{([^{}]*)\}/g, "^$1");
  text = text.replace(/_\{([^{}]*)\}/g, "_$1");
  text = text.replace(/\\%/g, "%");
  text = text.replace(/\\([a-zA-Z]+)/g, (_, cmd: string) => SYMBOLS[cmd] ?? cmd);
  // Braces left over from removed commands.
  text = text.replace(/\{([^{}]*)\}/g, "$1");
  return text;
}

export type CoachBlock =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "space" };

const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Parse the (math-normalised) reply into blocks. Malformed input degrades to paragraphs. */
export function coachBlocks(content: string): CoachBlock[] {
  const lines = plainMath(content).split("\n");
  const blocks: CoachBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (!line.trim()) {
      if (blocks.at(-1)?.kind !== "space") blocks.push({ kind: "space" });
      continue;
    }
    // Pipe table: header line, separator line, then rows that keep the pipes.
    if (line.includes("|") && i + 1 < lines.length && SEPARATOR.test(lines[i + 1]!)) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) {
        const row = cells(lines[i]!);
        rows.push(header.map((_, c) => row[c] ?? ""));
        i++;
      }
      i--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (SEPARATOR.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;
    // Code-fence markers (``` or ```lang) are dropped; the fenced lines render as text.
    if (/^\s*(`{3,}|~{3,})[\w-]*\s*$/.test(line)) continue;
    // Blockquote marker: the quoted text is shown as a plain paragraph, never a literal ">".
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (quote[1]!.trim()) blocks.push({ kind: "paragraph", text: quote[1]!.trim() });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1]!.trim() });
      continue;
    }
    const bullet = /^\s*(?:[-*•+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[1]!.trim() });
      continue;
    }
    blocks.push({ kind: "paragraph", text: line.trim() });
  }
  while (blocks[0]?.kind === "space") blocks.shift();
  while (blocks.at(-1)?.kind === "space") blocks.pop();
  return blocks;
}

export type InlinePart = { kind: "text" | "bold" | "italic" | "code"; text: string };

/**
 * **bold**, *italic* and `code` spans; anything else (including stray * or <tags>) stays text.
 * Italic needs non-space text right inside both asterisks, so "2 * 3 * 4" stays text.
 */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // Bold may wrap an italic span ("**Prática em *Cache***", production 2026-10-29); the inner
  // asterisks are dropped and the whole span renders bold.
  const re = /\*\*((?:[^*\n]|\*(?!\*))+?\*?)\*\*(?!\*)|`([^`]+)`|\*(?![\s*])([^*\n]*?[^\s*])\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "bold", text: m[1].replace(/\*/g, "") });
    else if (m[2] !== undefined) parts.push({ kind: "code", text: m[2] });
    else parts.push({ kind: "italic", text: m[3]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
