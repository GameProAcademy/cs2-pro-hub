import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  validatePasswordChange,
  type PasswordFormError,
} from "@/lib/password";
import { cn } from "@/lib/utils";

const ERROR_KEYS: Record<Exclude<PasswordFormError, null>, string> = {
  currentRequired: "security.errorCurrent",
  tooShort: "security.errorShort",
  mismatch: "security.errorMismatch",
  sameAsCurrent: "security.errorSame",
};

/**
 * Change password from inside the app.
 *
 * The current password is re-verified against Supabase Auth before the new one
 * is applied, so a hijacked open session cannot silently take over the account.
 * Passwords are only ever held in local component state.
 */
export function PasswordCard() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(next);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setSuccess(false);

    const invalid = validatePasswordChange({ current, next, confirm });
    if (invalid) {
      setError(t(ERROR_KEYS[invalid] as never));
      return;
    }

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      setLoading(false);
      setError(t("security.errorGeneric" as never));
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
      setError(t("security.errorWrongCurrent" as never));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (updateError) {
      setError(t("security.errorGeneric" as never));
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setSuccess(true);
  }

  return (
    <ChartCard title={t("security.title" as never)} showDemoTag={false}>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("security.subtitle" as never)}
      </p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="current-password">{t("security.currentPassword" as never)}</Label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">{t("security.newPassword" as never)}</Label>
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
              {t("security.strengthLabel" as never)}:{" "}
              <span
                className={cn(
                  strength === "strong" && "text-primary",
                  strength === "fair" && "text-accent",
                  strength === "weak" && "text-destructive",
                )}
              >
                {t(`security.strength.${strength}` as never)}
              </span>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t("security.confirmPassword" as never)}</Label>
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
            {t("security.success" as never)}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("security.submitting" as never) : t("security.submit" as never)}
        </Button>
      </form>
    </ChartCard>
  );
}
