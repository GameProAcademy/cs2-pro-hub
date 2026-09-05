import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Defina uma nova senha para sua conta do CS2 PRO AI COACH.",
      },
      { property: "og:title", content: "Redefinir senha — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Recuperação de acesso à plataforma de análise de performance para CS2.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase exchanges the recovery link for a session before this mounts;
    // onAuthStateChange also fires PASSWORD_RECOVERY on slower exchanges.
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) setHasRecoverySession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session));
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) return setError(t("register.passwordMin"));
    if (password !== confirm) return setError(t("register.passwordMismatch"));

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(t("reset.genericError"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title={t("reset.title")} subtitle={t("reset.success")}>
        <Button asChild className="w-full">
          <Link to="/login">{t("login.submit")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("reset.title")} subtitle={t("reset.subtitle")}>
      {ready && !hasRecoverySession ? (
        <div className="space-y-4">
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive-foreground"
          >
            {t("reset.invalidLink")}
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t("login.backToLogin")}</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("reset.newPassword")}</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || !ready}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("reset.confirmPassword")}</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading || !ready}
              required
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

          <Button type="submit" className="w-full" disabled={loading || !ready}>
            {loading ? t("reset.submitting") : t("reset.submit")}
          </Button>
          <Button asChild type="button" variant="ghost" className="w-full">
            <Link to="/login">{t("login.backToLogin")}</Link>
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
