import { createHandler } from "benchmark-core";
import { getBenchmark } from "./benchmark.js";

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tasks = url.searchParams.get("tasks") ?? undefined;
  return createHandler(getBenchmark(tasks))(request);
}
