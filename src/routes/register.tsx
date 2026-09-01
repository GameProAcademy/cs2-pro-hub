import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

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
import { FEATURES } from "@/config/app";

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
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Criar sua conta"
      subtitle="Leva menos de um minuto. Os campos opcionais ajudam a calibrar sua análise no futuro."
      footer={
        <span className="text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Nenhum banco de dados ou cadastro real nesta etapa.
          navigate({ to: "/dashboard" });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" placeholder="Seu nome ou nickname" autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" placeholder="seu@email.com" autoComplete="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" autoComplete="new-password" />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Opcional
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input id="country" placeholder="Brasil" />
            </div>
            <div className="space-y-2">
              <Label>Nível atual</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iniciante">Iniciante</SelectItem>
                  <SelectItem value="intermediario">Intermediário</SelectItem>
                  <SelectItem value="avancado">Avançado</SelectItem>
                  <SelectItem value="semi-pro">Semi-profissional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plataforma principal</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faceit">FACEIT</SelectItem>
                  <SelectItem value="gamersclub">Gamers Club</SelectItem>
                  <SelectItem value="mm">Matchmaking</SelectItem>
                  <SelectItem value="esea">ESEA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Objetivo competitivo</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rank">Subir de rank/level</SelectItem>
                  <SelectItem value="time">Entrar em um time</SelectItem>
                  <SelectItem value="pro">Carreira profissional</SelectItem>
                  <SelectItem value="consistencia">Ganhar consistência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full">
          Criar conta
        </Button>

        {!FEATURES.realAuth ? (
          <p className="rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-warning">Cadastro não persistido.</span> Nenhum banco de
            dados está conectado nesta etapa — os dados preenchidos não são salvos.
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}
