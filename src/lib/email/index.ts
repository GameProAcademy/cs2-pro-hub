/**
 * FASE 2.5 — GamePro email design system.
 *
 * Pure rendering only: nothing here sends an email, opens a connection or reads
 * a secret. Delivery of the AUTH family is Supabase's job (paste the exported
 * HTML in the auth email settings — see `docs/email/README.md`).
 */
export * from "./email.theme";
export * from "./email.components";
export * from "./email.layout";
export * from "./email.templates";
