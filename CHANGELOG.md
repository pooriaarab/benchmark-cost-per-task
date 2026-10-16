# Changelog

## 0.2.0 (2026-10-16)

- Filter negative or missing OpenRouter router prices so cost estimates cannot go below zero; unpriced models stay unavailable.
- Track token and dollar usage across failed retries and attach it to errored task rows before efficiency aggregation.
- Hidden splits require an explicit `--seed`, write to `var/tasks.hidden.jsonl` (not shipped on npm), prefix task and fixture ids with `h-`, and randomize handoff regions.
- Add `--tasks <file>` to the CLI and SDK `run({ tasks })`, and `?tasks=` on the HTTP API, for alternate task files.
- **Scoring note:** 0.1.0 efficiency numbers and headline costs are not comparable to 0.2.0 because retry spend and pricing fixes change totals.

## 0.1.0

- Initial public release.
