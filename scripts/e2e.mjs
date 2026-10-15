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
const report = JSON.parse(cli.stdout);
assert.equal(report.rows.length, 30);
assert.ok(report.rows.some((row) => row.score === 1));
assert.ok(report.rows.some((row) => row.score === 0));
assert.ok(report.rows.every((row) => row.error === undefined));

const { benchmark } = await import("../dist/index.js");
const tasks = await benchmark.listTasks();
const goodScores = [];
const badPolicies = {
  empty: {}, random: { answer: "zebra-493" }, yes: { answer: "yes" },
  forged: (task) => ({ finalState: task.expected }),
  sameCall: { toolLog: [{ name: "finish_task", args: {}, result: { finished: true } }] },
  reserved: (task) => ({ toolLog: [
    { name: "write_file", args: { path: "__proto__", content: "x" }, result: null },
    { name: "update_record", args: { id: task.input.records[0]?.id ?? "missing", fields: { constructor: 1 } }, result: null },
    { name: "finish_task", args: {}, result: { finished: true } },
  ] }),
};
for (const task of tasks) {
  const calls = benchmark.definition.mockPolicies.good(task)[0].toolCalls;
  goodScores.push((await benchmark.score(task, { toolLog: calls.map((call) => ({ ...call, result: null })) })).score);
}
assert.ok(goodScores.every((score) => score === 1));
for (const [name, candidate] of Object.entries(badPolicies)) {
  const scores = await Promise.all(tasks.map((task) => benchmark.score(task, typeof candidate === "function" ? candidate(task) : candidate)));
  assert.ok(scores.reduce((sum, item) => sum + item.score, 0) / scores.length <= 0.1, `${name} policy scored too high`);
}

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/mock-report.json", `${JSON.stringify(report)}\n`);
for (const args of [
  ["list", "--json"], ["show", "invoice-total-01", "--json"],
  ["score", "artifacts/mock-report.json", "--json"], ["card", "artifacts/mock-report.json", "artifacts/card.svg"],
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
  const shown = await get("/v1/tasks/invoice-total-01"); assert.equal(shown.value.task.id, "invoice-total-01");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "invoice-total-01", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 30);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-cost-per-task-e2e", version: "0.1.0" });
await client.connect(transport); let toolNames;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "invoice-total-01" }],
    ["score_answer", { taskId: "invoice-total-01", submission: report.rows[0].submission }],
    ["get_provenance", {}], ["run_benchmark", { model: "offline" }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    if (name === "run_benchmark") assert.equal(result.isError, true); else assert.notEqual(result.isError, true);
  }
} finally { await client.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), route_status_codes: routes, tool_names: toolNames };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded back-office episodes/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
