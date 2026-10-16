# Efficiency metrics

`costPerVerifiedSuccess` is total run cost divided by the number of tasks with score 1. A run with no verified successes reports `null`, not zero. The same block reports success rate, mean episode turns, total attempts, retries, input and output tokens, and cost per attempt.

The runner tracks usage per task across every call and every retry. A row keeps the summed usage of all attempts, including attempts that timed out or errored, so retry spend is never dropped. A row that errored before the provider returned any usage counts as a known spend of zero; it never makes the whole run `null`.

Provider-reported row cost is authoritative only when the provider returned a positive dollar amount. benchmark-core fills `costUsd: 0` on episodes where the provider reported nothing, so a missing or zero reported cost is never trusted as free. In that case, and when token counts are present, the package multiplies input and output tokens by the model's prompt and completion prices and marks the source `estimated`. OpenRouter runs refresh the public model feed when `OPENROUTER_API_KEY` is set; otherwise the committed snapshot is used. Models named under `--provider openai` also match `openai/<model>` entries in the price catalogue. Missing prices remain unavailable rather than being treated as free. The `costSource` field is `provider`, `estimated`, `mixed`, or `unavailable`; the live-versus-snapshot choice is recorded under `pricing.source`.

## Failure cases defined before implementation

- A zero-success run must not divide by zero.
- Missing usage or an unknown model must not produce a fabricated zero cost.
- A reported `costUsd` of zero is not trusted as authoritative; it is re-estimated from the price table when the model is priced.
- Failed attempts must add their usage to the row total instead of disappearing.
- Retries are `sum(attempts - 1)`, never failed-task count.
- Comparison must reject malformed and empty reports.
- A model is Pareto-optimal unless another report is at least as successful and no more expensive, with one strict advantage.

`benchmark-cost-per-task compare a.json b.json` prints the success-versus-cost table. Reports with unavailable cost appear in the table but cannot be marked Pareto-optimal.
