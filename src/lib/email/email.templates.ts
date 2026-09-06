/**
 * FASE 2.5 — GamePro email templates.
 *
 * Two families:
 *  1. AUTH templates, rendered with Supabase's Go placeholders
 *     (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`) so the exported
 *     HTML can be pasted into the auth email settings as-is.
 *  2. PRODUCT templates, rendered with real values from server code.
 *
 * No template ever contains a secret, a password, a session token or a full
 * SteamID64 — account identifiers are always masked before they reach a message.
 */
import {
  button,
  codeBlock,
  detailList,
  divider,
  fallbackLink,
  heading,
  muted,
  notice,
  paragraph,
} from "./email.components";
import { renderEmailLayout } from "./email.layout";
import type { EmailLocale as EmailLocaleValue } from "./email.locale";

export type { EmailLocale } from "./email.locale";

/**
 * The AUTH family is delivered by the auth backend from exported HTML files, so
 * it stays on the two locales that were exported and reviewed. Product emails
 * (the ones this app sends itself) cover all five.
 */
export type AuthLocale = "pt-BR" | "en";

function authLocaleOf(locale: EmailLocaleValue): AuthLocale {
  return locale === "pt-BR" || locale === "pt-PT" ? "pt-BR" : "en";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Plain-text fallback derived from the copy, never from the HTML. */
function textOf(lines: Array<string | null>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n\n");
}

/* ------------------------------------------------------------------ *
 * AUTH templates (Supabase placeholders)                              *
 * ------------------------------------------------------------------ */

const AUTH_URL = "{{ .ConfirmationURL }}";
const AUTH_TOKEN = "{{ .Token }}";

interface AuthCopy {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  cta: string;
  fallbackIntro: string;
  security: string;
  footer: string;
  codeIntro?: string;
}

type AuthTemplateId =
  "confirm_signup" | "magic_link" | "invite" | "recovery" | "email_change" | "reauthentication";

const AUTH_COPY: Record<AuthLocale, Record<AuthTemplateId, AuthCopy>> = {
  "pt-BR": {
    confirm_signup: {
      subject: "Confirme seu e-mail — GamePro",
      preheader: "Falta um clique para ativar sua conta.",
      title: "Confirme seu e-mail",
      intro:
        "Você criou uma conta no CS2 PRO AI COACH. Confirme seu e-mail para começar a analisar suas partidas.",
      cta: "Confirmar e-mail",
      fallbackIntro: "Se o botão não funcionar, copie e cole este endereço no navegador:",
      security: "O link expira em pouco tempo e só pode ser usado uma vez.",
      footer:
        "Você recebeu este e-mail porque alguém usou este endereço para criar uma conta no GamePro. Se não foi você, ignore esta mensagem.",
    },
    magic_link: {
      subject: "Seu link de acesso — GamePro",
      preheader: "Entre na sua conta sem digitar senha.",
      title: "Seu link de acesso",
      intro: "Use o botão abaixo para entrar na sua conta.",
      cta: "Entrar na conta",
      fallbackIntro: "Se o botão não funcionar, copie e cole este endereço no navegador:",
      security: "O link expira em pouco tempo e só pode ser usado uma vez. Nunca o compartilhe.",
      footer:
        "Você recebeu este e-mail porque um acesso foi solicitado para esta conta. Se não foi você, ignore esta mensagem e sua conta continua segura.",
    },
    invite: {
      subject: "Você foi convidado — GamePro",
      preheader: "Seu acesso ao CS2 PRO AI COACH está pronto.",
      title: "Você foi convidado",
      intro:
        "Um administrador criou um acesso para você no CS2 PRO AI COACH. Defina sua senha para começar.",
      cta: "Aceitar convite",
      fallbackIntro: "Se o botão não funcionar, copie e cole este endereço no navegador:",
      security: "O convite expira em pouco tempo e só pode ser usado uma vez.",
      footer: "Você recebeu este e-mail porque foi convidado para o GamePro.",
    },
    recovery: {
      subject: "Redefinir sua senha — GamePro",
      preheader: "Crie uma nova senha para sua conta.",
      title: "Redefinir sua senha",
      intro: "Recebemos um pedido para redefinir a senha desta conta.",
      cta: "Criar nova senha",
      fallbackIntro: "Se o botão não funcionar, copie e cole este endereço no navegador:",
      security:
        "O link expira em pouco tempo e só pode ser usado uma vez. Sua senha atual continua válida até você criar a nova.",
      footer:
        "Se você não pediu isso, ignore esta mensagem: nada será alterado sem você concluir o processo.",
    },
    email_change: {
      subject: "Confirme seu novo e-mail — GamePro",
      preheader: "Confirme a troca de endereço da sua conta.",
      title: "Confirme seu novo e-mail",
      intro:
        "Você pediu para trocar o e-mail da sua conta. Confirme o novo endereço para concluir.",
      cta: "Confirmar novo e-mail",
      fallbackIntro: "Se o botão não funcionar, copie e cole este endereço no navegador:",
      security: "Enquanto a confirmação não acontecer, seu e-mail antigo continua ativo.",
      footer: "Se você não pediu essa troca, ignore esta mensagem e troque sua senha.",
    },
    reauthentication: {
      subject: "Seu código de confirmação — GamePro",
      preheader: "Use este código para confirmar a alteração.",
      title: "Código de confirmação",
      intro: "Use o código abaixo para confirmar a alteração solicitada na sua conta.",
      codeIntro: "Seu código de uso único:",
      cta: "",
      fallbackIntro: "",
      security: "O código expira em poucos minutos. Nunca o compartilhe com ninguém.",
      footer:
        "Você recebeu este e-mail porque uma alteração sensível foi solicitada na sua conta GamePro.",
    },
  },
  en: {
    confirm_signup: {
      subject: "Confirm your email — GamePro",
      preheader: "One click away from activating your account.",
      title: "Confirm your email",
      intro:
        "You created a CS2 PRO AI COACH account. Confirm your email to start analysing your matches.",
      cta: "Confirm email",
      fallbackIntro: "If the button does not work, copy and paste this address into your browser:",
      security: "The link expires shortly and can only be used once.",
      footer:
        "You received this email because this address was used to create a GamePro account. If that was not you, ignore this message.",
    },
    magic_link: {
      subject: "Your sign-in link — GamePro",
      preheader: "Sign in without typing a password.",
      title: "Your sign-in link",
      intro: "Use the button below to sign in to your account.",
      cta: "Sign in",
      fallbackIntro: "If the button does not work, copy and paste this address into your browser:",
      security: "The link expires shortly, can only be used once, and must never be shared.",
      footer:
        "You received this email because a sign-in was requested for this account. If that was not you, ignore it — your account stays safe.",
    },
    invite: {
      subject: "You have been invited — GamePro",
      preheader: "Your CS2 PRO AI COACH access is ready.",
      title: "You have been invited",
      intro:
        "An administrator created an access for you on CS2 PRO AI COACH. Set your password to begin.",
      cta: "Accept invitation",
      fallbackIntro: "If the button does not work, copy and paste this address into your browser:",
      security: "The invitation expires shortly and can only be used once.",
      footer: "You received this email because you were invited to GamePro.",
    },
    recovery: {
      subject: "Reset your password — GamePro",
      preheader: "Create a new password for your account.",
      title: "Reset your password",
      intro: "We received a request to reset this account's password.",
      cta: "Create new password",
      fallbackIntro: "If the button does not work, copy and paste this address into your browser:",
      security:
        "The link expires shortly and can only be used once. Your current password stays valid until you set a new one.",
      footer: "If you did not request this, ignore the message: nothing changes until you finish.",
    },
    email_change: {
      subject: "Confirm your new email — GamePro",
      preheader: "Confirm the new address for your account.",
      title: "Confirm your new email",
      intro: "You asked to change your account email. Confirm the new address to finish.",
      cta: "Confirm new email",
      fallbackIntro: "If the button does not work, copy and paste this address into your browser:",
      security: "Until you confirm, your previous email stays active.",
      footer: "If you did not request this change, ignore this message and change your password.",
    },
    reauthentication: {
      subject: "Your confirmation code — GamePro",
      preheader: "Use this code to confirm the change.",
      title: "Confirmation code",
      intro: "Use the code below to confirm the change requested on your account.",
      codeIntro: "Your one-time code:",
      cta: "",
      fallbackIntro: "",
      security: "The code expires in a few minutes. Never share it with anyone.",
      footer:
        "You received this email because a sensitive change was requested on your GamePro account.",
    },
  },
};

export const AUTH_TEMPLATE_IDS: readonly AuthTemplateId[] = [
  "confirm_signup",
  "magic_link",
  "invite",
  "recovery",
  "email_change",
  "reauthentication",
];

/** Renders one Supabase auth template, placeholders included. */
export function renderAuthEmail(
  id: AuthTemplateId,
  locale: EmailLocaleValue = "pt-BR",
): RenderedEmail {
  const copy = AUTH_COPY[authLocaleOf(locale)][id];
  const isCode = id === "reauthentication";
  const body = [
    heading(copy.title),
    paragraph(copy.intro),
    isCode
      ? `${muted(copy.codeIntro ?? "")}${codeBlock(AUTH_TOKEN)}`
      : `${button(copy.cta, AUTH_URL)}${fallbackLink(copy.fallbackIntro, AUTH_URL)}`,
    notice(copy.security, "warning"),
    divider(),
    muted(copy.footer),
  ].join("\n");

  return {
    subject: copy.subject,
    html: renderEmailLayout({
      subject: copy.subject,
      preheader: copy.preheader,
      body,
      footerNote: copy.footer,
      lang: locale,
    }),
    text: textOf([
      copy.title,
      copy.intro,
      isCode ? `${copy.codeIntro ?? ""} ${AUTH_TOKEN}` : AUTH_URL,
      copy.security,
      copy.footer,
    ]),
  };
}

/* ------------------------------------------------------------------ *
 * PRODUCT templates — security notices, five languages                *
 * ------------------------------------------------------------------ */

export interface SteamLinkEmailInput {
  /** Player-facing name. */
  name: string | null;
  /** MASKED SteamID64. The full value is never emailed. */
  steamIdMasked: string;
  personaName: string | null;
  occurredAt: string;
  locale?: EmailLocaleValue;
}

interface SteamCopy {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  /** Steam is IDENTITY only; the copy must never imply match imports. */
  capability: string;
  warn: string;
  footer: string;
  greeting: string;
  labelAccount: string;
  labelPersona: string;
  labelDate: string;
}

const LINKED_COPY: Record<EmailLocaleValue, SteamCopy> = {
  "pt-BR": {
    subject: "Sua conta Steam foi vinculada — GamePro",
    preheader: "Confirmação de vinculação de conta.",
    title: "Sua conta Steam foi vinculada",
    intro:
      "A vinculação foi confirmada pelo login oficial da Steam. A partir de agora sua identidade está verificada no GamePro.",
    capability:
      "O login da Steam confirma sua identidade. Ele não traz partidas nem estatísticas: seus dados de desempenho continuam vindo das fontes de dados apropriadas.",
    warn: "Se não foi você, desvincule a conta no seu perfil e troque sua senha imediatamente.",
    footer:
      "Você recebeu este aviso de segurança porque uma conta externa foi vinculada ao seu perfil GamePro.",
    greeting: "Olá",
    labelAccount: "Conta Steam",
    labelPersona: "Apelido",
    labelDate: "Data",
  },
  "pt-PT": {
    subject: "A sua conta Steam foi associada — GamePro",
    preheader: "Confirmação de associação de conta.",
    title: "A sua conta Steam foi associada",
    intro:
      "A associação foi confirmada pela sessão oficial da Steam. A sua identidade está agora verificada no GamePro.",
    capability:
      "A sessão da Steam confirma a sua identidade. Não traz partidas nem estatísticas: os dados de desempenho continuam a vir das fontes de dados adequadas.",
    warn: "Se não foi você, desassocie a conta no seu perfil e altere a palavra-passe imediatamente.",
    footer:
      "Recebeu este aviso de segurança porque uma conta externa foi associada ao seu perfil GamePro.",
    greeting: "Olá",
    labelAccount: "Conta Steam",
    labelPersona: "Alcunha",
    labelDate: "Data",
  },
  en: {
    subject: "Your Steam account was linked — GamePro",
    preheader: "Account link confirmation.",
    title: "Your Steam account was linked",
    intro:
      "The link was confirmed by the official Steam sign-in. Your identity is now verified on GamePro.",
    capability:
      "Signing in with Steam confirms your identity. It brings no matches and no statistics: performance data still comes from the appropriate data sources.",
    warn: "If this was not you, unlink the account in your profile and change your password immediately.",
    footer:
      "You received this security notice because an external account was linked to your GamePro profile.",
    greeting: "Hi",
    labelAccount: "Steam account",
    labelPersona: "Persona",
    labelDate: "Date",
  },
  es: {
    subject: "Tu cuenta de Steam fue vinculada — GamePro",
    preheader: "Confirmación de vinculación de cuenta.",
    title: "Tu cuenta de Steam fue vinculada",
    intro:
      "La vinculación fue confirmada por el inicio de sesión oficial de Steam. Tu identidad ya está verificada en GamePro.",
    capability:
      "El inicio de sesión de Steam confirma tu identidad. No trae partidas ni estadísticas: los datos de rendimiento siguen viniendo de las fuentes de datos correspondientes.",
    warn: "Si no fuiste tú, desvincula la cuenta en tu perfil y cambia tu contraseña de inmediato.",
    footer:
      "Recibiste este aviso de seguridad porque una cuenta externa fue vinculada a tu perfil de GamePro.",
    greeting: "Hola",
    labelAccount: "Cuenta de Steam",
    labelPersona: "Apodo",
    labelDate: "Fecha",
  },
  fr: {
    subject: "Votre compte Steam a été lié — GamePro",
    preheader: "Confirmation de liaison de compte.",
    title: "Votre compte Steam a été lié",
    intro:
      "La liaison a été confirmée par la connexion officielle Steam. Votre identité est désormais vérifiée sur GamePro.",
    capability:
      "La connexion Steam confirme votre identité. Elle n'apporte ni matchs ni statistiques : vos données de performance proviennent toujours des sources de données appropriées.",
    warn: "Si ce n'était pas vous, dissociez le compte dans votre profil et changez votre mot de passe immédiatement.",
    footer:
      "Vous recevez cet avis de sécurité parce qu'un compte externe a été lié à votre profil GamePro.",
    greeting: "Bonjour",
    labelAccount: "Compte Steam",
    labelPersona: "Pseudo",
    labelDate: "Date",
  },
};

const UNLINKED_COPY: Record<EmailLocaleValue, SteamCopy> = {
  "pt-BR": {
    subject: "Sua conta Steam foi desvinculada — GamePro",
    preheader: "Confirmação de desvinculação.",
    title: "Sua conta Steam foi desvinculada",
    intro:
      "A verificação de identidade pela Steam foi revogada. Nada foi apagado: partidas, análises e histórico continuam no lugar.",
    capability:
      "A Steam serve apenas para confirmar identidade. Seus dados de desempenho continuam vindo das fontes de dados apropriadas.",
    warn: "Se não foi você, entre na sua conta e troque sua senha imediatamente.",
    footer:
      "Você recebeu este aviso de segurança porque uma conta externa foi desvinculada do seu perfil GamePro.",
    greeting: "Olá",
    labelAccount: "Conta Steam",
    labelPersona: "Apelido",
    labelDate: "Data",
  },
  "pt-PT": {
    subject: "A sua conta Steam foi desassociada — GamePro",
    preheader: "Confirmação de desassociação.",
    title: "A sua conta Steam foi desassociada",
    intro:
      "A verificação de identidade pela Steam foi revogada. Nada foi eliminado: partidas, análises e histórico mantêm-se.",
    capability:
      "A Steam serve apenas para confirmar identidade. Os dados de desempenho continuam a vir das fontes de dados adequadas.",
    warn: "Se não foi você, entre na sua conta e altere a palavra-passe imediatamente.",
    footer:
      "Recebeu este aviso de segurança porque uma conta externa foi desassociada do seu perfil GamePro.",
    greeting: "Olá",
    labelAccount: "Conta Steam",
    labelPersona: "Alcunha",
    labelDate: "Data",
  },
  en: {
    subject: "Your Steam account was unlinked — GamePro",
    preheader: "Unlink confirmation.",
    title: "Your Steam account was unlinked",
    intro:
      "Steam identity verification was revoked. Nothing was deleted: matches, analyses and history all stay in place.",
    capability:
      "Steam only confirms identity. Your performance data still comes from the appropriate data sources.",
    warn: "If this was not you, sign in and change your password immediately.",
    footer:
      "You received this security notice because an external account was unlinked from your GamePro profile.",
    greeting: "Hi",
    labelAccount: "Steam account",
    labelPersona: "Persona",
    labelDate: "Date",
  },
  es: {
    subject: "Tu cuenta de Steam fue desvinculada — GamePro",
    preheader: "Confirmación de desvinculación.",
    title: "Tu cuenta de Steam fue desvinculada",
    intro:
      "La verificación de identidad por Steam fue revocada. No se eliminó nada: partidas, análisis e historial siguen en su lugar.",
    capability:
      "Steam solo confirma identidad. Tus datos de rendimiento siguen viniendo de las fuentes de datos correspondientes.",
    warn: "Si no fuiste tú, inicia sesión y cambia tu contraseña de inmediato.",
    footer:
      "Recibiste este aviso de seguridad porque una cuenta externa fue desvinculada de tu perfil de GamePro.",
    greeting: "Hola",
    labelAccount: "Cuenta de Steam",
    labelPersona: "Apodo",
    labelDate: "Fecha",
  },
  fr: {
    subject: "Votre compte Steam a été dissocié — GamePro",
    preheader: "Confirmation de dissociation.",
    title: "Votre compte Steam a été dissocié",
    intro:
      "La vérification d'identité par Steam a été révoquée. Rien n'a été supprimé : matchs, analyses et historique restent en place.",
    capability:
      "Steam ne sert qu'à confirmer l'identité. Vos données de performance proviennent toujours des sources de données appropriées.",
    warn: "Si ce n'était pas vous, connectez-vous et changez votre mot de passe immédiatement.",
    footer:
      "Vous recevez cet avis de sécurité parce qu'un compte externe a été dissocié de votre profil GamePro.",
    greeting: "Bonjour",
    labelAccount: "Compte Steam",
    labelPersona: "Pseudo",
    labelDate: "Date",
  },
};

function renderSteamNotice(copy: SteamCopy, input: SteamLinkEmailInput): RenderedEmail {
  const locale = input.locale ?? "pt-BR";
  const rows = [
    { label: copy.labelAccount, value: input.steamIdMasked },
    ...(input.personaName ? [{ label: copy.labelPersona, value: input.personaName }] : []),
    { label: copy.labelDate, value: input.occurredAt },
  ];

  const body = [
    heading(copy.title),
    paragraph(input.name ? `${copy.greeting}, ${input.name}. ${copy.intro}` : copy.intro),
    detailList(rows),
    notice(copy.capability, "info"),
    notice(copy.warn, "danger"),
    divider(),
    muted(copy.footer),
  ].join("\n");

  return {
    subject: copy.subject,
    html: renderEmailLayout({
      subject: copy.subject,
      preheader: copy.preheader,
      body,
      footerNote: copy.footer,
      lang: locale,
    }),
    text: textOf([
      copy.title,
      copy.intro,
      rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
      copy.capability,
      copy.warn,
      copy.footer,
    ]),
  };
}

/** "Your Steam account was linked" — a security notification, not marketing. */
export function renderSteamLinkedEmail(input: SteamLinkEmailInput): RenderedEmail {
  return renderSteamNotice(LINKED_COPY[input.locale ?? "pt-BR"], input);
}

/** "Your Steam account was unlinked" — same security-notice discipline. */
export function renderSteamUnlinkedEmail(input: SteamLinkEmailInput): RenderedEmail {
  return renderSteamNotice(UNLINKED_COPY[input.locale ?? "pt-BR"], input);
}
