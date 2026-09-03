import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, isValidEmail, signUpErrorKey } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Criar conta — CS2 PRO AI COACH" },
      {
        name: "description",
        content:
          "Crie sua conta no CS2 PRO AI COACH para analisar suas partidas de CS2 e receber um plano de treinamento.",
      },
      { property: "og:title", content: "Criar conta — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Cadastre-se para transformar seus dados de partida em evolução competitiva.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [country, setCountry] = useState("");
  const [level, setLevel] = useState("");
  const [platform, setPlatform] = useState("");
  const [goal, setGoal] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!email.trim()) return setError(t("login.emailRequired"));
    if (!isValidEmail(email)) return setError(t("login.emailInvalid"));
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t("register.passwordMin"));
    if (password !== confirm) return setError(t("register.passwordMismatch"));

    setLoading(true);
    // The existing database trigger creates profiles/player_profiles from this
    // metadata — no extra insert is performed here.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: name.trim() || nickname.trim() || email.split("@")[0],
          nickname: nickname.trim() || null,
          country: country.trim() || null,
          current_level: level || null,
          main_platform: platform || null,
          competitive_goal: goal || null,
          locale,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(t(signUpErrorKey(signUpError.message)));
      return;
    }

    setLoading(false);

    // No session means email confirmation is required.
    if (!data.session) {
      setConfirmEmail(true);
      return;
    }

    navigate({ to: "/dashboard", replace: true });
  }

  if (confirmEmail) {
    return (
      <AuthLayout title={t("register.successTitle")} subtitle={t("register.checkEmail")}>
        <Button asChild className="w-full">
          <Link to="/login">{t("register.signIn")}</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <span className="text-muted-foreground">
          {t("register.hasAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("register.signIn")}
          </Link>
        </span>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">{t("register.name")}</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder={t("register.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nickname">{t("register.nickname")}</Label>
          <Input
            id="nickname"
            autoComplete="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("register.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">{t("register.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("register.confirmPassword")}</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("register.optional")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">{t("register.country")}</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">{t("register.level")}</Label>
              <Select value={level} onValueChange={setLevel} disabled={loading}>
                <SelectTrigger id="level">
                  <SelectValue placeholder={t("register.select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("register.level.beginner")}</SelectItem>
                  <SelectItem value="intermediate">{t("register.level.intermediate")}</SelectItem>
                  <SelectItem value="advanced">{t("register.level.advanced")}</SelectItem>
                  <SelectItem value="semi-pro">{t("register.level.semipro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform">{t("register.platform")}</Label>
              <Select value={platform} onValueChange={setPlatform} disabled={loading}>
                <SelectTrigger id="platform">
                  <SelectValue placeholder={t("register.select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faceit">FACEIT</SelectItem>
                  <SelectItem value="gamersclub">Gamers Club</SelectItem>
                  <SelectItem value="mm">{t("register.platform.mm")}</SelectItem>
                  <SelectItem value="esea">ESEA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">{t("register.goal")}</Label>
              <Select value={goal} onValueChange={setGoal} disabled={loading}>
                <SelectTrigger id="goal">
                  <SelectValue placeholder={t("register.select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rank">{t("register.goal.rank")}</SelectItem>
                  <SelectItem value="team">{t("register.goal.team")}</SelectItem>
                  <SelectItem value="pro">{t("register.goal.pro")}</SelectItem>
                  <SelectItem value="consistency">{t("register.goal.consistency")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive-foreground"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("register.submitting") : t("register.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
