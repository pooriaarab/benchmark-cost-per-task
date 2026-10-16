import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MAX_TOOL_LOG_ENTRIES } from "benchmark-core";
import { providerAdapter } from "./adapters.js";
import { benchmark } from "./benchmark.js";
import { run } from "./index.js";

const tools = [
  { name: "list_tasks", description: "List benchmark task ids and prompts.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_task", description: "Get one benchmark task.", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"], additionalProperties: false } },
  { name: "score_answer", description: "Score a trace with the deterministic benchmark grader.", inputSchema: { type: "object", properties: { taskId: { type: "string" }, submission: { type: "object" }, seed: { type: "number" } }, required: ["taskId", "submission"], additionalProperties: false } },
  { name: "run_benchmark", description: "Run every task and report cost per verified success.", inputSchema: { type: "object", properties: { model: { type: "string" }, provider: { type: "string", enum: ["openrouter", "openai", "mock"] }, seed: { type: "number" }, retries: { type: "number" } }, required: ["model"], additionalProperties: false } },
  { name: "get_provenance", description: "Get benchmark data provenance.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

const content = (value: unknown, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], ...isError ? { isError: true } : {} });
const args = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function createMcpServer(): Server {
  const server = new Server({ name: benchmark.definition.id, version: benchmark.definition.version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const input = args(request.params.arguments);
      if (request.params.name === "list_tasks") return content({ tasks: await benchmark.listTasks() });
      if (request.params.name === "get_task") {
        if (typeof input.taskId !== "string") return content({ error: "taskId is required." }, true);
        const task = await benchmark.getTask(input.taskId);
        return task ? content({ task }) : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "score_answer") {
        if (typeof input.taskId !== "string" || !input.submission || typeof input.submission !== "object" || Array.isArray(input.submission)) return content({ error: "taskId and submission are required." }, true);
        const submittedLog = Reflect.get(input.submission, "toolLog");
        if (Array.isArray(submittedLog) && submittedLog.length > MAX_TOOL_LOG_ENTRIES) return content({ error: `toolLog may not exceed ${MAX_TOOL_LOG_ENTRIES} entries.` }, true);
        const task = await benchmark.getTask(input.taskId);
        return task ? content({ taskId: task.id, ...await benchmark.score(task, input.submission as Parameters<typeof benchmark.score>[1], typeof input.seed === "number" ? { seed: input.seed } : {}) }) : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "run_benchmark") {
        if (typeof input.model !== "string" || !input.model) return content({ error: "model is required." }, true);
        const provider = typeof input.provider === "string" ? input.provider : "openrouter";
        if (provider !== "openrouter" && provider !== "openai" && provider !== "mock") return content({ error: "provider must be openrouter, openai, or mock." }, true);
        if (provider === "openrouter" && !process.env.OPENROUTER_API_KEY) return content({ error: "OPENROUTER_API_KEY is required to run a benchmark." }, true);
        if (provider === "openai" && !process.env.OPENAI_API_KEY) return content({ error: "OPENAI_API_KEY is required to run a benchmark." }, true);
        const seed = typeof input.seed === "number" && Number.isInteger(input.seed) ? input.seed : 1;
        const retries = typeof input.retries === "number" && Number.isInteger(input.retries) && input.retries >= 0 ? input.retries : 0;
        return content(await run(providerAdapter(provider, input.model, benchmark, seed), { seed, retries }));
      }
      if (request.params.name === "get_provenance") return content({ provenance: benchmark.definition.provenance });
      return content({ error: `Unknown tool: ${request.params.name}` }, true);
    } catch (caught) {
      return content({ error: caught instanceof Error ? caught.message : "Unknown error." }, true);
    }
  });
  return server;
}

export const startMcp = async () => {
  await createMcpServer().connect(new StdioServerTransport());
};
