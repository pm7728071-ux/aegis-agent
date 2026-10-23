# Aegis Roadmap — 60-Day Evaluation & Evidence Plan

A disciplined plan to prove the gate works, measure it, and release the evidence.

## Days 1–14: Build the evaluation engine

Create a fixed test suite, measure AEGIS's current performance, and make failures reproducible.

- Fixed, repeatable suites: `tests/security.js` (37 checks) + `tests/readiness.js` (43 checks), runnable as one command against any deployment.
- Record a dated baseline: pass/fail counts, latency of verdicts, audit-trail accuracy — stored as a committed baseline file so every later run compares against the same numbers.
- Make failures reproducible: every red check must carry a status code, reason, and repro command.

## Days 15–30: Build the execution loop

Plan tasks, use tools, verify results, handle errors, and request approval before consequential actions.

- A step-by-step loop for every change: plan → execute → verify → report.
- Error handling: failures produce diagnoses, not silent skips; retries must change approach.
- Approval gate: any consequential action (settlement rail changes, key policy changes, external communication) requires explicit operator approval first.

## Days 31–45: Prove improvement

Compare AEGIS against its original baseline and relevant existing tools on the same problems.

- Re-run the fixed suites against the Days 1–14 baseline; deltas must be measurable.
- Compare against relevant existing tools on the same problems (spend limits, replay protection, fail-closed behavior) and document where Aegis is better, equal, or worse.

## Days 46–60: Release the evidence

Prepare a working demo, publish benchmark results, document limitations, and invite independent developers to test it.

- A working demo anyone can run in minutes (playground + one-click key).
- Published benchmark results, including the failures and trade-offs.
- A written limitations page — what Aegis does not protect against.
- Open invitation to independent developers to test, break, and report.
