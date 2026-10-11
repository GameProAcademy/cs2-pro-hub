/**
 * Loopback host for the application's OWN worker-facing route handlers.
 *
 *   bun scripts/queue/integration/bridge_host.ts <port>
 *
 * Nothing is reimplemented here: each request is handed to the POST handler
 * exported by the route file the application serves in production
 * (pipeline-worker.$action, h3e91-execution-event, h3e91-execution-lifecycle),
 * with the real supabase-js client. It exists so the end-to-end recovery probe
 * can run the TypeScript bridge against a disposable local Supabase stack.
 *
 * It refuses to start against anything that is not a loopback Supabase URL and
 * refuses NODE_ENV=production.
 */
import { Route as eventRoute } from "@/routes/api/public/h3e91-execution-event";
import { Route as lifecycleRoute } from "@/routes/api/public/h3e91-execution-lifecycle";
import { Route as workerRoute } from "@/routes/api/public/pipeline-worker.$action";

type Handler = (context: {
  request: Request;
  params: Record<string, string>;
}) => Response | Promise<Response>;

function post(route: unknown): Handler {
  const handler = (route as { options?: { server?: { handlers?: { POST?: Handler } } } }).options
    ?.server?.handlers?.POST;
  if (typeof handler !== "function") throw new Error("ROUTE_HAS_NO_POST_HANDLER");
  return handler;
}

const supabaseUrl = new URL(process.env["SUPABASE_URL"] ?? "http://invalid.invalid");
if (!["localhost", "127.0.0.1"].includes(supabaseUrl.hostname)) {
  throw new Error("BRIDGE_HOST_IS_LOOPBACK_ONLY");
}
if (process.env["NODE_ENV"] === "production") throw new Error("BRIDGE_HOST_REFUSES_PRODUCTION");
if (!process.env["DEMO_PIPELINE_BRIDGE_SECRET"]) throw new Error("BRIDGE_SECRET_REQUIRED");

// Diagnostics only: the handlers answer `worker_error` without a cause, so a
// failed call to the local stack is logged here. Method, path without query
// and status; never headers, never a body.
const upstreamFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  try {
    const response = await upstreamFetch(input, init);
    if (response.status >= 400) {
      console.error(`[bridge-host] upstream ${method} ${url.pathname} -> ${response.status}`);
    }
    return response;
  } catch (error) {
    const name = error instanceof Error ? error.name : "error";
    console.error(`[bridge-host] upstream ${method} ${url.pathname} threw ${name}`);
    throw error;
  }
}) as typeof fetch;

const worker = post(workerRoute);
const event = post(eventRoute);
const lifecycle = post(lifecycleRoute);
const prefix = "/api/public/pipeline-worker/";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.argv[2] ?? 0),
  idleTimeout: 255,
  maxRequestBodySize: 64 * 1024 * 1024,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return new Response(null, { status: 405 });
    try {
      if (path === "/api/public/h3e91-execution-event") return await event({ request, params: {} });
      if (path === "/api/public/h3e91-execution-lifecycle")
        return await lifecycle({ request, params: {} });
      if (path.startsWith(prefix))
        return await worker({ request, params: { action: path.slice(prefix.length) } });
      return new Response(null, { status: 404 });
    } catch (error) {
      console.error(`[bridge-host] unhandled ${error instanceof Error ? error.name : "error"}`);
      return Response.json({ error: "host_error" }, { status: 500 });
    }
  },
});
console.log(`BRIDGE_HOST_READY ${server.port}`);
