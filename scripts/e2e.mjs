import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCallback);

await execFile("npm", ["run", "build"]);
const cli = await execFile(process.execPath, ["dist/cli.js", "run", "--model", "offline", "--provider", "mock", "--json"], { maxBuffer: 1_000_000 });
const readable = await execFile(process.execPath, ["dist/cli.js", "run", "--provider", "mock"], { maxBuffer: 1_000_000 });
assert.match(readable.stdout, /Score: \*\*53\.3%\*\*/);
assert.match(readable.stdout, /Verified successes \| 16\/30/);
assert.match(readable.stdout, /Cost per verified success \| unavailable/);
assert.match(readable.stdout, /## Efficiency/);
const report = JSON.parse(cli.stdout);
assert.equal(report.rows.length, 30);
assert.ok(report.rows.some((row) => row.score === 1));
assert.ok(report.rows.some((row) => row.score === 0));
assert.ok(report.rows.every((row) => row.error === undefined));
assert.equal(report.efficiency.costPerVerifiedSuccess, null);
assert.equal(report.efficiency.costSource, "unavailable");

const { benchmark, addEfficiency, estimateRowCostUsd, getBenchmark, run } = await import("../dist/index.js");
const { handler } = await import("../dist/api.js");
const tasks = await benchmark.listTasks();
const goodScores = [];
for (const task of tasks) {
  const calls = benchmark.definition.mockPolicies.good(task)[0].toolCalls;
  goodScores.push((await benchmark.score(task, { toolLog: calls.map((call) => ({ ...call, result: null })) })).score);
}
assert.ok(goodScores.every((score) => score === 1));

const constants = [{ answer: "yes" }, { answer: "no" }, { answer: "0" }, { answer: "done" }, { answer: "zebra-493" }];
const badPolicies = {
  empty: () => ({}),
  refuse: () => ({ answer: "I cannot help with this request." }),
  forged: (task) => ({ finalState: task.expected }),
  sameCall: () => ({ toolLog: [{ name: "finish_task", args: {}, result: { finished: true } }] }),
  burnTokens: (task) => ({ toolLog: [
    ...Array.from({ length: 40 }, () => ({ name: "read_file", args: { path: Object.keys(task.input.files)[0] ?? "missing.txt" }, result: null })),
    { name: "finish_task", args: {}, result: { finished: true } },
  ] }),
  reserved: (task) => ({ toolLog: [
    { name: "write_file", args: { path: "__proto__", content: "x" }, result: null },
    { name: "update_record", args: { id: task.input.records[0]?.id ?? "missing", fields: { constructor: 1 } }, result: null },
    { name: "finish_task", args: {}, result: { finished: true } },
  ] }),
  ...Object.fromEntries(constants.map((constant, index) => [`constant-${index}`, () => constant])),
};
for (const [name, candidate] of Object.entries(badPolicies)) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, candidate(task))));
  assert.ok(scores.reduce((sum, item) => sum + item.score, 0) / scores.length <= 0.1, `${name} policy scored too high`);
}

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/probe-task.jsonl", `${JSON.stringify(tasks[0])}\n`);

// Retry spend must be summed across attempts through a real run loop.
const flaky = { episodes: 0 };
const flakyAdapter = {
  id: "probe:flaky",
  async complete() { throw new Error("episode benchmark does not call complete"); },
  async chat(request, context) {
    const usage = { inputTokens: 30000, outputTokens: 0, totalTokens: 30000, costUsd: 0.03 };
    if (context.turn === 1) {
      return { content: "", toolCalls: [{ id: "f-1", name: "read_file", args: { path: Object.keys(context.task.input.files)[0] ?? "missing.txt" } }], usage, costUsd: 0.03 };
    }
    if (flaky.episodes === 0) { flaky.episodes += 1; throw new Error("Request timed out"); }
    return { content: "", toolCalls: [{ id: "f-2", name: "finish_task", args: {} }], usage, costUsd: 0.03 };
  },
};
const retried = await run(flakyAdapter, { tasks: "artifacts/probe-task.jsonl", retries: 1 });
assert.equal(retried.rows[0].attempts, 2);
assert.equal(retried.rows[0].usage.inputTokens, 90000);
assert.equal(retried.efficiency.totalCostUsd, 0.09);
assert.equal(retried.efficiency.retries, 1);
assert.equal(retried.efficiency.costSource, "provider");

// A task that fails every attempt still reports spend; an errored row without usage is known zero, never null.
const deadAdapter = {
  id: "probe:dead",
  async complete() { throw new Error("provider down"); },
  async chat() { throw new Error("provider down"); },
};
const failed = await run(deadAdapter, { tasks: "artifacts/probe-task.jsonl", retries: 1 });
assert.equal(failed.rows[0].attempts, 2);
assert.ok(failed.rows[0].error);
assert.equal(failed.rows[0].usage, undefined);
assert.notEqual(failed.efficiency.totalCostUsd, null);
assert.equal(failed.efficiency.totalCostUsd, 0);

// A provider that reports tokens but no cost is estimated from the price snapshot, not trusted as $0.
const silentAdapter = {
  id: "openai:gpt-4o-mini",
  async complete() { throw new Error("episode benchmark does not call complete"); },
  async chat(request, context) {
    const usage = { inputTokens: 30000, outputTokens: 100, totalTokens: 30100 };
    if (context.turn === 1) return { content: "", toolCalls: [{ id: "s-1", name: "read_file", args: { path: Object.keys(context.task.input.files)[0] ?? "missing.txt" } }], usage };
    return { content: "", toolCalls: [{ id: "s-2", name: "finish_task", args: {} }], usage };
  },
};
const silent = await run(silentAdapter, { tasks: "artifacts/probe-task.jsonl" });
assert.equal(silent.rows[0].usage.costUsd, undefined);
assert.equal(silent.efficiency.costSource, "estimated");
assert.ok(Math.abs(silent.efficiency.totalCostUsd - (60000 * 1.5e-7 + 200 * 6e-7)) < 1e-12);

// Fixed price table fixture: exact values for estimated, provider, retry, errored, and unpriced rows.
const fixture = { source: "e2e fixed price table", retrievedAt: "2026-10-16T00:00:00.000Z", models: [{ id: "fixture/priced", promptUsdPerToken: 0.000001, completionUsdPerToken: 0.000002 }] };
const row = (extra) => ({ taskId: "t", kind: "episode", score: 1, reason: "ok", attempts: 1, latencyMs: 1, ...extra });
const fixed = await addEfficiency({ ...report, model: "openrouter:fixture/priced", rows: [
  row({ usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0 } }),
  row({ usage: { inputTokens: 5000, outputTokens: 500, costUsd: 0.02 } }),
  row({ error: "timeout", attempts: 2, score: 0 }),
  row({ usage: { inputTokens: 60000, outputTokens: 0, costUsd: 0.09 }, attempts: 2 }),
] }, { catalog: fixture });
assert.ok(Math.abs(fixed.efficiency.totalCostUsd - (0.0014 + 0.02 + 0 + 0.09)) < 1e-12);
assert.equal(fixed.efficiency.costSource, "mixed");
const unpriced = await addEfficiency({ ...report, model: "openrouter:unlisted/model", rows: [row({ usage: { inputTokens: 5, outputTokens: 5 } })] }, { catalog: fixture });
assert.equal(unpriced.efficiency.totalCostUsd, null);
assert.equal(unpriced.efficiency.costSource, "unavailable");

const unavailable = await addEfficiency({ ...report, model: "unknown:model", rows: report.rows.map((r) => ({ ...r, usage: { inputTokens: 1, outputTokens: 1 } })) });
assert.equal(unavailable.efficiency.costPerVerifiedSuccess, null);
const noSuccess = await addEfficiency({ ...report, rows: report.rows.map((r) => ({ ...r, score: 0 })) });
assert.equal(noSuccess.efficiency.costPerVerifiedSuccess, null);

const negativeRouter = await addEfficiency({
  ...report,
  model: "openrouter:openrouter/auto",
  rows: [row({ usage: { inputTokens: 1000, outputTokens: 100 } })],
});
assert.equal(negativeRouter.efficiency.totalCostUsd, null);

// The committed snapshot prices a mock run at exact values when the model id is priced.
const prices = JSON.parse(await readFile("data/prices.json", "utf8"));
const demoPrice = prices.models.find((model) => model.id === "openai/gpt-4o-mini");
assert.ok(demoPrice);
const demo = await execFile(process.execPath, ["dist/cli.js", "run", "--provider", "mock", "--model", "openai/gpt-4o-mini", "--json"], { maxBuffer: 1_000_000 });
const demoReport = JSON.parse(demo.stdout);
assert.equal(demoReport.efficiency.costSource, "estimated");
const demoExpected = demoReport.rows.reduce((sum, r) => sum + estimateRowCostUsd(r.usage, demoPrice), 0);
assert.ok(Math.abs(demoReport.efficiency.totalCostUsd - demoExpected) < 1e-12);
assert.ok(demoReport.efficiency.totalCostUsd > 0);

const hiddenSeed = "8844221";
await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden", "--seed", hiddenSeed]);
const hiddenBench = getBenchmark("var/tasks.hidden.jsonl");
const hiddenTasks = await hiddenBench.listTasks();
assert.ok(hiddenTasks.every((task) => task.id.startsWith("h-")));
for (const hidden of hiddenTasks) {
  const publicTask = tasks.find((task) => task.id === hidden.id.slice(2));
  assert.ok(publicTask);
  const calls = benchmark.definition.mockPolicies.good(publicTask)[0].toolCalls;
  const leaked = await hiddenBench.score(hidden, { toolLog: calls.map((call) => ({ ...call, result: null })) });
  assert.ok(leaked.score < 1, `public trace scored ${leaked.score} on hidden ${hidden.id}`);
}

const hiddenList = await execFile(process.execPath, ["dist/cli.js", "--tasks", "var/tasks.hidden.jsonl", "list", "--json"], { maxBuffer: 1_000_000 });
assert.equal(JSON.parse(hiddenList.stdout).tasks.length, 30);
await mkdir("var", { recursive: true });
await writeFile("var/tasks.alt.jsonl", await readFile("data/tasks.jsonl", "utf8"));

await writeFile("artifacts/mock-report.json", `${JSON.stringify(report)}\n`);
const second = await execFile(process.execPath, ["dist/cli.js", "run", "--model", "offline", "--provider", "mock", "--seed", "2", "--json"], { maxBuffer: 1_000_000 });
await writeFile("artifacts/mock-report-2.json", second.stdout);
const compared = await execFile(process.execPath, ["dist/cli.js", "compare", "artifacts/mock-report.json", "artifacts/mock-report-2.json", "--json"]);
assert.equal(JSON.parse(compared.stdout).rows.length, 2);
await writeFile("artifacts/empty-report.json", `${JSON.stringify({ ...report, rows: [] })}\n`);
await assert.rejects(execFile(process.execPath, ["dist/cli.js", "compare", "artifacts/mock-report.json", "artifacts/empty-report.json"]), /Invalid report/);
const malformed = { ...report, rows: report.rows.map((r, index) => index === 0 ? { ...r, usage: { ...r.usage, costUsd: "abc" } } : r) };
await writeFile("artifacts/malformed-report.json", `${JSON.stringify(malformed)}\n`);
await assert.rejects(execFile(process.execPath, ["dist/cli.js", "compare", "artifacts/mock-report.json", "artifacts/malformed-report.json"]), /Invalid report/);
const rescored = await execFile(process.execPath, ["dist/cli.js", "score", "artifacts/mock-report.json"], { maxBuffer: 1_000_000 });
assert.match(rescored.stdout, /## Efficiency/);
assert.match(rescored.stdout, /Cost per verified success \|/);
const rescoredJson = await execFile(process.execPath, ["dist/cli.js", "score", "artifacts/mock-report.json", "--json"], { maxBuffer: 1_000_000 });
assert.ok(JSON.parse(rescoredJson.stdout).efficiency);
for (const args of [
  ["list", "--json"], ["show", "invoice-total-01", "--json"],
  ["card", "artifacts/mock-report.json", "artifacts/card.svg"],
  ["provenance", "--json"], ["index-entry", "--json"],
]) await execFile(process.execPath, ["dist/cli.js", ...args], { maxBuffer: 1_000_000 });

const probe = createNetServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object");
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) {
  const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status;
  return { response, value: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  const health = await get("/health"); assert.equal(health.response.status, 200);
  const listed = await get("/v1/tasks"); assert.equal(listed.value.tasks.length, 30);
  const altApi = await get(`/v1/tasks?tasks=${encodeURIComponent("var/tasks.alt.jsonl")}`);
  assert.equal(altApi.value.tasks.length, 30);
  assert.equal(altApi.value.tasks[0].expected, undefined);
  const hiddenApi = await fetch(`${base}/v1/tasks?tasks=${encodeURIComponent("var/tasks.hidden.jsonl")}`);
  routes["GET /v1/tasks?tasks=hidden"] = hiddenApi.status;
  assert.equal(hiddenApi.status, 403);
  const rejected = await fetch(`${base}/v1/tasks?tasks=${encodeURIComponent("/etc/passwd")}`);
  routes["GET /v1/tasks?tasks=rejected"] = rejected.status;
  assert.equal(rejected.status, 400);
  const shown = await get("/v1/tasks/invoice-total-01"); assert.equal(shown.value.task.id, "invoice-total-01");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "invoice-total-01", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  const ran = await fetch(`${base}/v1/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "offline", provider: "mock" }) });
  routes["POST /v1/run"] = ran.status; assert.equal(ran.status, 200);
  const runBody = await ran.json();
  assert.equal(runBody.rows.length, 30);
  assert.ok(runBody.efficiency && typeof runBody.efficiency.costPerVerifiedSuccess !== "undefined");
  const runNoKey = await fetch(`${base}/v1/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-4o-mini" }) });
  routes["POST /v1/run (no key)"] = runNoKey.status; assert.equal(runNoKey.status, 400);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 30);
  assert.equal((await get("/v1/index-entry")).value.version, "0.2.0");
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

process.env.BCPT_SERVE_HIDDEN = "1";
const hiddenServed = await handler(new Request(`http://local/v1/tasks?tasks=${encodeURIComponent("var/tasks.hidden.jsonl")}`));
assert.equal(hiddenServed.status, 200);
const hiddenBody = await hiddenServed.json();
assert.equal(hiddenBody.tasks.length, 30);
assert.equal(hiddenBody.tasks[0].expected, undefined);
delete process.env.BCPT_SERVE_HIDDEN;
const hiddenBlocked = await handler(new Request(`http://local/v1/tasks?tasks=${encodeURIComponent("var/tasks.hidden.jsonl")}`));
assert.equal(hiddenBlocked.status, 403);

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-cost-per-task-e2e", version: "0.2.0" });
await client.connect(transport); let toolNames;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "invoice-total-01" }],
    ["score_answer", { taskId: "invoice-total-01", submission: report.rows[0].submission }],
    ["get_provenance", {}],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true);
  }
  const denied = await client.callTool({ name: "run_benchmark", arguments: { model: "offline" } });
  assert.equal(denied.isError, true);
  const ranMcp = await client.callTool({ name: "run_benchmark", arguments: { model: "offline", provider: "mock" } });
  assert.notEqual(ranMcp.isError, true);
  const mcpReport = JSON.parse(ranMcp.content[0].text);
  assert.equal(mcpReport.rows.length, 30);
  assert.ok(mcpReport.efficiency && "costPerVerifiedSuccess" in mcpReport.efficiency);
} finally { await client.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), route_status_codes: routes, tool_names: toolNames };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded back-office episodes/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
