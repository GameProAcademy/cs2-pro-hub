import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FEATURES } from "@/config/app";

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
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthLayout
      title="Login"
      subtitle="Entre para visualizar seu CS2 PRO Score, seu Player DNA e seu plano de treinamento."
      footer={
        <span className="text-muted-foreground">
          Não tem conta?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Autenticação real ainda não implementada (FEATURES.realAuth = false).
          // Navegação temporária apenas para permitir a navegação da interface.
          navigate({ to: "/dashboard" });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
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
          Entrar
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild type="button" variant="outline" className="w-full">
            <Link to="/register">Criar conta</Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full">
            Esqueci minha senha
          </Button>
        </div>

        {!FEATURES.realAuth ? (
          <p className="rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-warning">Sem autenticação real.</span> Esta etapa
            entrega apenas a interface: nenhuma credencial é validada, salva ou enviada. O botão
            abaixo apenas abre a navegação da aplicação.
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}
