# Cost Per Task provenance

This file is generated from the benchmark definition.

## Seeded back-office episodes

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.
- Contamination notes: The public tasks and generator are visible. Use `--split hidden` with an unpublished seed for final evaluations.
- Refresh: Generate and review a new public seed every six months.

## OpenRouter model price snapshot

- Kind: `live-feed`
- URL: https://openrouter.ai/api/v1/models
- Licence: `NOASSERTION`
- Retrieved: 2026-10-15T08:04:45.790Z
- How to get it: Run `node scripts/fetch-prices.mjs`; no API key is required.
- Contamination notes: Factual pricing metadata, not evaluation content; OpenRouter states no separate data licence for the endpoint.
- Refresh: Refresh before releases and at least monthly; retain git history for audits.
