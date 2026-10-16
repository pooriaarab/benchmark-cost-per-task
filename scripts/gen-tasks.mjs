import { mkdir, readFile, writeFile } from "node:fs/promises";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const split = option("split", "public");
if (!new Set(["public", "hidden"]).has(split)) throw new Error("--split must be public or hidden");
const seedArg = option("seed", split === "public" ? "20261015" : "");
if (split === "hidden" && !seedArg) throw new Error("--seed is required for hidden split");
const seed = Number(seedArg);
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
const idPrefix = split === "hidden" ? "h-" : "";
const ref = (value) => (split === "hidden" ? `h-${value}` : value);

let state = seed >>> 0;
const random = () => ((state = Math.imul(state ^ (state >>> 15), 1 | state), state ^= state + Math.imul(state ^ (state >>> 7), 61 | state), ((state ^ (state >>> 14)) >>> 0) / 4294967296));
const pick = (values) => values[Math.floor(random() * values.length)];
const clone = (value) => JSON.parse(JSON.stringify(value));

const companies = ["Aster Works", "Beacon Foods", "Cedar Labs", "Dovetail Supply", "Elm Studio", "Fjord Freight"];
const owners = ["Amina", "Diego", "Harper", "Min", "Ravi", "Zoe"];
const ledgerFiles = ["invoices.csv", "billing.csv", "accounts.csv"];
const sumColumns = ["amount_cents", "cents", "total_cents"];
const dueStates = ["overdue", "past-due", "unpaid"];
const reportDirs = ["reports", "totals", "summaries"];
const reportNames = ["overdue-total", "late-sum", "due-balance"];
const actionFields = ["nextAction", "nextStep", "followUp"];
const actionValues = ["renewal-review", "renewal-check", "contract-review"];
const regions = ["north", "south", "east", "west"];
const cadences = ["daily", "weekly", "monthly"];
const serials = () => `${1000 + Math.floor(random() * 9000)}`;

const genInvoice = (index) => {
  const ledger = pick(ledgerFiles);
  const column = pick(sumColumns);
  const due = pick(dueStates);
  const outPath = `${pick(reportDirs)}/${pick(reportNames)}-${serials()}.txt`;
  const rows = Array.from({ length: 5 }, (_, row) => ({
    invoice: ref(`INV-${index + 1}${row + 1}`),
    customer: pick(companies),
    cents: 1_000 + Math.floor(random() * 90_000),
    status: random() > 0.45 ? due : "paid",
  }));
  if (!rows.some((row) => row.status === due)) rows[0].status = due;
  const csv = [`invoice,customer,${column},status`, ...rows.map((row) => `${row.invoice},${row.customer},${row.cents},${row.status}`)].join("\n") + "\n";
  const total = rows.filter((row) => row.status === due).reduce((sum, row) => sum + row.cents, 0);
  const input = { files: { [ledger]: csv }, records: [] };
  const expected = clone(input); expected.files[outPath] = `${total}\n`;
  return {
    id: `${idPrefix}invoice-total-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: `Read ${ledger}. Sum ${column} for invoices with status ${due}. Write the integer total followed by a newline to ${outPath}, then finish the task.`,
    input, expected, metadata: { category: "table-arithmetic", seed, split },
  };
};

const genCrm = (index) => {
  const field = pick(actionFields);
  const value = pick(actionValues);
  const records = Array.from({ length: 4 }, (_, row) => ({
    id: ref(`acct-${index + 1}-${row + 1}`),
    name: pick(companies), owner: pick(owners), active: row !== 3,
    annualValue: 5_000 + Math.floor(random() * 95_000), [field]: "none",
  }));
  const candidates = records.filter((record) => record.active);
  const target = candidates.reduce((best, record) => record.annualValue > best.annualValue ? record : best);
  const input = { files: {}, records };
  const expected = clone(input);
  expected.records.find((record) => record.id === target.id)[field] = value;
  return {
    id: `${idPrefix}crm-renewal-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: `List the CRM records. Among active accounts, find the one with the greatest annualValue. Set only its ${field} field to ${value}, then finish the task.`,
    input, expected, metadata: { category: "crm-update", seed, split },
  };
};

const genHandoff = (index) => {
  const region = pick(regions);
  const oldOwner = pick(owners); let newOwner = pick(owners);
  if (newOwner === oldOwner) newOwner = owners[(owners.indexOf(oldOwner) + 1) % owners.length];
  const cadence = pick(cadences);
  const path = `handoffs/${region}-${serials()}.md`;
  const original = `# ${region[0].toUpperCase()}${region.slice(1)} handoff\n\nOwner: ${oldOwner}\nCadence: ${cadence}\nEscalation: operations@example.test\n`;
  const updated = original.replace(`Owner: ${oldOwner}`, `Owner: ${newOwner}`);
  const input = { files: { [path]: original, "handoffs/README.md": "Handoff files are managed by region.\n" }, records: [] };
  const expected = clone(input); expected.files[path] = updated;
  return {
    id: `${idPrefix}file-handoff-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: `Read ${path}. Change its Owner from ${oldOwner} to ${newOwner} without changing any other text. Write the file and finish the task.`,
    input, expected, metadata: { category: "file-edit", seed, split },
  };
};

let reference = [];
if (split === "hidden") {
  try {
    const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
    reference = text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch { /* No public reference file reachable; raw seed output is used. */ }
}

const make = (gen) => Array.from({ length: 10 }, (_, index) => {
  let task = gen(index);
  const twin = reference.find((item) => item.id === task.id.replace(/^h-/, ""));
  while (twin && (twin.prompt === task.prompt || JSON.stringify(twin.expected) === JSON.stringify(task.expected))) task = gen(index);
  return task;
});
const tasks = [...make(genInvoice), ...make(genCrm), ...make(genHandoff)];

const output = option("output", split === "public" ? "data/tasks.jsonl" : "var/tasks.hidden.jsonl");
await mkdir(output.includes("/") ? output.slice(0, output.lastIndexOf("/")) : ".", { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks at ${output}`);
