import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { authErrorKey, fetchAccountStatus, isValidEmail, touchLastLogin } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Acesse o CS2 PRO AI COACH e acompanhe sua análise de performance em Counter-Strike 2.",
      },
      { property: "og:title", content: "Entrar — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Plataforma de análise de performance e treinamento personalizado para CS2.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signIn" | "forgot">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError(t("login.emailRequired"));
    if (!isValidEmail(email)) return setError(t("login.emailInvalid"));
    if (!password) return setError(t("login.passwordRequired"));

    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setLoading(false);
      setError(t(authErrorKey(signInError?.message)));
      return;
    }

    // Fail-closed: only a confirmed active profile is allowed through; RLS
    // remains the security layer in the database.
    const status = await fetchAccountStatus(data.user.id);
    if (status !== "active") {
      await supabase.auth.signOut();
      setLoading(false);
      setError(t("login.inactive"));
      return;
    }

    await touchLastLogin();
    setLoading(false);
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError(t("login.emailRequired"));
    if (!isValidEmail(email)) return setError(t("login.emailInvalid"));

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Rate limits / transport failures are surfaced; account existence never is.
    if (resetError && resetError.status && resetError.status >= 429) {
      setError(t("login.genericError"));
      return;
    }
    // Generic message: never reveal whether the account exists.
    setNotice(t("login.forgotSent"));
  }

  const isForgot = mode === "forgot";

  return (
    <AuthLayout
      title={isForgot ? t("login.forgotTitle") : t("login.title")}
      subtitle={isForgot ? t("login.forgotSubtitle") : t("login.subtitle")}
    >
      <form className="space-y-4" onSubmit={isForgot ? handleForgot : handleSignIn} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t("login.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {!isForgot ? (
          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive-foreground"
          >
            {error}
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground"
          >
            {notice}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? isForgot
              ? t("login.forgotSending")
              : t("login.loading")
            : isForgot
              ? t("login.forgotSubmit")
              : t("login.submit")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={loading}
          onClick={() => {
            setMode(isForgot ? "signIn" : "forgot");
            setError(null);
            setNotice(null);
            setPassword("");
          }}
        >
          {isForgot ? t("login.backToLogin") : t("login.forgot")}
        </Button>
      </form>
    </AuthLayout>
  );
}
