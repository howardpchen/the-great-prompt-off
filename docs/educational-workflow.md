# Report-to-Registry educational workflow v1

An opt-in, versioned contest workflow. Existing contests and their history retain legacy semantics.

## Contract

- Organizer-owned clinical definitions and a shared baseline live in the versioned contest schema.
- One editor holds the complete team instruction. A participant account represents one team across browser sessions.
- Pipeline v1 uses a fixed model, temperature 0, schema-derived bounded output size, strict structured output and deterministic validation. No formatting LLM.
- Every field has `{status:"decision",value:<allowed clinical value>}` or `{status:"no_decision",value:null}`. Clinical null and no-decision are distinct. Only valid clinical decisions reach the scorer; missing decisions earn zero, never default negatives.
- Provider/format failures fail the reservation and do not charge a practice attempt. Explicit no-decision is a valid evaluated answer, not infrastructure failure.
- One hidden final per team; final results revealed only with the event reveal. Schema/model/baseline/budgets freeze after admission.
- Model and synthetic rehearsal behavior are distinguishable. Synthetic results demonstrate mechanics, not clinical accuracy. A baseline comparison requires an actual run on the same cases/pipeline.

## Checkpoints and acceptance

1. Contract and tests; opt-in schema metadata.
2. Extraction/structured-output boundary; deterministic simulation exercises the boundary.
3. Team UI and fairness safeguards; baseline instructions, request replay, final reveal.
4. Integrated lint/type/unit/build/database/browser evidence and limitations.

No paid calls, production data changes or public publication during implementation. Clinical reference adjudication and paid-model calibration remain prerequisites to a live event.

## Evaluator mode and rollout

The schema records `education.evaluationMode` (default `simulation`). Real evaluation requires a new, appropriately configured contest version and matching server real-model mode; changing an environment variable cannot silently mix synthetic and clinical scores. The first milestone UI creates simulation contests only. Paid-model calibration remains separately authorized.

Common simulation baseline is computed with exactly the same deterministic simulator and public cases as a team attempt. It is explicitly synthetic. A real-mode contest displays no fabricated baseline: organizer calibration and persistent common real baseline are a later gate.
