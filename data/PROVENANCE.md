# Cost Per Task provenance

## Seeded back-office episodes

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-cost-per-task/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root.
- Contamination notes: The 30 public tasks and generator are visible. Final evaluations should use `--split hidden` with an unpublished seed and keep the generated `data/tasks.hidden.jsonl` outside commits and packages.
- Refresh: Review a newly seeded public set every six months; record the seed and inspect the JSONL diff before release.

The company and person names are short maintainer-written lists. Invoice values, statuses, CRM records, and file assignments are generated locally. No third-party task text is copied.

## OpenRouter model price snapshot

- Kind: `live-feed`
- URL: https://openrouter.ai/api/v1/models
- Licence: `NOASSERTION`
- Retrieved: 2026-10-15 (exact timestamp is in `data/prices.json`)
- How to get it: Run `node scripts/fetch-prices.mjs`; no API key is required for the public endpoint.
- Contamination notes: Pricing is factual metadata rather than evaluation content. Provider terms may apply; OpenRouter does not state a separate data licence for this endpoint.
- Refresh: Refresh before a release and at least monthly. Keep the old snapshot in git history so historical estimates remain auditable.

Provider-reported cost takes priority. Snapshot prices are used only when an adapter reports token counts without cost; reports must identify that estimate.
