# Efficiency metrics

`costPerVerifiedSuccess` is total run cost divided by the number of tasks with score 1. A run with no verified successes reports `null`, not zero. The same block reports success rate, mean episode turns, total attempts, retries, input and output tokens, and cost per attempt.

Provider-reported row cost is authoritative. If it is absent and token counts are present, the package multiplies input and output tokens by the model's prompt and completion prices. OpenRouter runs refresh the public model feed when `OPENROUTER_API_KEY` is set; otherwise the committed snapshot is used. Missing prices remain unavailable rather than being treated as free. The `costSource` field is `provider`, `snapshot`, `live`, `mixed`, or `unavailable`.

## Failure cases defined before implementation

- A zero-success run must not divide by zero.
- Missing usage or an unknown model must not produce a fabricated zero cost.
- Explicit zero cost from the mock adapter must remain valid provider data.
- Retries are `sum(attempts - 1)`, never failed-task count.
- Comparison must reject malformed and empty reports.
- A model is Pareto-optimal unless another report is at least as successful and no more expensive, with one strict advantage.

`benchmark-cost-per-task compare a.json b.json` prints the success-versus-cost table. Reports with unavailable cost appear in the table but cannot be marked Pareto-optimal.
