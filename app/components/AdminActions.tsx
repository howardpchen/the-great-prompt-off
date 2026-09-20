"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  eventPhaseLabel,
  eventPhases,
  type EventPhase,
} from "@/app/lib/event-phase";
import {
  leaderboardVisibilityLabel,
  leaderboardVisibilityModes,
  type LeaderboardVisibility,
} from "@/app/lib/leaderboard-visibility";
import { getFriendlyModelName } from "@/app/lib/model-display";
import {
  evaluationModelOptions,
  isApprovedEvaluationModel,
} from "@/app/lib/model-options";

export function AdminLogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function logout() {
    setIsPending(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
    setIsPending(false);
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
    >
      {isPending ? "Logging out..." : "Logout"}
    </button>
  );
}

export function AdminResetPanel() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function resetWorkshopData() {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Reset failed.");
      setIsPending(false);
      return;
    }

    setConfirmation("");
    setMessage("Leaderboard, submissions, and run history cleared.");
    setIsPending(false);
    window.setTimeout(() => {
      router.refresh();
    }, 1200);
  }

  return (
    <section className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
        Destructive organizer action
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
        Clear leaderboard & submissions
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Clears test attempts, final submissions, leaderboard results, and run
        history.
      </p>
      <p className="mt-2 rounded-md border border-rose-100 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm leading-6 text-rose-900 dark:text-rose-300">
        Type RESET to confirm. This deletes prompt run items, submissions, and
        prompt runs. Participants, access codes, cases/reports, answer keys, and
        challenges are preserved.
      </p>
      <input
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder="Type RESET"
        className="mt-4 h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-800"
      />
      <button
        type="button"
        onClick={resetWorkshopData}
        disabled={confirmation !== "RESET" || isPending}
        className="mt-3 h-10 rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        {isPending ? "Clearing..." : "Clear leaderboard & submissions"}
      </button>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminEventControls({
  currentPhase,
}: {
  currentPhase: EventPhase;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function changePhase(nextPhase: EventPhase) {
    if (nextPhase === currentPhase) {
      return;
    }

    if (nextPhase === "final_open") {
      const confirmed = window.confirm(
        "Open Final Submission? Test Attempts will close and Final Submission will open.",
      );

      if (!confirmed) {
        return;
      }
    }

    if (nextPhase === "ended") {
      const confirmed = window.confirm(
        "End and reveal final results? All submissions close. Revealed final results cannot be hidden again.",
      );

      if (!confirmed) {
        return;
      }
    }

    if (
      (currentPhase === "final_open" || currentPhase === "ended") &&
      nextPhase !== "ended"
    ) {
      const confirmation = window.prompt(
        `Moving back to ${eventPhaseLabel(nextPhase)} can reopen event actions. Type ${nextPhase} to confirm.`,
      );

      if (confirmation !== nextPhase) {
        return;
      }
    }

    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/challenge-phase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phase: nextPhase }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not update event phase.");
      setIsPending(false);
      return;
    }

    setMessage(`Event phase changed to ${eventPhaseLabel(nextPhase)}.`);
    setIsPending(false);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Event controls
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Event phase</h2>
        <span className="rounded-md bg-teal-50 dark:bg-teal-950 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300">
          {eventPhaseLabel(currentPhase)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Controls participant access to Test Attempts and Final Submission.
        Login remains available in every phase.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {eventPhases.map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => changePhase(phase)}
            disabled={isPending || phase === currentPhase || currentPhase === "ended"}
            className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
          >
            {phase === currentPhase
              ? `${eventPhaseLabel(phase)} current`
              : `Set ${eventPhaseLabel(phase)}`}
          </button>
        ))}
      </div>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminLeaderboardVisibilityControls({
  currentVisibility,
}: {
  currentVisibility: LeaderboardVisibility;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function changeVisibility(nextVisibility: LeaderboardVisibility) {
    if (nextVisibility === currentVisibility) {
      return;
    }

    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/leaderboard-visibility", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility: nextVisibility }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not update leaderboard visibility.");
      setIsPending(false);
      return;
    }

    setMessage(
      `Participant leaderboard visibility changed to ${leaderboardVisibilityLabel(
        nextVisibility,
      )}.`,
    );
    setIsPending(false);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Leaderboard visibility
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">
          Participant leaderboard
        </h2>
        <span className="rounded-md bg-teal-50 dark:bg-teal-950 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300">
          {leaderboardVisibilityLabel(currentVisibility)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Controls when participants can see the leaderboard. Admin result pages
        remain visible to organizers.
      </p>
      <div className="mt-4 grid gap-2">
        {leaderboardVisibilityModes.map((visibility) => (
          <button
            key={visibility}
            type="button"
            onClick={() => changeVisibility(visibility)}
            disabled={isPending || visibility === currentVisibility}
            className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
          >
            {visibility === currentVisibility
              ? `${leaderboardVisibilityLabel(visibility)} current`
              : `Set ${leaderboardVisibilityLabel(visibility)}`}
          </button>
        ))}
      </div>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminEvaluationModelControls({
  currentModel,
  resolvedModel,
  fallbackModel,
}: {
  currentModel: string | null;
  resolvedModel: string;
  fallbackModel: string;
}) {
  const router = useRouter();
  const initialSelection = isApprovedEvaluationModel(currentModel)
    ? currentModel
    : "";
  const [selection, setSelection] = useState(initialSelection);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const selectedOption = evaluationModelOptions.find(
    (option) => option.id === selection,
  );
  const draftModel = selection;

  async function saveModel() {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/evaluation-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: draftModel }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      evaluationModel?: string | null;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not update evaluation model.");
      setIsPending(false);
      return;
    }

    const savedModel = body?.evaluationModel || "";
    setSelection(isApprovedEvaluationModel(savedModel) ? savedModel : "");
    setMessage(savedModel ? "Challenge model override saved." : "Model override cleared.");
    setIsPending(false);
    router.refresh();
  }

  async function clearModel() {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/evaluation-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not clear evaluation model override.");
      setIsPending(false);
      return;
    }

    setSelection("");
    setMessage("Model override cleared; environment fallback is active.");
    setIsPending(false);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Evaluation model
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Difficulty setting</h2>
        <span className="rounded-md bg-teal-50 dark:bg-teal-950 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:text-teal-300">
          {getFriendlyModelName(resolvedModel)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Model choice controls challenge difficulty. Weaker models may make
        participant prompt strategy matter more. Use calibration after changing
        models.
      </p>
      <p className="mt-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
        The evaluation model and active mode/schema can be changed before the
        first successful submission. After Test Attempts or a Final Submission
        are recorded, they are locked until workshop run data is reset.
      </p>
      {currentModel && !isApprovedEvaluationModel(currentModel) ? (
        <p className="mt-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm leading-6 text-amber-900 dark:text-amber-300">
          Unsupported saved model: {currentModel}. Choose an approved model or
          reset to the environment fallback.
        </p>
      ) : null}
      <label className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-100">
        Challenge model
        <select
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
          className="mt-2 h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
        >
          <option value="">Use environment fallback</option>
          {evaluationModelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} - {option.difficulty} ({option.id})
            </option>
          ))}
        </select>
      </label>
      {selectedOption ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {selectedOption.difficulty}: {selectedOption.note}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Current resolved model: {resolvedModel}. Environment fallback: {fallbackModel}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveModel}
          disabled={isPending || !draftModel.trim()}
          className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {isPending ? "Saving..." : "Save model"}
        </button>
        <button
          type="button"
          onClick={clearModel}
          disabled={isPending || !currentModel}
          className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
        >
          Use environment fallback
        </button>
      </div>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminChallengeSchemaPanel({
  challengeSchema,
}: {
  challengeSchema: {
    modeId: string;
    schemaVersion: number;
    title: string;
    fields: readonly { key: string; label: string }[];
    configurationLocked: boolean;
    activationOptions: readonly {
      id: string;
      title: string;
      version: number;
      fieldCount: number;
    }[];
  };
}) {
  const router = useRouter();
  const initialSelection = challengeSchema.activationOptions.some(
    (option) => option.id === challengeSchema.modeId,
  )
    ? challengeSchema.modeId
    : challengeSchema.activationOptions[0]?.id || "";
  const [selection, setSelection] = useState(initialSelection);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");
  const selectedMode = challengeSchema.activationOptions.find(
    (option) => option.id === selection,
  );

  async function updateMode() {
    if (!selectedMode) return;

    setIsPending(true);
    setMessage("");
    const response = await fetch("/api/admin/challenge-schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modeId: selectedMode.id,
        schemaVersion: selectedMode.version,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not update the challenge schema.");
      setIsPending(false);
      return;
    }

    setIsConfirming(false);
    setMessage("Challenge mode updated.");
    setIsPending(false);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
            Challenge schema
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
            {challengeSchema.title}
          </h2>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            challengeSchema.configurationLocked
              ? "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
              : "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          {challengeSchema.configurationLocked ? "Locked" : "Unlocked"}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Mode ID</dt>
          <dd className="mt-1 font-mono text-xs text-slate-900 dark:text-slate-100">
            {challengeSchema.modeId}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Schema version</dt>
          <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            {challengeSchema.schemaVersion}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Field count</dt>
          <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            {challengeSchema.fields.length}
          </dd>
        </div>
      </dl>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fields</p>
        <ul className="mt-2 grid gap-1 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          {challengeSchema.fields.map((field) => (
            <li key={field.key}>
              <span className="font-medium text-slate-900 dark:text-slate-100">{field.label}</span>{" "}
              <span className="font-mono text-xs">({field.key})</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {challengeSchema.configurationLocked
          ? "Challenge configuration is locked after event activity has started. Reset workshop run data before changing mode."
          : "This challenge is still configurable before submissions begin. Future mode or schema changes must happen before the first successful submission."}
      </p>
      <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mode activation</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Only modes approved for activation appear here. Dormant schemas remain
          unavailable until their reports and answer keys are prepared.
        </p>
        <label className="mt-3 block text-sm font-semibold text-slate-800 dark:text-slate-100">
          Available challenge mode
          <select
            value={selection}
            onChange={(event) => {
              setSelection(event.target.value);
              setIsConfirming(false);
              setMessage("");
            }}
            disabled={challengeSchema.configurationLocked || isPending}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
          >
            {challengeSchema.activationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          disabled={challengeSchema.configurationLocked || isPending || !selectedMode}
          className="mt-3 h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          Review mode change
        </button>
        {isConfirming && selectedMode ? (
          <div className="mt-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-950 dark:text-amber-300">
            <p className="font-semibold">Confirm challenge mode change</p>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div><dt className="text-amber-800 dark:text-amber-300">Mode ID</dt><dd className="font-mono">{selectedMode.id}</dd></div>
              <div><dt className="text-amber-800 dark:text-amber-300">Title</dt><dd>{selectedMode.title}</dd></div>
              <div><dt className="text-amber-800 dark:text-amber-300">Schema version</dt><dd>{selectedMode.version}</dd></div>
              <div><dt className="text-amber-800 dark:text-amber-300">Field count</dt><dd>{selectedMode.fieldCount}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-5">
              This requires compatible answer keys for every public and private
              report and is allowed only before event activity begins.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={updateMode}
                disabled={isPending}
                className="h-9 rounded-md bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isPending ? "Updating..." : "Confirm mode change"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                disabled={isPending}
                className="h-9 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function AdminEventAnnouncementControls({
  currentAnnouncement,
}: {
  currentAnnouncement: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(currentAnnouncement);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const remaining = 240 - draft.length;

  async function saveAnnouncement(nextAnnouncement = draft) {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/event-announcement", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ announcement: nextAnnouncement }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      eventAnnouncement?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Could not update announcement.");
      setIsPending(false);
      return;
    }

    setDraft(body?.eventAnnouncement || "");
    setMessage(body?.eventAnnouncement ? "Announcement updated." : "Announcement cleared.");
    setIsPending(false);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Event announcement
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
        Participant banner
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Show a short live message at the top of the participant workspace.
        Empty text clears the banner.
      </p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={240}
        rows={3}
        placeholder="Optional live announcement..."
        className="mt-4 w-full resize-none rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{Math.max(0, remaining)} characters remaining</span>
        {currentAnnouncement ? (
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1">
            Current: {currentAnnouncement}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => saveAnnouncement()}
          disabled={isPending || draft.length > 240}
          className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {isPending ? "Saving..." : "Update announcement"}
        </button>
        <button
          type="button"
          onClick={() => saveAnnouncement("")}
          disabled={isPending || (!draft && !currentAnnouncement)}
          className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
        >
          Clear
        </button>
      </div>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminEventTimerControls({
  currentEndsAt,
  currentLabel,
}: {
  currentEndsAt: string | null;
  currentLabel: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(currentLabel);
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const remaining = 80 - label.length;

  async function postTimer(body: Record<string, unknown>) {
    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/event-timer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as {
      error?: string;
      eventTimerEndsAt?: string | null;
      eventTimerLabel?: string;
    } | null;

    if (!response.ok) {
      setMessage(responseBody?.error || "Could not update event timer.");
      setIsPending(false);
      return;
    }

    setLabel(responseBody?.eventTimerLabel || "");
    setMessage(responseBody?.eventTimerEndsAt ? "Timer set." : "Timer cleared.");
    setIsPending(false);
    router.refresh();
  }

  function setTimer() {
    postTimer({
      durationMinutes: Number(durationMinutes),
      label,
    });
  }

  function clearTimer() {
    postTimer({ clear: true });
  }

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Event timer
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
        Display countdown
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Show a live countdown in the participant workspace. This is
        display-only and does not change event phase when it ends.
      </p>
      {currentEndsAt ? (
        <p className="mt-3 rounded-md border border-teal-100 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 p-3 text-sm leading-6 text-teal-900 dark:text-teal-300">
          Current timer: {currentLabel || "Event timer"} ends at{" "}
          {new Date(currentEndsAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      <label className="mt-4 grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Timer label
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={80}
          placeholder="Practice round"
          className="h-10 rounded-md border border-slate-300 dark:border-slate-600 px-3 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
        />
      </label>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {Math.max(0, remaining)} characters remaining
      </div>
      <label className="mt-3 grid gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Duration
        <select
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(event.target.value)}
          className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
        >
          {[5, 10, 15, 20, 30, 45, 60, 90, 120, 180].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setTimer}
          disabled={isPending || label.length > 80}
          className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {isPending ? "Saving..." : "Set timer"}
        </button>
        <button
          type="button"
          onClick={clearTimer}
          disabled={isPending || !currentEndsAt}
          className="h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
        >
          Clear
        </button>
      </div>
      {message ? (
        <p className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function AdminParticipantActions({
  displayName,
  email,
  extraPublicAttempts,
  isActive,
  participantCode,
}: {
  displayName: string | null;
  email: string | null;
  extraPublicAttempts: number;
  isActive: boolean;
  participantCode: string;
}) {
  const router = useRouter();
  const [draftDisplayName, setDraftDisplayName] = useState(displayName || "");
  const [draftEmail, setDraftEmail] = useState(email || "");
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function postAction(url: string, body: Record<string, unknown>) {
    setIsPending(true);
    setMessage("");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as {
      accessCode?: string;
      extraPublicAttempts?: number;
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(responseBody?.error || "Admin action failed.");
      setIsPending(false);
      return null;
    }

    router.refresh();
    setIsPending(false);
    return responseBody;
  }

  async function regenerateAccessCode() {
    const confirmation = window.prompt(
      `Regenerate access code for ${participantCode}? The old code will stop working. Type ${participantCode} to confirm.`,
    );

    if (confirmation !== participantCode) {
      return;
    }

    const result = await postAction("/api/admin/participants/regenerate-access-code", {
      participantCode,
      confirmation,
    });

    if (result?.accessCode) {
      setMessage(`New code: ${result.accessCode}`);
    }
  }

  async function clearParticipantData() {
    const confirmation = window.prompt(
      `Clear attempts and final submission for ${participantCode}? Type ${participantCode} to confirm.`,
    );

    if (confirmation !== participantCode) {
      return;
    }

    const result = await postAction("/api/admin/participants/clear-data", {
      participantCode,
      confirmation,
    });

    if (result) {
      setMessage("Participant run data cleared.");
    }
  }

  async function grantExtraTestAttempt() {
    const confirmation = window.prompt(
      `Grant one extra Test Attempt to ${participantCode}? Type ${participantCode} to confirm.`,
    );

    if (confirmation !== participantCode) {
      return;
    }

    const result = await postAction(
      "/api/admin/participants/grant-extra-test-attempt",
      {
        participantCode,
        confirmation,
      },
    );

    if (result) {
      setMessage(
        `Extra Test Attempts: ${result.extraPublicAttempts ?? extraPublicAttempts + 1}.`,
      );
    }
  }

  async function toggleActive() {
    const verb = isActive ? "Deactivate" : "Reactivate";

    if (!window.confirm(`${verb} ${participantCode}?`)) {
      return;
    }

    const result = await postAction("/api/admin/participants/set-active", {
      participantCode,
      isActive: !isActive,
    });

    if (result) {
      setMessage(isActive ? "Participant deactivated." : "Participant reactivated.");
    }
  }

  async function saveIdentity() {
    const result = await postAction("/api/admin/participants/update-identity", {
      participantCode,
      displayName: draftDisplayName,
      email: draftEmail,
    });

    if (result) {
      setIsEditing(false);
      setMessage("Participant identity updated.");
    }
  }

  function cancelIdentityEdit() {
    setDraftDisplayName(displayName || "");
    setDraftEmail(email || "");
    setIsEditing(false);
    setMessage("");
  }

  return (
    <div className="grid min-w-[180px] gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsEditing((current) => !current);
            setMessage("");
          }}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 dark:border-slate-600 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={regenerateAccessCode}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 dark:border-slate-600 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
        >
          New code
        </button>
        <button
          type="button"
          onClick={clearParticipantData}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 dark:border-slate-600 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-600 hover:text-rose-700 dark:hover:text-rose-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
        >
          Clear data
        </button>
        <button
          type="button"
          onClick={grantExtraTestAttempt}
          disabled={isPending || !isActive}
          className="h-8 rounded-md border border-slate-300 dark:border-slate-600 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
        >
          Grant +1 test
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className="h-8 rounded-md border border-slate-300 dark:border-slate-600 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {isEditing ? (
        <div className="grid gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Display name
            <input
              value={draftDisplayName}
              onChange={(event) => setDraftDisplayName(event.target.value)}
              maxLength={80}
              className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 font-normal text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-800"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Email
            <input
              type="email"
              value={draftEmail}
              onChange={(event) => setDraftEmail(event.target.value)}
              maxLength={254}
              className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 font-normal text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-800"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveIdentity}
              disabled={isPending}
              className="h-8 rounded-md bg-teal-700 px-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelIdentityEdit}
              disabled={isPending}
              className="h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{message}</p> : null}
    </div>
  );
}
