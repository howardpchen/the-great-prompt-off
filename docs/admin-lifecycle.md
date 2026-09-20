# Contest preparation and operation

The organizer workflow separates Library (choose/create), Builder (draft preparation), and Run (active event operations). Template selection occurs only when creating a draft. Viewing another contest never changes the active contest.

First activation freezes the evaluation configuration, including fields, reports, references, split, model/prompt configuration, and standard budgets. Pausing, switching away, clearing attempts, or archiving must not unlock it. Duplicate a frozen contest into a new inactive draft to make changes. Duplicate current reports and reference keys, not submissions, grants, or participant history.

Live controls retain phases, announcements/timer, leaderboard visibility/reveal, Sandbox availability, and explicit participant accommodations. Final reveal is irreversible. Definitions, baseline, system contract and model settings are inspectable read-only. Maintenance actions live on a separate page; new rehearsals should prefer duplication.

Local acceptance: database enforcement before first attempt and after deactivation; complete draft duplication; stale-revision rejection; no source mutation/history copying; authenticated Builder/Library and Run browser flows; no templates or definition editing on Run or frozen inspection. Synthetic fixtures only. Publication, deployment, and any live lifecycle migration remain separate approvals.

## Deployment and rollback

Migration 031 backfills the freeze marker for active contests and contests with historical activity. This intentionally makes previously editable active contests immutable even if they have no scored attempts. An image-only rollback does not undo database lifecycle rules; rollback of those semantics requires the verified pre-migration database backup. Rehearse migration on a restored copy before any approved deployment.

Draft report edits invalidate readiness. The Builder supports report text/partition edits and full reference imports; changing field definitions creates a new schema revision. Clinician-adjudicated references are not silently overwritten. Read-only inspection is scoped to the selected contest, including inactive versions.
