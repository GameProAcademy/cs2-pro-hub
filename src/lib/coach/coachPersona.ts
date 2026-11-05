/**
 * AI Coach humanization (Fase 4.0.1 B): how the Coach addresses the player and sounds like a
 * trainer, without weakening any data rule.
 *
 *  - Name: preferred name (coach_preferences.preferred_name) → player nickname → account
 *    nickname → display name → none. Never an e-mail, an e-mail's local part, a UUID or a
 *    Steam id; with none, the Coach simply says "you".
 *  - Use: the SERVER decides whether this reply may use the name (first reply of a
 *    conversation, then every 4th), so it is natural and never in every message. When it may
 *    not, a leading vocative ("Thiago, …") is removed.
 *  - Persona: direct, specific trainer voice; generic chatbot openers / closers are removed.
 *
 * Pure and synchronous: unit-tested directly.
 */
import type { Locale } from "@/i18n/config";

export const COACH_NAME_MAX = 32;
export const COACH_NAME_EVERY = 4;

export type CoachNameSource = "PREFERRED" | "PLAYER_NICKNAME" | "ACCOUNT_NICKNAME" | "DISPLAY_NAME";

export interface CoachAddress {
  name: string | null;
  source: CoachNameSource | null;
  /** Whether THIS reply may use the name (decided by the server, not the model). */
  useName: boolean;
}

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_DIGITS = /\d{7,}/; // Steam ids (17 digits), phone numbers, account numbers

/**
 * A safe name to address the player, or null. Strips markup and control characters, collapses
 * spaces; rejects anything that is (or contains) an e-mail, the local part of the account's
 * e-mail, a UUID or a long digit run.
 */
export function sanitizeCoachName(raw: unknown, email?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/[*_`#|<>[\]{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > COACH_NAME_MAX) return null;
  if (cleaned.includes("@") || /https?:|www\./i.test(cleaned)) return null;
  if (UUID_LIKE.test(cleaned) || LONG_DIGITS.test(cleaned)) return null;
  if (!/\p{L}/u.test(cleaned)) return null;
  const local = (email ?? "").split("@")[0]?.trim().toLowerCase() ?? "";
  if (local && cleaned.toLowerCase() === local) return null;
  return cleaned;
}

export function resolveCoachName(input: {
  preferred?: string | null;
  playerNickname?: string | null;
  accountNickname?: string | null;
  displayName?: string | null;
  email?: string | null;
}): { name: string | null; source: CoachNameSource | null } {
  const order: Array<[CoachNameSource, string | null | undefined]> = [
    ["PREFERRED", input.preferred],
    ["PLAYER_NICKNAME", input.playerNickname],
    ["ACCOUNT_NICKNAME", input.accountNickname],
    ["DISPLAY_NAME", input.displayName],
  ];
  for (const [source, raw] of order) {
    const name = sanitizeCoachName(raw, input.email);
    if (name) return { name, source };
  }
  return { name: null, source: null };
}

/** First reply of a conversation, then every COACH_NAME_EVERY replies. */
export function shouldUseName(previousCoachReplies: number): boolean {
  const n = Math.max(0, Math.floor(previousCoachReplies));
  return n % COACH_NAME_EVERY === 0;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GREETING = "(?:ol[áa]|oi|e a[íi]|hey|hi|hello|hola|buenas|salut|bonjour|coucou)";

/**
 * When the name may not be used in this reply, removes a leading vocative ("Thiago, …",
 * "Oi, Thiago! …"); the rest of the reply is untouched. Returns how many were removed.
 */
export function enforceNameUse(
  text: string,
  address: Pick<CoachAddress, "name" | "useName">,
): { text: string; removed: number } {
  if (!address.name || address.useName) return { text, removed: 0 };
  const re = new RegExp(
    `^(\\s*)(?:\\*\\*)?(?:${GREETING}[,!]?\\s+)?(?:\\*\\*)?${escape(address.name)}(?:\\*\\*)?\\s*[,!.:—–-]+\\s*`,
    "iu",
  );
  const m = text.match(re);
  if (!m) return { text, removed: 0 };
  const rest = text.slice(m[0].length);
  return { text: m[1] + rest.charAt(0).toLocaleUpperCase() + rest.slice(1), removed: 1 };
}

/**
 * Generic assistant filler that a trainer would not say. Matched per sentence; a sentence
 * that is only filler is removed, anything with substance stays.
 */
const CHATBOT: Record<Locale, RegExp[]> = {
  "pt-BR": [
    /^(?:que |[óo]tima|excelente|boa|grande) pergunta\b/i,
    /\bcomo (?:uma? )?(?:ia|intelig[êe]ncia artificial|modelo de linguagem|assistente(?: virtual)?)\b/i,
    /^espero (?:ter ajudado|que (?:isso|isto|essas dicas) (?:te |lhe )?ajude)/i,
    /^(?:fico feliz|estou aqui) (?:em|para) (?:te |lhe )?ajudar/i,
    /^(?:se (?:voc[êe] )?(?:precisar|tiver) (?:de )?mais (?:alguma )?(?:coisa|d[úu]vidas?)|qualquer (?:d[úu]vida|coisa),? (?:[ée] s[óo] )?(?:chamar|perguntar|falar))/i,
    /^(?:claro|com certeza|certamente)[!.]?$/i,
  ],
  "pt-PT": [
    /^(?:que |[óo]tima|excelente|boa|grande) pergunta\b/i,
    /\bcomo (?:uma? )?(?:ia|intelig[êe]ncia artificial|modelo de linguagem|assistente(?: virtual)?)\b/i,
    /^espero (?:ter ajudado|que (?:isso|isto) (?:te |lhe )?ajude)/i,
    /^(?:fico feliz|estou aqui) (?:em|para) (?:te |o |a )?ajudar/i,
    /^(?:se precisar(?:es)? de mais (?:alguma )?(?:coisa|ajuda)|qualquer (?:d[úu]vida|coisa),? (?:[ée] s[óo] )?(?:dizer|perguntar))/i,
    /^(?:claro|com certeza|certamente)[!.]?$/i,
  ],
  en: [
    /^(?:what a |that'?s a )?(?:great|excellent|good|fantastic) question\b/i,
    /\bas an? (?:ai|artificial intelligence|language model|ai (?:language )?model|assistant)\b/i,
    /^i hope (?:this|that|these tips) helps?\b/i,
    /^(?:i'?m (?:here|happy|glad) to help|happy to help)\b/i,
    /^(?:feel free to (?:ask|reach out)|let me know if you (?:need|have) (?:anything|any|more)|don'?t hesitate to ask)\b/i,
    /^(?:sure|certainly|of course|absolutely)[!.]?$/i,
  ],
  es: [
    /^(?:¡\s*)?(?:qu[ée] )?(?:excelente|buena|gran|muy buena) pregunta\b/i,
    /\bcomo (?:una? )?(?:ia|inteligencia artificial|modelo de lenguaje|asistente(?: virtual)?)\b/i,
    /^espero (?:haberte ayudado|que (?:esto|esta?s? consejos?) te (?:ayude|sirva)n?)/i,
    /^(?:estoy aqu[íi] para ayudarte|encantado de ayudarte|me alegra ayudarte)\b/i,
    /^(?:si necesitas algo m[áa]s|no dudes en preguntar|cualquier duda,? (?:me )?(?:dices|preguntas))/i,
    /^(?:¡\s*)?(?:claro|por supuesto|desde luego)[!.]?$/i,
  ],
  fr: [
    /^(?:quelle |c'est une |très )?(?:excellente|bonne|super) question\b/i,
    /\ben tant qu['’](?:ia|intelligence artificielle|assistant|mod[èe]le de langage)\b/i,
    /^j['’]esp[èe]re que (?:cela|ça|ces conseils) (?:t['’]|vous )?(?:aide|aidera|aideront)/i,
    /^(?:je suis (?:là|ravi) pour t['’]aider|ravi de t['’]aider)\b/i,
    /^(?:n['’]h[ée]site(?:z)? pas à (?:me )?(?:demander|poser)|si tu as (?:d['’]autres|besoin))/i,
    /^(?:bien s[ûu]r|certainement|absolument)[!.]?$/i,
  ],
};

const strip = (s: string) =>
  s
    .replace(/^[\s>*_¡!]+|[\s*_]+$/g, "")
    .replace(/^[\p{Emoji_Presentation}\s]+/u, "")
    .trim();

/** Removes chatbot filler sentences. Section headings, tables and substance are untouched. */
export function stripChatbotPhrases(
  text: string,
  locale: Locale,
): { text: string; removed: number } {
  const patterns = CHATBOT[locale];
  let removed = 0;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*(?:#|\|)/.test(line) || !line.trim()) {
      out.push(line);
      continue;
    }
    const prefix = line.match(/^\s*(?:[-*•]\s+|\d+\.\s+)?/)![0];
    const parts = line.slice(prefix.length).split(/(?<=[.!?])\s+(?=\S)/);
    const kept = parts.filter((s) => {
      const bare = strip(s);
      if (patterns.some((re) => re.test(bare))) {
        removed++;
        return false;
      }
      return true;
    });
    const body = kept.join(" ").trim();
    if (body) out.push(prefix + body);
  }
  return {
    text: out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    removed,
  };
}

/** Persona + addressing rules appended to the system prompt (in English, like the rest). */
export function coachPersonaRules(): string[] {
  return [
    "20. Voice: you are the player's CS2 trainer, not a generic assistant. Talk to them in the second person, directly and specifically, in short sentences, like a coach reviewing their demos with them: name what you see, why it matters in a round, and what to do next. Be encouraging only when the data supports it, never flattering. Never call yourself an AI, a language model or an assistant; you are the CS2 PRO Coach. Do not open with filler ('Great question', 'Sure!', 'As an AI…') and do not close with filler ('I hope this helps', 'Feel free to ask', 'I'm here to help'): start with the answer and end with the next step.",
    "21. Addressing: PLAYER_ADDRESS.name is how the player likes to be called. When PLAYER_ADDRESS.useName is true you may use the name ONCE in this reply, naturally (for example to open it); when it is false, do not use the name at all in this reply. When name is null, address the player as 'you' with no name. Never use an e-mail, a username, an id or any other identifier as a name, and never put the name inside the data section.",
  ];
}
