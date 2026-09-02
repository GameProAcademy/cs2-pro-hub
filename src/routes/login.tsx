import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { LanguageSelector } from "@/components/common/LanguageSelector";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FEATURES } from "@/config/app";
import { useT } from "@/i18n";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthLayout title={t("login.title")} subtitle={t("login.subtitle")}>
      {/* Language selector, top-right of the auth screen. */}
      <div className="pointer-events-auto absolute right-4 top-4 z-10">
        <LanguageSelector />
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Autenticação real ainda não implementada (FEATURES.realAuth = false).
          navigate({ to: "/dashboard" });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">{t("login.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("login.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full">
          {t("login.submit")}
        </Button>

        <Button type="button" variant="ghost" className="w-full">
          {t("login.forgot")}
        </Button>

        {!FEATURES.realAuth ? (
          <p className="rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-warning">{t("login.mockTitle")}</span>{" "}
            {t("login.mockBody")}
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}
