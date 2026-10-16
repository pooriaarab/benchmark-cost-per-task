import { readFile } from "node:fs/promises";
import { defineBenchmark, type Benchmark } from "benchmark-core";
import { createBenchmarkDefinition, type CostTask } from "./benchmark-definition.js";

const DEFAULT_TASKS = new URL("../data/tasks.jsonl", import.meta.url);
const cache = new Map<string, Benchmark<CostTask>>();

export async function loadTasksFrom(tasksPath?: string): Promise<CostTask[]> {
  const target = tasksPath ? tasksPath : DEFAULT_TASKS;
  const text = typeof target === "string"
    ? await readFile(target, "utf8")
    : await readFile(target, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as CostTask);
}

export function getBenchmark(tasksPath?: string): Benchmark<CostTask> {
  const key = tasksPath ?? "";
  let bench = cache.get(key);
  if (!bench) {
    bench = defineBenchmark({ ...createBenchmarkDefinition(), loadTasks: () => loadTasksFrom(tasksPath) });
    cache.set(key, bench);
  }
  return bench;
}

export function parseTasksArgv(argv: string[]): { tasksPath?: string; argv: string[] } {
  const out: string[] = [];
  let tasksPath: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--tasks") {
      const path = argv[index + 1];
      if (!path) throw new Error("--tasks requires a file path.");
      tasksPath = path;
      index++;
      continue;
    }
    if (arg !== undefined) out.push(arg);
  }
  return { ...tasksPath ? { tasksPath } : {}, argv: out };
}
