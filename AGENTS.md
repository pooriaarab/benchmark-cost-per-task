# Working on benchmark-cost-per-task

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate public tasks with `npm run generate:tasks`.
- Generate a held-out file with `node scripts/gen-tasks.mjs --seed N --split hidden`.
- Refresh OpenRouter prices with `npm run fetch:prices`.
- Regenerate provenance after building with `npm run provenance`.
- Add no unit tests. Extend `scripts/e2e.mjs` through a public surface.

## Contracts

Keep all 30 tasks, deterministic grading, and provenance in sync. Grade traces by replaying their tool log. Never trust submitted final state or tool results.

Provider-reported cost wins only when it is a positive dollar amount; a reported zero is re-estimated. Estimate only from recorded token usage and a matching live or snapshot model price. Keep unavailable cost as null. Errored rows with no usage count as a known spend of zero.

Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`. OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Open an issue before a branch. Use `bcpt-<issue>-<slug>` and `[BCPT-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
