#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createCli, renderMarkdown, type RunReport } from "benchmark-core";
import { benchmark } from "./benchmark.js";
import { addEfficiency, compareReports, renderComparison, renderEfficiency, type CostReport } from "./metrics.js";

const core = createCli(benchmark, { bin: "benchmark-cost-per-task" });

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "compare") {
    const json = argv.includes("--json");
    const files = argv.slice(1).filter((arg) => arg !== "--json");
    try {
      const reports = await Promise.all(files.map(async (file) => {
        const value = JSON.parse(await readFile(file, "utf8")) as RunReport | CostReport;
        if (!value || !Array.isArray(value.rows) || value.rows.length === 0 || typeof value.model !== "string") throw new Error(`Invalid report: ${file}`);
        return "efficiency" in value ? value : addEfficiency(value);
      }));
      const comparison = compareReports(reports);
      console.log(json ? JSON.stringify(comparison) : renderComparison(comparison)); return 0;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); return 1; }
  }
  if (argv[0] !== "run") return core.main(argv);
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
