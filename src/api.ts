import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHandler } from "benchmark-core";
import { providerAdapter } from "./adapters.js";
import { getBenchmark } from "./benchmark.js";
import { run } from "./index.js";

const TASKS_DIR = resolve("var");

function allowedTasksPath(value: string): string | undefined {
  const full = resolve(value);
  const rel = relative(TASKS_DIR, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || !full.endsWith(".jsonl")) return undefined;
  return full;
}

const stripExpected = async (response: Response): Promise<Response> => {
  const body: unknown = await response.json();
  const strip = (task: unknown) => {
    if (task !== null && typeof task === "object" && !Array.isArray(task)) delete (task as Record<string, unknown>).expected;
    return task;
  };
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const value = body as Record<string, unknown>;
    if (Array.isArray(value.tasks)) value.tasks = value.tasks.map(strip);
    if (value.task !== undefined) value.task = strip(value.task);
  }
  return Response.json(body, { status: response.status });
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

async function runRoute(request: Request): Promise<Response> {
  const payload: unknown = await request.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.model !== "string" || !payload.model) {
    return Response.json({ error: "POST /v1/run needs a JSON body with a model string." }, { status: 400 });
  }
  const provider = payload.provider ?? "openrouter";
  if (provider !== "mock" && provider !== "openrouter" && provider !== "openai") {
    return Response.json({ error: "provider must be openrouter, openai, or mock." }, { status: 400 });
  }
  if (provider === "openrouter" && !process.env.OPENROUTER_API_KEY) return Response.json({ error: "OPENROUTER_API_KEY is required." }, { status: 400 });
  if (provider === "openai" && !process.env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY is required." }, { status: 400 });
  const tasks = typeof payload.tasks === "string" ? allowedTasksPath(payload.tasks) : undefined;
  if (typeof payload.tasks === "string" && !tasks) return Response.json({ error: "tasks must be a .jsonl file under var/." }, { status: 400 });
  if (tasks && hiddenDenied(tasks)) return hiddenResponse();
  const seed = typeof payload.seed === "number" && Number.isInteger(payload.seed) ? payload.seed : 1;
  const retries = typeof payload.retries === "number" && Number.isInteger(payload.retries) && payload.retries >= 0 ? Math.min(payload.retries, 5) : 0;
  try {
    const report = await run(providerAdapter(provider, payload.model, getBenchmark(tasks), seed), { seed, retries, ...tasks ? { tasks } : {} });
    return Response.json(report);
  } catch (error) {
    console.error("POST /v1/run failed:", error);
    return Response.json({ error: "The benchmark run failed." }, { status: 500 });
  }
}

const hiddenDenied = (tasks: string): boolean =>
  tasks.split(sep).some((part) => part.toLowerCase().includes("hidden")) && process.env.BCPT_SERVE_HIDDEN !== "1";

const hiddenResponse = () => Response.json({ error: "Serving hidden task files requires BCPT_SERVE_HIDDEN=1 on the server." }, { status: 403 });

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/v1/run") return runRoute(request);
  const requested = url.searchParams.get("tasks");
  if (requested === null) return createHandler(getBenchmark())(request);
  const tasks = allowedTasksPath(requested);
  if (!tasks) return Response.json({ error: "tasks must be a .jsonl file under var/." }, { status: 400 });
  if (hiddenDenied(tasks)) return hiddenResponse();
  const response = await createHandler(getBenchmark(tasks))(request);
  if (request.method === "GET" && (url.pathname === "/v1/tasks" || url.pathname.startsWith("/v1/tasks/"))) {
    return stripExpected(response);
  }
  return response;
}
