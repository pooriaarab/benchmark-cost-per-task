import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { getBenchmark } from "./benchmark.js";
import { addEfficiency } from "./metrics.js";
import { attachTrackedUsage, withUsageTracking } from "./usage-tracker.js";

export type CostRunOptions = RunOptions & { tasks?: string };

export { benchmark, getBenchmark, loadTasksFrom, parseTasksArgv } from "./benchmark.js";
export { providerAdapter } from "./adapters.js";
export * from "./metrics.js";
export { attachTrackedUsage, withUsageTracking } from "./usage-tracker.js";

export const run = async (adapter: ModelAdapter, options?: CostRunOptions) => {
  const bench = getBenchmark(options?.tasks);
  const tracked = withUsageTracking(adapter);
  const base = await runBenchmark(bench, tracked.adapter, options);
  const report = attachTrackedUsage(base, tracked.usageFor);
  return addEfficiency(report, { preferLive: adapter.id.startsWith("openrouter:") && Boolean(process.env.OPENROUTER_API_KEY) });
};

export async function score(taskId: string, submission: Trace, tasksPath?: string) {
  const bench = getBenchmark(tasksPath);
  const task = await bench.getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return bench.score(task, submission);
}
