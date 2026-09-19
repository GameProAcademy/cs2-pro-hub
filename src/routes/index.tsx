import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GamePro | CS2 Pro AI Coach" },
      {
        name: "description",
        content:
          "Entre na GamePro para analisar partidas de CS2 e evoluir com coaching orientado por dados.",
      },
      { property: "og:title", content: "GamePro | CS2 Pro AI Coach" },
      {
        property: "og:description",
        content: "Analise partidas de CS2 e evolua com coaching orientado por dados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
