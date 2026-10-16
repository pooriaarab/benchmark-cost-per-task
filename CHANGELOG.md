# Changelog

## 0.2.0 (2026-10-16)

- Filter negative or missing OpenRouter router prices so cost estimates cannot go below zero; unpriced models stay unavailable.
- Track token and dollar usage across failed retries and attach it to errored task rows before efficiency aggregation; a row now always carries the summed usage of all attempts, and an errored row with no usage counts as a known spend of zero.
- Trust provider cost only when a positive dollar amount is reported; otherwise estimate from the price catalogue and mark `costSource` `estimated` (replaces the `snapshot`/`live` values). OpenAI-provider model ids also match `openai/<model>` catalogue entries.
- Hidden splits require an explicit `--seed`, write to `var/tasks.hidden.jsonl` (not shipped on npm), prefix task and fixture ids with `h-`, and randomize prompt wording, paths, fields, regions, and cadences; the generator re-rolls any hidden task that collides with a public one, and ships inside the npm package.
- Route MCP `run_benchmark`, the new `POST /v1/run`, and the CLI `score` and `run` commands through the same usage-tracked run, so every surface reports the efficiency breakdown.
- The HTTP API refuses `hidden` task files unless `BCPT_SERVE_HIDDEN=1` is set, and strips `expected` states from externally loaded task listings.
- Add `--tasks <file>` to the CLI and SDK `run({ tasks })`, and `?tasks=` on the HTTP API, for alternate task files.
- **Scoring note:** 0.1.0 efficiency numbers and headline costs are not comparable to 0.2.0 because retry spend and pricing fixes change totals.

## 0.1.0

- Initial public release.
