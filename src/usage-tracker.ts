import type { ChatRequest, ChatResult, CompletionResult, ModelAdapter, ModelAdapterContext, ModelUsage, RunReport } from "benchmark-core";

function mergeUsage(current: ModelUsage | undefined, next?: ModelUsage, costUsd?: number): ModelUsage | undefined {
  if (!next && costUsd === undefined) return current;
  const merged: ModelUsage = { ...current };
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (next?.[key] !== undefined) merged[key] = (merged[key] ?? 0) + (next[key] ?? 0);
  }
  const addedCost = costUsd ?? next?.costUsd;
  if (addedCost !== undefined) merged.costUsd = (merged.costUsd ?? 0) + addedCost;
  return merged;
}

export function withUsageTracking(adapter: ModelAdapter) {
  const byTask = new Map<string, ModelUsage>();
  const track = (taskId: string, usage?: ModelUsage, costUsd?: number) => {
    const merged = mergeUsage(byTask.get(taskId), usage, costUsd);
    if (merged) byTask.set(taskId, merged);
  };
  const wrapped: ModelAdapter = {
    id: adapter.id,
    async complete(prompt: string, context: ModelAdapterContext): Promise<CompletionResult> {
      const result = await adapter.complete(prompt, context);
      track(context.task.id, result.usage, result.costUsd);
      return result;
    },
    async chat(request: ChatRequest, context: ModelAdapterContext): Promise<ChatResult> {
      const result = await adapter.chat(request, context);
      track(context.task.id, result.usage, result.costUsd);
      return result;
    },
  };
  return { adapter: wrapped, usageFor: (taskId: string) => byTask.get(taskId) };
}

export function attachTrackedUsage(report: RunReport, usageFor: (taskId: string) => ModelUsage | undefined): RunReport {
  const rows = report.rows.map((row) => {
    const usage = usageFor(row.taskId);
    return usage ? { ...row, usage } : row;
  });
  return rows === report.rows ? report : { ...report, rows };
}
