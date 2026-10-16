import { readFile } from "node:fs/promises";
import type { RunReport } from "benchmark-core";

interface Price { id: string; promptUsdPerToken: number; completionUsdPerToken: number }
interface Prices { source: string; retrievedAt: string; models: Price[] }

function priced(model: Price): boolean {
  return Number.isFinite(model.promptUsdPerToken) && Number.isFinite(model.completionUsdPerToken)
    && model.promptUsdPerToken >= 0 && model.completionUsdPerToken >= 0;
}

function sanitizeCatalog(catalog: Prices): Prices {
  return { ...catalog, models: catalog.models.filter(priced) };
}
export interface EfficiencyMetrics {
  verifiedSuccesses: number; successRate: number; meanTurns: number; totalAttempts: number; retries: number;
  inputTokens: number | null; outputTokens: number | null; totalCostUsd: number | null;
  costPerAttempt: number | null; costPerVerifiedSuccess: number | null;
  costSource: "provider" | "estimated" | "mixed" | "unavailable";
}
export interface EfficiencyOptions {
  preferLive?: boolean;
  catalog?: Prices;
}
export type CostReport = RunReport & { efficiency: EfficiencyMetrics; pricing: { source: string; retrievedAt: string } };

async function prices(live: boolean): Promise<Prices> {
  if (live) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { accept: "application/json" } });
      if (response.ok) {
        const body = await response.json() as { data: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }> };
        return sanitizeCatalog({ source: "https://openrouter.ai/api/v1/models (live)", retrievedAt: new Date().toISOString(), models: body.data.map((item) => ({ id: item.id, promptUsdPerToken: Number(item.pricing?.prompt), completionUsdPerToken: Number(item.pricing?.completion) })) });
      }
    } catch { /* The committed snapshot is the documented offline fallback. */ }
  }
  return sanitizeCatalog(JSON.parse(await readFile(new URL("../data/prices.json", import.meta.url), "utf8")) as Prices);
}

export function estimateRowCostUsd(usage: { inputTokens?: number; outputTokens?: number }, price: Price): number {
  return (usage.inputTokens ?? 0) * price.promptUsdPerToken + (usage.outputTokens ?? 0) * price.completionUsdPerToken;
}

export async function addEfficiency(report: RunReport, options: boolean | EfficiencyOptions = {}): Promise<CostReport> {
  const { preferLive = false, catalog: given } = typeof options === "boolean" ? { preferLive: options, catalog: undefined } : options;
  const catalog = given ?? await prices(preferLive);
  const providerPrefix = /^(openrouter|openai|mock):/.exec(report.model)?.[1];
  const modelId = providerPrefix ? report.model.slice(providerPrefix.length + 1) : report.model;
  const price = catalog.models.find((item) => item.id === modelId && priced(item))
    ?? (providerPrefix === "openai" ? catalog.models.find((item) => item.id === `openai/${modelId}` && priced(item)) : undefined);
  const costs: Array<number | undefined> = [];
  const sources = new Set<"provider" | "estimated">();
  for (const row of report.rows) {
    const usage = row.usage;
    if (usage?.costUsd !== undefined && usage.costUsd > 0) { costs.push(usage.costUsd); sources.add("provider"); continue; }
    if (price && usage?.inputTokens !== undefined && usage.outputTokens !== undefined) {
      costs.push(estimateRowCostUsd(usage, price));
      sources.add("estimated");
      continue;
    }
    if (row.error !== undefined) { costs.push(0); continue; }
    costs.push(undefined);
  }
  const allKnown = costs.every((cost) => cost !== undefined);
  const totalCostUsd = allKnown ? costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0) : null;
  const verifiedSuccesses = report.rows.filter((row) => row.score === 1).length;
  const totalAttempts = report.rows.reduce((sum, row) => sum + row.attempts, 0);
  const turns = report.rows.map((row) => row.episode?.turns).filter((turn): turn is number => turn !== undefined);
  const input = report.rows.map((row) => row.usage?.inputTokens);
  const output = report.rows.map((row) => row.usage?.outputTokens);
  const source = !allKnown ? "unavailable" : sources.size > 1 ? "mixed" : [...sources][0] ?? "estimated";
  return { ...report, efficiency: {
    verifiedSuccesses, successRate: report.rows.length ? verifiedSuccesses / report.rows.length : 0,
    meanTurns: turns.length ? turns.reduce((sum, turn) => sum + turn, 0) / turns.length : 0,
    totalAttempts, retries: totalAttempts - report.rows.length,
    inputTokens: input.every((value) => value !== undefined) ? input.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    outputTokens: output.every((value) => value !== undefined) ? output.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    totalCostUsd, costPerAttempt: totalCostUsd === null || totalAttempts === 0 ? null : totalCostUsd / totalAttempts,
    costPerVerifiedSuccess: totalCostUsd === null || verifiedSuccesses === 0 ? null : totalCostUsd / verifiedSuccesses,
    costSource: source,
  }, pricing: { source: catalog.source, retrievedAt: catalog.retrievedAt } };
}

export function compareReports(reports: CostReport[]) {
  if (reports.length < 2) throw new Error("compare needs at least two report files.");
  const rows = reports.map((report) => ({ model: report.model, successRate: report.efficiency.successRate, costPerVerifiedSuccess: report.efficiency.costPerVerifiedSuccess, pareto: false }));
  for (const row of rows) {
    const cost = row.costPerVerifiedSuccess;
    if (cost !== null) row.pareto = !rows.some((other) => other !== row && other.costPerVerifiedSuccess !== null && other.successRate >= row.successRate && other.costPerVerifiedSuccess <= cost && (other.successRate > row.successRate || other.costPerVerifiedSuccess < cost));
  }
  return { metric: "success versus cost", rows: rows.sort((a, b) => b.successRate - a.successRate || (a.costPerVerifiedSuccess ?? Infinity) - (b.costPerVerifiedSuccess ?? Infinity)) };
}

const money = (value: number | null) => value === null ? "unavailable" : `$${value.toFixed(6)}`;
export function renderEfficiency(report: CostReport): string {
  return `## Efficiency\n\n| Metric | Value |\n| --- | ---: |\n| Verified successes | ${report.efficiency.verifiedSuccesses}/${report.rows.length} |\n| Success rate | ${(report.efficiency.successRate * 100).toFixed(1)}% |\n| Cost per verified success | ${money(report.efficiency.costPerVerifiedSuccess)} |\n| Cost per attempt | ${money(report.efficiency.costPerAttempt)} |\n| Mean turns | ${report.efficiency.meanTurns.toFixed(2)} |\n| Retries | ${report.efficiency.retries} |\n| Input / output tokens | ${report.efficiency.inputTokens ?? "unavailable"} / ${report.efficiency.outputTokens ?? "unavailable"} |\n| Cost source | ${report.efficiency.costSource} |`;
}

export function renderComparison(comparison: ReturnType<typeof compareReports>): string {
  const cell = (value: string) => [...value].filter((character) => { const code = character.charCodeAt(0); return code > 31 && (code < 127 || code > 159); }).join("").replaceAll("|", "\\|");
  return ["| Model | Success | Cost / verified success | Pareto |", "| --- | ---: | ---: | :---: |", ...comparison.rows.map((row) => `| ${cell(row.model)} | ${(row.successRate * 100).toFixed(1)}% | ${money(row.costPerVerifiedSuccess)} | ${row.pareto ? "yes" : "no"} |`)].join("\n");
}
