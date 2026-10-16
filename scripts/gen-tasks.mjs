import { mkdir, writeFile } from "node:fs/promises";

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
const tasks = [];

const companies = ["Aster Works", "Beacon Foods", "Cedar Labs", "Dovetail Supply", "Elm Studio", "Fjord Freight"];
for (let index = 0; index < 10; index++) {
  const rows = Array.from({ length: 5 }, (_, row) => ({
    invoice: ref(`INV-${index + 1}${row + 1}`),
    customer: pick(companies),
    cents: 1_000 + Math.floor(random() * 90_000),
    status: random() > 0.45 ? "overdue" : "paid",
  }));
  if (!rows.some((row) => row.status === "overdue")) rows[0].status = "overdue";
  const csv = ["invoice,customer,amount_cents,status", ...rows.map((row) => `${row.invoice},${row.customer},${row.cents},${row.status}`)].join("\n") + "\n";
  const total = rows.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.cents, 0);
  const input = { files: { "invoices.csv": csv }, records: [] };
  const expected = clone(input); expected.files["reports/overdue-total.txt"] = `${total}\n`;
  tasks.push({
    id: `${idPrefix}invoice-total-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: "Read invoices.csv. Sum amount_cents for overdue invoices only. Write the integer total followed by a newline to reports/overdue-total.txt, then finish the task.",
    input, expected, metadata: { category: "table-arithmetic", seed, split },
  });
}

const owners = ["Amina", "Diego", "Harper", "Min", "Ravi", "Zoe"];
for (let index = 0; index < 10; index++) {
  const records = Array.from({ length: 4 }, (_, row) => ({
    id: ref(`acct-${index + 1}-${row + 1}`),
    name: pick(companies), owner: pick(owners), active: row !== 3,
    annualValue: 5_000 + Math.floor(random() * 95_000), nextAction: "none",
  }));
  const candidates = records.filter((record) => record.active);
  const target = candidates.reduce((best, record) => record.annualValue > best.annualValue ? record : best);
  const input = { files: {}, records };
  const expected = clone(input);
  expected.records.find((record) => record.id === target.id).nextAction = "renewal-review";
  tasks.push({
    id: `${idPrefix}crm-renewal-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: "List the CRM records. Among active accounts, find the one with the greatest annualValue. Set only its nextAction field to renewal-review, then finish the task.",
    input, expected, metadata: { category: "crm-update", seed, split },
  });
}

const regions = ["north", "south", "east", "west"];
for (let index = 0; index < 10; index++) {
  const region = pick(regions);
  const oldOwner = pick(owners); let newOwner = pick(owners);
  if (newOwner === oldOwner) newOwner = owners[(owners.indexOf(oldOwner) + 1) % owners.length];
  const path = `handoffs/${region}.md`;
  const original = `# ${region[0].toUpperCase()}${region.slice(1)} handoff\n\nOwner: ${oldOwner}\nCadence: weekly\nEscalation: operations@example.test\n`;
  const updated = original.replace(`Owner: ${oldOwner}`, `Owner: ${newOwner}`);
  const input = { files: { [path]: original, "handoffs/README.md": "Handoff files are managed by region.\n" }, records: [] };
  const expected = clone(input); expected.files[path] = updated;
  tasks.push({
    id: `${idPrefix}file-handoff-${String(index + 1).padStart(2, "0")}`, kind: "episode",
    prompt: `Read ${path}. Change its Owner from ${oldOwner} to ${newOwner} without changing any other text. Write the file and finish the task.`,
    input, expected, metadata: { category: "file-edit", seed, split },
  });
}

const output = split === "public" ? "data/tasks.jsonl" : "var/tasks.hidden.jsonl";
await mkdir(output.includes("/") ? output.slice(0, output.lastIndexOf("/")) : ".", { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks at ${output}`);
