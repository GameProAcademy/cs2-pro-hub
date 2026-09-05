import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useT, type TranslationKey } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  validatePasswordChange,
  type PasswordFormError,
} from "@/lib/password";
import { cn } from "@/lib/utils";

const ERROR_KEYS: Record<Exclude<PasswordFormError, null>, TranslationKey> = {
  currentRequired: "security.errorCurrent",
  tooShort: "security.errorShort",
  mismatch: "security.errorMismatch",
  sameAsCurrent: "security.errorSame",
};

/**
 * Change password from inside the app.
 *
 * Security model (only officially supported Supabase Auth mechanisms):
 * 1. the current password is re-verified with `signInWithPassword`, so a
 *    hijacked open session cannot silently take over the account;
 * 2. `supabase.auth.reauthenticate()` is then requested. When the project has
 *    Secure password change enabled, Supabase emails a one-time nonce and the
 *    update only completes with `updateUser({ password, nonce })`. The email
 *    never carries the password — only the nonce, which Supabase issues and
 *    expires itself;
 * 3. when reauthentication by nonce is not available for this project/session,
 *    the change completes right after the verified current password. The UI does
 *    not claim an email confirmation that did not happen.
 *
 * Passwords live only in local component state: never persisted, logged, put in
 * a URL, in storage, in metadata or in the audit log.
 */
export function PasswordCard() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nonce, setNonce] = useState("");
  const [stage, setStage] = useState<"form" | "confirm">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(next);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setNonce("");
    setStage("form");
  }

  async function applyPassword(withNonce?: string) {
    const { error: updateError } = await supabase.auth.updateUser(
      withNonce ? { password: next, nonce: withNonce } : { password: next },
    );
    if (updateError) return false;
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(false);

    const invalid = validatePasswordChange({ current, next, confirm });
    if (invalid) {
      setError(t(ERROR_KEYS[invalid]));
      return;
    }

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      setLoading(false);
      setError(t("security.errorGeneric"));
      return;
    }

    // Re-authentication: proves the person at the keyboard knows the current
    // password. A failure here never reveals anything beyond "incorrect".
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (reauthError) {
      setLoading(false);
      setError(t("security.errorWrongCurrent"));
      return;
    }

    // Official secure-password-change path: Supabase issues a one-time nonce by
    // email. The nonce never contains the password.
    const { error: nonceError } = await supabase.auth.reauthenticate();
    if (!nonceError) {
      setLoading(false);
      setStage("confirm");
      return;
    }

    const ok = await applyPassword();
    setLoading(false);
    if (!ok) {
      setError(t("security.errorGeneric"));
      return;
    }
    reset();
    setSuccess(true);
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (!nonce.trim()) {
      setError(t("security.errorGeneric"));
      return;
    }
    setLoading(true);
    const ok = await applyPassword(nonce.trim());
    setLoading(false);
    if (!ok) {
      // Wrong, expired or already used code: nothing changed.
      setError(t("security.errorGeneric"));
      return;
    }
    reset();
    setSuccess(true);
  }

  async function handleResend() {
    if (loading) return;
    setLoading(true);
    const { error: resendError } = await supabase.auth.reauthenticate();
    setLoading(false);
    if (resendError) setError(t("security.errorGeneric"));
  }

  return (
    <ChartCard title={t("security.title")} showDemoTag={false}>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("security.subtitle")}</p>

      {stage === "form" ? (
        <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="current-password">{t("security.currentPassword")}</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">{t("security.newPassword")}</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={loading}
            />
            {next ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("security.strengthLabel")}:{" "}
                <span
                  className={cn(
                    strength === "strong" && "text-primary",
                    strength === "fair" && "text-accent",
                    strength === "weak" && "text-destructive",
                  )}
                >
                  {t(`security.strength.${strength}`)}
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("security.confirmPassword")}</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive-foreground"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground"
            >
              {t("security.success")}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("security.submitting") : t("security.submit")}
          </Button>
        </form>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={handleConfirm} noValidate>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            {t("security.confirmTitle")}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("security.confirmSent")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="password-nonce">{t("security.confirmCode")}</Label>
            <Input
              id="password-nonce"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              disabled={loading}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive-foreground"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? t("security.submitting") : t("security.confirmSubmit")}
            </Button>
            <Button type="button" variant="outline" onClick={handleResend} disabled={loading}>
              {t("security.resend")}
            </Button>
          </div>
        </form>
      )}
    </ChartCard>
  );
}
