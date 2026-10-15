import { readFile } from "node:fs/promises";
import { defineBenchmark, replay, type Environment, type JsonValue, type Task, type ToolResult } from "benchmark-core";

type RecordValue = Record<string, JsonValue>;
interface Workspace { [key: string]: JsonValue; files: Record<string, string>; records: RecordValue[] }
interface CostTask extends Task { input: Workspace; expected: Workspace }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const object = (value: JsonValue | undefined): value is Record<string, JsonValue> => value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = (value: JsonValue): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

async function loadTasks(): Promise<CostTask[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as CostTask);
}

class BackOfficeEnvironment implements Environment<CostTask> {
  #workspace: Workspace = { files: {}, records: [] };
  #finished = false;

  reset(task: CostTask) {
    this.#workspace = clone(task.input); this.#finished = false;
    return {
      system: "Complete the back-office job with the provided virtual file and CRM tools. Call finish_task only after verifying the requested change.",
      tools: [
        { name: "read_file", description: "Read one virtual file.", parameters: { type: "object" as const, properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
        { name: "write_file", description: "Create or replace one virtual file.", parameters: { type: "object" as const, properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } },
        { name: "list_records", description: "List all mock CRM records.", parameters: { type: "object" as const, additionalProperties: false } },
        { name: "update_record", description: "Update fields on one mock CRM record.", parameters: { type: "object" as const, properties: { id: { type: "string" }, fields: { type: "object" } }, required: ["id", "fields"], additionalProperties: false } },
        { name: "finish_task", description: "Finish after the requested state is verified.", parameters: { type: "object" as const, additionalProperties: false } },
      ],
    };
  }

  callTool(name: string, args: Record<string, JsonValue>): ToolResult {
    if (this.#finished) return { result: null, error: { code: "ALREADY_FINISHED", message: "The task is already finished." } };
    if (name === "read_file") {
      if (typeof args.path !== "string") return this.#invalid("read_file requires a string path.");
      const content = this.#workspace.files[args.path];
      return content === undefined ? { result: null, error: { code: "NOT_FOUND", message: `File not found: ${args.path}` } } : { result: { path: args.path, content } };
    }
    if (name === "write_file") {
      if (typeof args.path !== "string" || typeof args.content !== "string") return this.#invalid("write_file requires string path and content.");
      this.#workspace.files[args.path] = args.content; return { result: { written: args.path } };
    }
    if (name === "list_records") return { result: clone(this.#workspace.records) };
    if (name === "update_record") {
      if (typeof args.id !== "string" || !object(args.fields)) return this.#invalid("update_record requires a string id and object fields.");
      const record = this.#workspace.records.find((item) => item.id === args.id);
      if (!record) return { result: null, error: { code: "NOT_FOUND", message: `CRM record not found: ${args.id}` } };
      Object.assign(record, clone(args.fields)); return { result: clone(record) };
    }
    if (name === "finish_task") { this.#finished = true; return { result: { finished: true } }; }
    return { result: null, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
  }

  #invalid(message: string): ToolResult { return { result: null, error: { code: "INVALID_ARGUMENT", message } }; }
  state() { return { ...clone(this.#workspace), finished: this.#finished }; }
  done() { return this.#finished; }
}

function goodCalls(task: CostTask) {
  const calls: Array<{ name: string; args: Record<string, JsonValue> }> = [];
  const changedFile = Object.keys(task.expected.files).find((path) => task.input.files[path] !== task.expected.files[path]);
  if (changedFile) {
    if (task.input.files[changedFile] !== undefined) calls.push({ name: "read_file", args: { path: changedFile } });
    else calls.push({ name: "read_file", args: { path: "invoices.csv" } });
    calls.push({ name: "write_file", args: { path: changedFile, content: task.expected.files[changedFile]! } });
  } else {
    const changed = task.expected.records.find((record, index) => canonical(record) !== canonical(task.input.records[index] ?? null));
    calls.push({ name: "list_records", args: {} }, { name: "update_record", args: { id: changed?.id ?? "missing", fields: { nextAction: "renewal-review" } } });
  }
  calls.push({ name: "finish_task", args: {} }); return calls;
}

export const benchmark = defineBenchmark<CostTask>({
  id: "benchmark-cost-per-task", name: "Cost Per Task", tagline: "Dollars per verified result, not tokens per second.", tags: ["helpful"], category: "agents",
  whatItMeasures: "Cost, retries, turns, and tokens required for deterministic back-office task success.", version: "0.1.0", status: "alpha", loadTasks,
  async grade(task, submission, context) {
    const state = await replay(new BackOfficeEnvironment(), task, submission.toolLog ?? [], context.seed) as Workspace & { finished: boolean };
    const filesMatch = canonical(state.files) === canonical(task.expected.files);
    const recordsMatch = canonical(state.records) === canonical(task.expected.records);
    if (!filesMatch || !recordsMatch || !state.finished) {
      const failures = [...!filesMatch ? ["files"] : [], ...!recordsMatch ? ["CRM records"] : [], ...!state.finished ? ["finish_task"] : []];
      return { score: 0, reason: `Verification failed: ${failures.join(", ")}.`, details: { filesMatch, recordsMatch, finished: state.finished } };
    }
    return { score: 1, reason: "Verified final files and CRM state." };
  },
  environment: () => new BackOfficeEnvironment(),
  mockPolicies: {
    good: (task) => [{ toolCalls: goodCalls(task) }],
    bad: () => [{ toolCalls: [{ name: "finish_task", args: {} }] }],
  },
  provenance: [
    { name: "Seeded back-office episodes", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/scripts/gen-tasks.mjs", licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.", retrievedAt: "2026-10-15T00:00:00.000Z", contaminationNotes: "The public tasks and generator are visible. Use `--split hidden` with an unpublished seed for final evaluations.", refresh: "Generate and review a new public seed every six months." },
    { name: "OpenRouter model price snapshot", kind: "live-feed", url: "https://openrouter.ai/api/v1/models", licence: "NOASSERTION", howToGet: "Run `node scripts/fetch-prices.mjs`; no API key is required.", retrievedAt: "2026-10-15T08:04:45.790Z", contaminationNotes: "Factual pricing metadata, not evaluation content; OpenRouter states no separate data licence for the endpoint.", refresh: "Refresh before releases and at least monthly; retain git history for audits." },
  ],
  gradingMethod: "Deterministic replay followed by exact virtual file-system and CRM state verification.",
});
