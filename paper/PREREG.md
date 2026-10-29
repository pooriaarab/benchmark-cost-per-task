# Cost per verified task: study plan

Date: 2026-10-29. No study outcomes have been collected. Source inspection and the accepted honesty layout pilot inform this plan. No honesty text or outcomes enter this study. This local git registration is not an independent public preregistration.

## Questions and outcomes
H1: The privileged expected-state oracle passes every public task; empty, constant, echo, refusal, and first-tool policies fail. These are harness controls, not model results.
H2: Omitting finish or adding an unrelated file makes an otherwise correct trace fail. Replay ignores forged final state and tool results.
H3: In a simulated population, redundant read-only verification increases assumed cost without changing success. This is a negative control, not a useful repair policy.
Primary outcomes: verified success with 95% Wilson intervals; total assumed USD and assumed USD per verified success. Zero successes or unknown cost leave the ratio unavailable. Secondary outcomes: turns, attempts, cost-source behavior, and paired cost differences.

## Design
Use benchmark-cost-per-task 0.2.0 at the source commit recorded in config.json. Use all 30 public tasks without exclusions. Run seven scripted policies (oracle, empty, constant, echo, refusal, first-tool, finish-only), then score no-finish, extra-file, forged-state traces on every task through public scoring. Repeat the baseline runs and compare semantic traces, excluding timing and run identifiers.
Run a clearly labelled simulated population with success propensities 0.1, 0.3, 0.5, 0.7, 0.9, seeds 1 through 20, and direct versus redundant-read controls. Hash seed and task ID to select oracle versus finish-only behavior. Use the same draw for both controls. All tasks run through the public run function. The oracle sees expected state; no simulated agent learns or reasons.
For simulated costing, each adapter turn reports 1000 input and 100 output tokens. A fixed artificial tariff uses USD 0.000001/input token and 0.000002/output token. These are assumptions, not provider bills or real tokenizer measurements. The redundant control adds one list_records call and one adapter turn to every episode. Direct behavior is returned on the next turn.
Report Wilson intervals on each baseline. For simulated cells, bootstrap whole seed clusters (2000 draws, seed 20261029), preserving task dependence within a seed. Report cost per success and paired cost difference from the same clusters. Record undefined bootstrap ratios rather than replacing them with zero. Do not treat repeated runs as new tasks.
Audit accounting by applying the public addEfficiency function to observed baseline reports with controlled usage fields: positive cost, zero cost with tokens, absent usage, unknown tariff, failed rows without usage, and zero success. These are synthetic accounting fixtures, not actual billing events.

## Stops, exclusions, and failure modes
Stop after all fixed cells and repeats finish. No score-based exclusions, no tuning, no paid calls, no hosted calls. Free hosted inference is not configured for this study; availability is not probed. Record errors as outcomes and stop on unexpected infrastructure failure. Preserve every planned null result. Validate replay against real oracle successes before interpreting rejected traces.
Potential failures: fabricated state accepted; missing finish accepted; unrelated edits accepted; unknown costs become zero; no-success ratios become finite; repeated traces change; generated numbers diverge from raw reports; plots omit uncertainty. Verify these through public runner/scorer outputs and save an evidence artifact.
No external deposit or publication is authorized. Any change precedes affected runs in a dated amendment.
