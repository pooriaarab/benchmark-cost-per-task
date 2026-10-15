# Grading

Every task starts a fresh virtual file system and CRM. The grader replays the submitted tool log against that initial state; it never trusts a submitted `finalState` or tool result. A task scores 1 only when all files and CRM records exactly match the task's expected state and `finish_task` was called. Otherwise it scores 0 with the mismatched state named in the reason.

## Failure modes considered before implementation

1. **Claiming success without doing work.** Text answers, including “yes,” do not change replayed state.
2. **Forging final state or tool results.** Only tool names and arguments are replayed. Submitted result fields and `finalState` are ignored.
3. **Always making the same call.** Every public task has a distinct target state, and a finish-only trace fails all of them.
4. **Changing extra data.** Verification compares the complete file map and CRM record list, so unrelated edits fail.
5. **Skipping completion.** Correct state without `finish_task` fails; this keeps episode termination measurable.
6. **Malformed calls.** Unknown tools, missing arguments, missing records, and missing files return deterministic errors without mutating state.
7. **Object key order.** Comparison recursively sorts object keys so serialization order cannot change a score.
8. **Nondeterministic replay.** The environment has no clock, network, or randomness after task generation.

The E2E script runs all 30 tasks and checks that a finish-only trace scores 0 on every task.

## Limits

The expected state is public, so these tasks measure tool execution rather than secrecy or memorization resistance. Exact final-state grading does not reward a partially correct workflow. Public results should identify the package version and seed; serious evaluations should use an unpublished generated split.
