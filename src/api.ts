import { isAbsolute, relative, resolve } from "node:path";
import { createHandler } from "benchmark-core";
import { getBenchmark } from "./benchmark.js";

const TASKS_DIR = resolve("var");

function allowedTasksPath(value: string): string | undefined {
  const full = resolve(value);
  const rel = relative(TASKS_DIR, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || !full.endsWith(".jsonl")) return undefined;
  return full;
}

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("tasks");
  if (requested === null) return createHandler(getBenchmark())(request);
  const tasks = allowedTasksPath(requested);
  if (!tasks) return Response.json({ error: "tasks must be a .jsonl file under var/." }, { status: 400 });
  return createHandler(getBenchmark(tasks))(request);
}
