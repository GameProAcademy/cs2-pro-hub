import { createFileRoute } from "@tanstack/react-router";
import { handleH3E91ExecutionBridge } from "@/lib/pipeline/h3e91ExecutionBridge.server";

export const Route = createFileRoute("/api/public/h3e91-execution-event")({
  server: { handlers: { POST: ({ request }) => handleH3E91ExecutionBridge(request) } },
});
