# benchmark-cost-per-task

Paper: [10.5281/zenodo.23752393](https://doi.org/10.5281/zenodo.23752393).

[![npm](https://img.shields.io/npm/v/benchmark-cost-per-task)](https://www.npmjs.com/package/benchmark-cost-per-task) [![downloads](https://img.shields.io/npm/dm/benchmark-cost-per-task)](https://www.npmjs.com/package/benchmark-cost-per-task) [![license](https://img.shields.io/npm/l/benchmark-cost-per-task)](./LICENSE) [![types](https://img.shields.io/badge/TypeScript-types-3178c6)](#sdk)

[AI Benchmark Index](https://private-repo-337e.com/benchmarks/benchmark-cost-per-task) · [npm](https://www.npmjs.com/package/benchmark-cost-per-task) · [grading](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/docs/grading.md) · [metrics](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/docs/metrics.md) · [llms.txt](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/llms.txt)

benchmark-cost-per-task is an open-source AI agent benchmark for dollars per verified back-office task. It measures successful work, retries, turns, and tokens. Deterministic simulators check every result.

```bash
npx benchmark-cost-per-task run --provider mock --model openai/gpt-4o-mini
```

```text
# Cost Per Task

- Model: `mock:openai/gpt-4o-mini`
- Score: **53.3%**
- 95% CI: 36.7%–70.0%
- Tasks: 30

## Efficiency

| Metric | Value |
| --- | ---: |
| Verified successes | 16/30 |
| Success rate | 53.3% |
| Cost per verified success | $0.000080 |
| Cost per attempt | $0.000043 |
| Mean turns | 1.00 |
| Retries | 0 |
| Input / output tokens | 8586 / 0 |
| Cost source | estimated |
```

The mock provider needs no key or network. Naming a priced model after `--model` prices the run from the committed OpenRouter snapshot; without one the run reports cost as unavailable rather than inventing zero.

The 30 public episodes come from a committed seeded generator. A dated OpenRouter model-price snapshot supports offline cost estimates.

## Install

benchmark-cost-per-task requires Node.js 20 or newer.

```bash
npm install benchmark-cost-per-task
```

The package includes TypeScript declarations. It has two runtime dependencies: benchmark-core and the official Model Context Protocol (MCP) SDK.

## Run your first benchmark

The mock provider needs no key or network access.

```bash
npx benchmark-cost-per-task run --provider mock
```

A successful run prints 30 task rows and an Efficiency table. The fixed mock policy produces both accepted and rejected work. Pass a priced model id to see estimated spend from the committed snapshot:

```bash
npx benchmark-cost-per-task run --provider mock --model openai/gpt-4o-mini
```

Run a real model through OpenRouter:

```bash
OPENROUTER_API_KEY=your_key npx benchmark-cost-per-task run --model openai/gpt-5-mini --provider openrouter
```

OpenRouter model calls cost money. Use `--budget 1` to stop an episode when its tracked cost exceeds one US dollar.

## How it works

```text
seeded task -> model tool calls -> virtual files and CRM -> state verifier
                         |                                  |
                    usage and cost ----------------> efficiency report
```

Each episode gets a fresh workspace. The grader replays the tool log and compares the complete state with the expected state.

## Why it exists

Tokens per second describes throughput. It does not say whether the model finished the job.

This benchmark puts cost beside deterministic success. Failed attempts remain in the denominator and the report keeps their usage.

## Compare

Checked on 2026-10-15.

| Property | benchmark-cost-per-task | Token throughput test | General chat leaderboard | Ad hoc prompt test |
| --- | --- | --- | --- | --- |
| Target | Cost per verified task | Generation speed | Broad model quality | One example |
| Grading | Replayed final state | Token count | Varies | Usually manual |
| Workload | Files and CRM | Text generation | Usually questions | User supplied |
| Cost source | Provider or price snapshot | Often absent | Varies | Often absent |
| Offline path | Fixed mock provider | Tool dependent | Usually no | Varies |

## Coverage

| Workload | Public tasks | Verifier |
| --- | ---: | --- |
| Invoice table arithmetic | 10 | Exact virtual file state |
| CRM record updates | 10 | Exact full record list |
| Existing file edits | 10 | Exact full file map |

All 30 tasks pass through the same replay boundary. The E2E gate also checks five trivial or forged answer policies.

## Common use cases

1. **Model teams:** compare OpenRouter models on the same generated split.
2. **Agent teams:** find expensive failures in file and CRM tool traces.
3. **Release teams:** detect success-rate or retry regressions before deployment.
4. **Researchers:** export task rows for cost and reliability analysis.

## Features

- **Verified-success cost:** Reports total cost divided by tasks scoring exactly 1.
- **Auditable estimates:** Uses provider cost first, then live or committed OpenRouter prices.
- **Deterministic grading:** Replays calls instead of trusting claimed state.
- **Pareto comparison:** Marks models that are not dominated on success and cost.
- **Reproducible data:** Generates public or hidden splits from an explicit seed.
- **Share cards:** Writes a 1200 by 630 SVG from a report.

## Runtime surfaces

### SDK

```ts
import { benchmark, run, score, compareReports } from "benchmark-cost-per-task";
```

`run(adapter, options)` returns a report with `efficiency`. `score(taskId, submission)` grades one trace.

### CLI

Commands are `list`, `show`, `run`, `score`, `compare`, `card`, `provenance`, `index-entry`, `serve`, and `mcp`. Pass `--json` for machine-readable output.

Compare two completed runs:

```bash
npx benchmark-cost-per-task compare model-a.json model-b.json
```

### Model Context Protocol

```bash
npx benchmark-cost-per-task mcp
```

The MCP tools are `list_tasks`, `get_task`, `score_answer`, `run_benchmark`, and `get_provenance`. `run_benchmark` takes `model`, an optional `provider` (`openrouter`, `openai`, or `mock`), `seed`, and `retries`, and returns the full report including the efficiency breakdown.

### HTTP API

Import `handler` from `benchmark-cost-per-task/api`, or start the self-hosted server:

```bash
npx benchmark-cost-per-task serve 3000
```

Routes are `GET /health`, `GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/score`, `POST /v1/run`, `GET /v1/provenance`, and `GET /v1/index-entry`. `POST /v1/run` accepts `{ "model", "provider"?, "seed"?, "retries"?, "tasks"? }` and returns the full report with the efficiency breakdown.

`?tasks=` and `POST /v1/run` accept only `.jsonl` files under `var/`, and the served task listing drops `expected` states. Files with `hidden` in the name are refused unless the server sets `BCPT_SERVE_HIDDEN=1`. `serve` binds to `127.0.0.1` by default; passing `--host 0.0.0.0` exposes `POST /v1/run`, which can spend the server's provider keys, so only widen the bind on a trusted network.

## Read the score

A task scores 1 only when all files and CRM records match and the trace calls `finish_task`. Every other state scores 0. The mean is the verified success rate.

`costPerVerifiedSuccess` is `totalCostUsd / verifiedSuccesses`. It is `null` when cost is unavailable or no task succeeds. The 95% confidence interval uses 2,000 seeded bootstrap resamples.

## Data provenance

Run `npm run generate:tasks` to recreate the public set with seed 20261015. The generator ships inside the npm package, so an installed copy works too. Generate an unpublished split without committing it:

```bash
node scripts/gen-tasks.mjs --seed 987654 --split hidden
```

Hidden tasks carry `h-` ids, different prompt wording, and different expected states, and they never ship in `data/` or the npm tarball.

Run `npm run fetch:prices` to refresh `data/prices.json` from the public OpenRouter models endpoint. `data/PROVENANCE.md` records retrieval, licence, contamination, and refresh details.

## Limits

- Public tasks and expected states can enter training data.
- The three task families do not represent every back-office workflow.
- Exact grading gives no partial credit.
- Snapshot prices can become stale between monthly refreshes.
- Unknown model prices remain unavailable; the package does not treat them as free.
- Provider latency and retention policies are outside this package.
- The package is self-hosted and does not offer a managed benchmark service.

## Integration guides

- [Deterministic grading rules](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/docs/grading.md)
- [Efficiency metric definitions](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/docs/metrics.md)
- [Committed data provenance](https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/data/PROVENANCE.md)

## Status

Version 0.2.0 is alpha. Task schemas and metric fields can change before 1.0. Report defects through the GitHub issue tracker.

No public leaderboard exists yet. Public model runs and case studies have not been published.

## Prior art and credit

[benchmark-core](https://www.npmjs.com/package/benchmark-core) provides the runner and four package surfaces. [OpenRouter](https://openrouter.ai/docs/overview/models) provides the public model catalogue used for price data. This repository copies no third-party benchmark tasks.

## FAQ

### What does benchmark-cost-per-task measure?

benchmark-cost-per-task measures dollars, attempts, turns, and tokens per deterministically verified back-office result. Its headline metric is cost per verified success.

### Can benchmark-cost-per-task run offline?

benchmark-cost-per-task runs end to end with its fixed mock provider and committed price snapshot. Real model calls require a configured provider.

### Which providers work?

benchmark-cost-per-task supports OpenRouter, an OpenAI-compatible base URL, and the mock adapter through benchmark-core. Set `OPENROUTER_API_KEY`, or set `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

### Which integrations are verified?

benchmark-cost-per-task verifies its SDK, CLI, MCP server, and HTTP API in one E2E script. That script executes all 30 tasks and every documented route and tool.

### Does benchmark-cost-per-task provide a managed service?

benchmark-cost-per-task provides a fetch-style handler and a Node server you deploy. It does not run a hosted service for you.

### Where do the tasks come from?

benchmark-cost-per-task generates synthetic invoice, CRM, and file fixtures from a committed script. Seed 20261015 reproduces the public set.

### How does benchmark-cost-per-task price a run?

benchmark-cost-per-task trusts cost returned by the model provider only when a positive dollar amount is reported. Otherwise it estimates from token usage and live or snapshot OpenRouter prices, and marks the source `estimated`.

### How is benchmark-cost-per-task different from a chat leaderboard?

benchmark-cost-per-task uses tool episodes and exact simulator state. A general chat leaderboard usually combines broader question-answering results.

### Can I use a hidden split?

benchmark-cost-per-task generates a hidden file with `node scripts/gen-tasks.mjs --split hidden --seed <private>`. Output lands in `var/tasks.hidden.jsonl`, which is not published to npm. Run it with `benchmark-cost-per-task --tasks var/tasks.hidden.jsonl run ...`.

## License

[MIT](LICENSE) © Pooria Arab

## Cite

Please cite this package with its Zenodo DOI. The DOI below names all versions. GitHub also shows a "Cite this repository" box from `CITATION.cff`.

```bibtex
@software{arab2026benchmarkcostpertask,
  author  = {Arab, Pooria},
  title   = {benchmark-cost-per-task},
  year    = {2026},
  version = {0.2.0},
  doi     = {10.5281/zenodo.23422371},
  url     = {https://private-repo-337e.com/benchmarks/benchmark-cost-per-task}
}
```
