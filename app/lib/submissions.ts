"use client";

import { useSyncExternalStore } from "react";
import { fallbackChallengeConfig } from "./challenge-config";
import { submissionStorageKey } from "./challenge-constants";
import type {
  ParticipantSubmissionHistory,
  StoredSubmission,
  SubmissionKind,
} from "./types";

export const maxPublicSubmissions = fallbackChallengeConfig.publicSubmissionLimit;

type SubmissionStore = Record<string, ParticipantSubmissionHistory>;

const submissionStoreEvent = "great-prompt-off-submissions";

function emptyHistory(): ParticipantSubmissionHistory {
  return {
    publicSubmissions: [],
    finalSubmission: null,
  };
}

function emitSubmissionStoreChange() {
  window.dispatchEvent(new Event(submissionStoreEvent));
}

function getServerSnapshot() {
  return "{}";
}

function getSubmissionStoreSnapshot() {
  if (typeof window === "undefined") {
    return "{}";
  }

  return window.localStorage.getItem(submissionStorageKey) ?? "{}";
}

function subscribeToSubmissionStore(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(submissionStoreEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(submissionStoreEvent, onStoreChange);
  };
}

export function useSubmissionStore() {
  const snapshot = useSyncExternalStore(
    subscribeToSubmissionStore,
    getSubmissionStoreSnapshot,
    getServerSnapshot,
  );

  return parseSubmissionStore(snapshot);
}

export function getParticipantHistory(
  store: SubmissionStore,
  participantId: string,
) {
  return store[participantId] ?? emptyHistory();
}

export function getRemainingPublicSubmissions(
  history: ParticipantSubmissionHistory,
) {
  return Math.max(0, maxPublicSubmissions - history.publicSubmissions.length);
}

export function saveSubmission(submission: StoredSubmission) {
  const store = readSubmissionStore();
  const history = store[submission.participantId] ?? emptyHistory();

  if (submission.kind === "public") {
    if (history.publicSubmissions.length >= maxPublicSubmissions) {
      return { ok: false, reason: "public_limit_reached" as const };
    }

    store[submission.participantId] = {
      ...history,
      publicSubmissions: [...history.publicSubmissions, submission],
    };
  } else {
    if (history.finalSubmission) {
      return { ok: false, reason: "final_already_used" as const };
    }

    store[submission.participantId] = {
      ...history,
      finalSubmission: submission,
    };
  }

  writeSubmissionStore(store);
  return { ok: true, reason: null };
}

export function clearParticipantPublicSubmissions(participantId: string) {
  const store = readSubmissionStore();
  const history = store[participantId];

  if (!history) {
    return;
  }

  store[participantId] = {
    ...history,
    publicSubmissions: [],
  };
  writeSubmissionStore(store);
}

export function getLocalLeaderboardRows(store: SubmissionStore) {
  return Object.values(store)
    .flatMap((history) => (history.finalSubmission ? [history.finalSubmission] : []))
    .sort((a, b) => b.score - a.score)
    .map((submission, index) => ({
      rank: index + 1,
      participant: submission.participantId,
      score: submission.score,
      final: true,
      submittedAt: submission.createdAt,
    }));
}

export function createSubmissionId(kind: SubmissionKind) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSubmissionStore() {
  return parseSubmissionStore(getSubmissionStoreSnapshot());
}

function writeSubmissionStore(store: SubmissionStore) {
  window.localStorage.setItem(submissionStorageKey, JSON.stringify(store));
  emitSubmissionStoreChange();
}

function parseSubmissionStore(snapshot: string): SubmissionStore {
  try {
    const parsed = JSON.parse(snapshot);

    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([participantId, value]) => [
        participantId,
        normalizeHistory(value),
      ]),
    );
  } catch {
    return {};
  }
}

function normalizeHistory(value: unknown): ParticipantSubmissionHistory {
  if (!isRecord(value)) {
    return emptyHistory();
  }

  const publicSubmissions = Array.isArray(value.publicSubmissions)
    ? value.publicSubmissions.filter(isStoredSubmission)
    : [];
  const finalSubmission = isStoredSubmission(value.finalSubmission)
    ? value.finalSubmission
    : null;

  return {
    publicSubmissions,
    finalSubmission,
  };
}

function isStoredSubmission(value: unknown): value is StoredSubmission {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.participantId === "string" &&
    (value.kind === "public" || value.kind === "final") &&
    typeof value.createdAt === "string" &&
    typeof value.promptSnapshot === "string" &&
    typeof value.score === "number" &&
    typeof value.correctFields === "number" &&
    typeof value.totalFields === "number" &&
    typeof value.reportCount === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
