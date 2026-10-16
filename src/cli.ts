#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { bootstrapCI, createCli, renderMarkdown, serve, type RunReport } from "benchmark-core";
import { handler } from "./api.js";
import { providerAdapter } from "./adapters.js";
import { getBenchmark, parseTasksArgv } from "./benchmark.js";
import { addEfficiency, compareReports, renderComparison, renderEfficiency, type CostReport } from "./metrics.js";
import { run } from "./index.js";
import { startMcp } from "./mcp.js";

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
  const { tasksPath, argv: rest } = parseTasksArgv(argv);
  const bench = getBenchmark(tasksPath);
  const core = createCli(bench, { bin: "benchmark-cost-per-task" });

  if (rest[0] === "compare") {
    const json = rest.includes("--json");
    const files = rest.slice(1).filter((arg) => arg !== "--json");
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

  if (rest[0] === "run") {
    let runArgv = [...rest];
    if (runArgv.includes("--provider") && runArgv[runArgv.indexOf("--provider") + 1] === "mock" && !runArgv.includes("--model")) runArgv = [...runArgv, "--model", "offline"];
    const json = runArgv.includes("--json");
    const clean = runArgv.slice(1).filter((arg) => arg !== "--json");
    try {
      const parsed = parseArgs({ args: clean, options: { model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" }, timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" }, "max-turns": { type: "string" }, "max-tool-calls": { type: "string" }, budget: { type: "string" } }, strict: true });
      const model = parsed.values.model;
      const provider = parsed.values.provider;
      if (!model || !provider) throw new Error("run needs --model and --provider.");
      const seed = Number(parsed.values.seed ?? 1);
      const report = await run(providerAdapter(provider, model, bench, seed), {
        ...parsed.values.concurrency ? { concurrency: Number(parsed.values.concurrency) } : {},
        ...parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {},
        ...parsed.values.retries ? { retries: Number(parsed.values.retries) } : {},
        seed,
        ...parsed.values["max-turns"] ? { maxTurns: Number(parsed.values["max-turns"]) } : {},
        ...parsed.values["max-tool-calls"] ? { maxToolCalls: Number(parsed.values["max-tool-calls"]) } : {},
        ...parsed.values.budget ? { budgetUsd: Number(parsed.values.budget) } : {},
        ...tasksPath ? { tasks: tasksPath } : {},
      });
      console.log(json ? JSON.stringify(report) : `${renderMarkdown(report)}\n\n${renderEfficiency(report)}`);
      return report.rows.some((row) => row.error) ? 2 : 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (rest[0] === "score") {
    const json = rest.includes("--json");
    const file = rest.slice(1).filter((arg) => arg !== "--json")[0];
    try {
      if (!file) throw new Error("score needs a results JSON file.");
      const original: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!validReport(original)) throw new Error("File is not a run report.");
      const rows = [];
      for (const row of original.rows) {
        const task = await bench.getTask(row.taskId);
        if (!task || row.submission === undefined) throw new Error(`Cannot score task ${row.taskId}.`);
        const grade = await bench.score(task, row.submission, { seed: original.seed });
        rows.push({ ...row, score: grade.score, reason: grade.reason });
      }
      const scores = rows.map((row) => row.score);
      const rescored = await addEfficiency({ ...original, rows, mean: scores.reduce((sum, item) => sum + item, 0) / scores.length, confidenceInterval95: bootstrapCI(scores, original.seed) });
      console.log(json ? JSON.stringify(rescored) : `${renderMarkdown(rescored)}\n\n${renderEfficiency(rescored)}`);
      return 0;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); return 1; }
  }

  if (rest[0] === "serve") {
    const clean = rest.slice(1).filter((arg) => arg !== "--json");
    const parsed = parseArgs({ args: clean, options: { host: { type: "string" } }, allowPositionals: true, strict: true });
    if (parsed.positionals.length > 1) throw new Error("serve accepts at most one port.");
    const port = Number(parsed.positionals[0] ?? process.env.PORT ?? 3000);
    const hostname = parsed.values.host ?? "127.0.0.1";
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("serve port must be an integer from 0 to 65535.");
    await serve(handler, { port, hostname });
    console.log(`Listening on http://${hostname}:${port}`);
    return 0;
  }
  if (rest[0] === "mcp") {
    await startMcp();
    return 0;
  }
  return core.main(rest);
}

process.exitCode = await main(process.argv.slice(2));
