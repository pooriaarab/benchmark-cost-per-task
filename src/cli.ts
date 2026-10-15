#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createCli, renderMarkdown, type RunReport } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { addEfficiency, compareReports, renderComparison, renderEfficiency, type CostReport } from "./metrics.js";

const core = createCli(benchmark, { bin: "benchmark-cost-per-task" });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function validReport(value: unknown): value is RunReport | CostReport {
  if (!record(value) || typeof value.model !== "string" || !Array.isArray(value.rows) || value.rows.length === 0) return false;
  for (const row of value.rows) {
    if (!record(row) || !finite(row.score) || row.score < 0 || row.score > 1 || !finite(row.attempts) || !Number.isInteger(row.attempts) || row.attempts < 1) return false;
    if (row.usage !== undefined) {
      if (!record(row.usage)) return false;
      const usage = row.usage;
      if (["inputTokens", "outputTokens", "totalTokens", "costUsd"].some((key) => usage[key] !== undefined && (!finite(usage[key]) || (usage[key] as number) < 0))) return false;
    }
    if (row.episode !== undefined && (!record(row.episode) || !finite(row.episode.turns) || !Number.isInteger(row.episode.turns) || row.episode.turns < 0)) return false;
  }
  if (value.efficiency !== undefined) {
    if (!record(value.efficiency) || !finite(value.efficiency.successRate) || value.efficiency.successRate < 0 || value.efficiency.successRate > 1 || (value.efficiency.costPerVerifiedSuccess !== null && (!finite(value.efficiency.costPerVerifiedSuccess) || (value.efficiency.costPerVerifiedSuccess as number) < 0))) return false;
  }
  return true;
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "compare") {
    const json = argv.includes("--json");
    const files = argv.slice(1).filter((arg) => arg !== "--json");
    try {
      const reports = await Promise.all(files.map(async (file) => {
        const value: unknown = JSON.parse(await readFile(file, "utf8"));
        if (!validReport(value)) throw new Error(`Invalid report: ${file}`);
        return "efficiency" in value ? value : addEfficiency(value);
      }));
      const comparison = compareReports(reports);
      console.log(json ? JSON.stringify(comparison) : renderComparison(comparison)); return 0;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); return 1; }
  }
  if (argv[0] !== "run") return core.main(argv);
  if (argv.includes("--provider") && argv[argv.indexOf("--provider") + 1] === "mock" && !argv.includes("--model")) argv = [...argv, "--model", "offline"];
  const json = argv.includes("--json"); let output = "";
  const original = console.log;
  console.log = (...values: unknown[]) => { output += `${values.join(" ")}\n`; };
  let code: number;
  try { code = await core.main(json ? argv : [...argv, "--json"]); }
  finally { console.log = original; }
  if (code !== 0) return code;
  const base = JSON.parse(output) as RunReport;
  const report = await addEfficiency(base, base.model.startsWith("openrouter:") && Boolean(process.env.OPENROUTER_API_KEY));
  original(json ? JSON.stringify(report) : `${renderMarkdown(report)}\n\n${renderEfficiency(report)}`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
