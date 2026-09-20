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

## Rehearsal operation

1. Fork a contest version. Choose fields, enable educational workflow, and supply a shared baseline.
2. Import complete reference labels. Structural validation does not imply clinician adjudication.
3. Select an explicit fixed model (even simulation records the intended configuration). Open practice.
4. Share one participant access code per team. Budgets belong to the account, not the browser; drafts are local, not collaborative documents.
5. Open final submission once teams finish. The first admitted final instruction hash remains locked even if infrastructure fails. Retry the same instructions after recovery.
6. End the event to reveal finals and the debrief. Educational reveal is irreversible; use a new version for another session.

## Validation scripts

- `test:education-fairness`: migrated, demo-seeded disposable `gpo_test` only; direct database concurrent admission, refunds, freeze and abandoned-worker fencing.
- `test:education-load`: disposable `gpo_edu_load` cloned from an educational fixture; 50 team practice/final bursts and replay. This is not HTTP or production load benchmarking.
- `test:education-provider`: disposable `gpo_edu_provider` cloned from an educational fixture; replaces fetch with a stub, proves malformed-output refunds versus valid abstention scoring with zero provider calls.
- Playwright `tests/e2e/education.pw.ts`: protected fixture credentials, explicit `E2E_ALLOW_MUTATIONS=true`, disposable app only. Forks synthetic contest, validates baseline equality, one editor, final hiding/replay/reveal and debrief.

Keep the server at one app process for the process-wide provider semaphore. Multi-replica provider limits require a distributed queue before scale-out. Provider routing/latency and real-model clinical performance still require separate calibration.

## Versioned system instruction

Team Challenge schemas can opt in to the reusable clinical-extraction system contract
with `education.systemPromptVersion: "clinical-extraction-v1"`. The enclosing
`education.version: 1` and `education.pipeline: "structured-v1"` remain unchanged.
An omitted selector preserves the historical system instruction byte-for-byte;
unknown selectors are rejected rather than silently falling back.

The opt-in contract delegates clinical interpretation to participant instructions.
The application appends only field identities, allowed values and numeric units,
while retaining its existing strict structured-output schema. Organizer clinical
definitions and the editor baseline are not appended to provider requests. The
baseline is sent only when a participant uses it as their submitted instructions.
Sandbox and scored evaluations use the same contract. Explicit `no_decision` is
still an abstention, not an automatic conversion to any clinical label; malformed
responses and provider failures remain errors.

Select the contract through the existing validated contest-schema save interface
on an unlocked draft. For a scored/locked contest, create a fresh inactive version
first; never modify historical evaluation semantics in place. Forks and recorded
run snapshots preserve the selector. A fork creates an inactive draft with copied reports and reference answers;
readiness and operational settings must still be verified before activation. The baseline text and activation remain independent decisions. No
private contest configuration, reports or answer keys belong in the repository.
