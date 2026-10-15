import { writeFile } from "node:fs/promises";

const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`OpenRouter models endpoint returned HTTP ${response.status}`);
const body = await response.json();
const models = body.data.map((model) => ({
  id: model.id,
  promptUsdPerToken: Number(model.pricing?.prompt),
  completionUsdPerToken: Number(model.pricing?.completion),
})).filter((model) => Number.isFinite(model.promptUsdPerToken) && Number.isFinite(model.completionUsdPerToken)).sort((a, b) => a.id.localeCompare(b.id));
const snapshot = { source: "https://openrouter.ai/api/v1/models", retrievedAt: new Date().toISOString(), models };
await writeFile("data/prices.json", `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`saved ${models.length} model prices to data/prices.json`);
