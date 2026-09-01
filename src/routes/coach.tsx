import { createFileRoute } from "@tanstack/react-router";
import { Bot, Send, User } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEATURES } from "@/config/app";
import { getCoachHistory } from "@/services/playerService";
import type { CoachMessage } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "AI Coach — CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Converse com o AI Coach sobre seus gargalos, decisões de round e plano de treino.",
      },
      { property: "og:title", content: "AI Coach — CS2 PRO AI COACH" },
      {
        property: "og:description",
        content: "Interface de conversa com o coach de performance de CS2.",
      },
    ],
  }),
  component: CoachPage,
});

const PLACEHOLDER_REPLY =
  "Exemplo de resposta (demonstrativa). O AI Coach ainda não está conectado a nenhum modelo de linguagem nesta etapa, portanto esta é uma mensagem fixa apenas para demonstrar a interface.";

function Bubble({ message }: { message: CoachMessage }) {
  const isCoach = message.role === "coach";
  return (
    <div className={cn("flex gap-3", isCoach ? "justify-start" : "justify-end")}>
      {isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Bot className="size-4" aria-hidden />
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-lg border px-4 py-3 text-sm leading-relaxed sm:max-w-[70%]",
          isCoach
            ? "border-border bg-card text-foreground"
            : "border-primary/25 bg-primary/10 text-foreground",
        )}
      >
        {isCoach ? (
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
            Mensagem de exemplo
          </p>
        ) : null}
        <p>{message.content}</p>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">{message.time}</p>
      </div>
      {!isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
          <User className="size-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function CoachPage() {
  const [messages, setMessages] = useState<CoachMessage[]>(getCoachHistory());
  const [draft, setDraft] = useState("");

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    // Nenhuma chamada de API é feita: a resposta abaixo é um texto fixo local.
    setMessages((prev) => [
      ...prev,
      { id: `p-${prev.length}`, role: "player", content, time },
      { id: `c-${prev.length + 1}`, role: "coach", content: PLACEHOLDER_REPLY, time },
    ]);
    setDraft("");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Coach"
          title="AI Coach"
          description="Pergunte sobre um round, um mapa ou um gargalo específico do seu diagnóstico."
        />

        {!FEATURES.aiCoachApi ? (
          <p className="rounded-lg border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-warning">Coach não conectado.</span> Nenhuma API de IA
            está integrada nesta etapa. As respostas exibidas são textos fixos de demonstração.
          </p>
        ) : null}

        <section className="surface-panel flex h-[62vh] min-h-[420px] flex-col rounded-lg border border-border">
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>

          <div className="border-t border-border p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Escreva sua pergunta para o coach…"
                className="min-h-[52px] resize-none"
              />
              <Button onClick={send} className="h-[52px] gap-2 px-4" aria-label="Enviar mensagem">
                <Send className="size-4" aria-hidden />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
