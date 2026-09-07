"use client";

import { useSyncExternalStore } from "react";
import {
  participantSessionTokenStorageKey,
  participantStorageKey,
} from "./challenge-constants";
import { normalizeParticipantCode } from "./participant-codes";

const participantSessionEvent = "great-prompt-off-participant-session";

function emitParticipantSessionChange() {
  window.dispatchEvent(new Event(participantSessionEvent));
}

function getParticipantSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(participantStorageKey) ?? "";
}

function getParticipantTokenSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(participantSessionTokenStorageKey) ?? "";
}

function getServerSnapshot() {
  return "";
}

function subscribeToParticipantSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(participantSessionEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(participantSessionEvent, onStoreChange);
  };
}

export function useSavedParticipantId() {
  return useSyncExternalStore(
    subscribeToParticipantSession,
    getParticipantSnapshot,
    getServerSnapshot,
  );
}

export function useSavedParticipantToken() {
  return useSyncExternalStore(
    subscribeToParticipantSession,
    getParticipantTokenSnapshot,
    getServerSnapshot,
  );
}

export function saveParticipantId(participantId: string) {
  window.localStorage.setItem(
    participantStorageKey,
    normalizeParticipantCode(participantId),
  );
  emitParticipantSessionChange();
}

export function saveParticipantSession(participantId: string, participantToken: string) {
  saveParticipantId(participantId);
  window.localStorage.removeItem(participantSessionTokenStorageKey);
  window.sessionStorage.setItem(participantSessionTokenStorageKey, participantToken);
  emitParticipantSessionChange();
}

export function clearParticipantId() {
  window.localStorage.removeItem(participantStorageKey);
  window.localStorage.removeItem(participantSessionTokenStorageKey);
  window.sessionStorage.removeItem(participantSessionTokenStorageKey);
  emitParticipantSessionChange();
}
