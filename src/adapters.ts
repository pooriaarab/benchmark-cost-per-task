import { mockAdapter, openaiCompatAdapter, openrouterAdapter, type Benchmark, type ModelAdapter } from "benchmark-core";
import type { CostTask } from "./benchmark-definition.js";

export function providerAdapter(provider: string, model: string, bench: Benchmark<CostTask>, seed: number): ModelAdapter {
  if (provider === "mock") {
    const adapter = mockAdapter<CostTask>({ seed, ...bench.definition.mockPolicies ? { policies: bench.definition.mockPolicies } : {} });
    return { ...adapter, id: `mock:${model}` };
  }
  if (provider === "openrouter") return openrouterAdapter({ model });
  if (provider === "openai") return openaiCompatAdapter({ model });
  throw new Error("--provider must be openrouter, openai, or mock.");
}
