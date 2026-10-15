import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { addEfficiency } from "./metrics.js";
export { benchmark };
export * from "./metrics.js";
export const run = async (adapter: ModelAdapter, options?: RunOptions) => addEfficiency(await runBenchmark(benchmark, adapter, options), adapter.id.startsWith("openrouter:") && Boolean(process.env.OPENROUTER_API_KEY));
export async function score(taskId: string, submission: Trace) {
  const task = await benchmark.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return benchmark.score(task, submission);
}
