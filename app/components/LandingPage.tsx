"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatParticipantAccessCodeInput,
  normalizeParticipantAccessCode,
} from "../lib/participant-codes";
import {
  clearParticipantId,
  saveParticipantSession,
  useSavedParticipantId,
  useSavedParticipantToken,
} from "../lib/participant-session";

type ParticipantValidationResponse = {
  source: "supabase" | "mock-file-fallback";
  valid: boolean;
  participantCode: string;
  participantToken: string | null;
  message: string;
};

type LandingChallengeMetadata = {
  challenge: {
    publicSubmissionLimit: number;
  } | null;
  reportCounts: {
    public: number;
    private: number;
  };
};

export function LandingPage() {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [challengeMetadata, setChallengeMetadata] =
    useState<LandingChallengeMetadata | null>(null);
  const savedParticipantId = useSavedParticipantId();
  const savedParticipantToken = useSavedParticipantToken();
  const showRememberedParticipant = savedParticipantId && !showCodeEntry;
  const statCards = [
    {
      label: "Test attempts",
      value: challengeMetadata?.challenge?.publicSubmissionLimit,
    },
    {
      label: "Public test reports",
      value: challengeMetadata?.reportCounts.public,
    },
    {
      label: "Hidden final reports",
      value: challengeMetadata?.reportCounts.private,
    },
  ];

  useEffect(() => {
    let ignore = false;

    async function loadChallengeMetadata() {
      try {
        const response = await fetch("/api/challenge-data");

        if (!response.ok) {
          throw new Error("Challenge metadata unavailable.");
        }

        const metadata = (await response.json()) as LandingChallengeMetadata;

        if (!ignore) {
          setChallengeMetadata(metadata);
        }
      } catch {
        if (!ignore) {
          setChallengeMetadata(null);
        }
      }
    }

    loadChallengeMetadata();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeParticipantAccessCode(participantId);

    if (!normalized) {
      return;
    }

    await validateAndEnter(normalized);
  }

  async function continueSavedParticipant() {
    await validateSavedParticipant(savedParticipantId, savedParticipantToken);
  }

  function useDifferentCode() {
    clearParticipantId();
    setParticipantId("");
    setValidationMessage("");
    setShowCodeEntry(true);
  }

  async function validateAndEnter(rawCode: string) {
    const normalized = normalizeParticipantAccessCode(rawCode);

    if (!normalized) {
      return;
    }

    setIsValidating(true);
    setValidationMessage("");

    try {
      const validation = await validateParticipantCode(normalized);

      if (!validation.valid) {
        setValidationMessage(validation.message);
        clearParticipantId();
        return;
      }

      if (!validation.participantToken) {
        setValidationMessage("Participant session could not be created. Please try again.");
        return;
      }

      saveParticipantSession(validation.participantCode, validation.participantToken);
      router.push("/challenge");
    } catch {
      setValidationMessage("Could not validate this access code. Please try again.");
    } finally {
      setIsValidating(false);
    }
  }

  async function validateSavedParticipant(
    participantCode: string,
    participantToken: string,
  ) {
    if (!participantCode || !participantToken) {
      clearParticipantId();
      setShowCodeEntry(true);
      return;
    }

    setIsValidating(true);
    setValidationMessage("");

    try {
      const validation = await validateParticipantSession(
        participantCode,
        participantToken,
      );

      if (!validation.valid || !validation.participantToken) {
        setValidationMessage(validation.message);
        clearParticipantId();
        setShowCodeEntry(true);
        return;
      }

      saveParticipantSession(validation.participantCode, validation.participantToken);
      router.push("/challenge");
    } catch {
      setValidationMessage("Could not validate the saved participant session. Please enter your access code again.");
      clearParticipantId();
      setShowCodeEntry(true);
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] dark:bg-slate-950 text-slate-950 dark:text-slate-50">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              The Great Prompt-Off
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Prompt workshop challenge
            </p>
          </div>
          <button
            type="button"
            onClick={continueSavedParticipant}
            disabled={!savedParticipantId || !savedParticipantToken}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
          >
            {savedParticipantId
              ? `Continue as ${savedParticipantId}`
              : "Enter code to continue"}
          </button>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Knee MRI extraction
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] text-slate-950 dark:text-slate-50 md:text-6xl">
              Clinical Radiology Data Extraction Challenge
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              Distill your clinical expertise into clear instructions that guide
              AI to extract structured findings from radiology reports. Refine
              your prompt using editable Sandbox samples, compare performance
              through counted public-leaderboard attempts, then make one locked
              final submission on hidden reports.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
            {showRememberedParticipant ? (
              <div className="mb-5 rounded-md border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 p-4">
                <p className="text-sm font-semibold text-teal-900 dark:text-teal-300">
                  Remembered participant
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-teal-950 dark:text-teal-300">
                  {savedParticipantId}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={continueSavedParticipant}
                    disabled={isValidating}
                    className="h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                  >
                    {isValidating ? "Checking..." : `Continue as ${savedParticipantId}`}
                  </button>
                  <button
                    type="button"
                    onClick={useDifferentCode}
                    disabled={isValidating}
                    className="h-11 rounded-md border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:border-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400"
                  >
                    Use a different code
                  </button>
                </div>
              </div>
            ) : null}

            {!showRememberedParticipant ? (
            <form onSubmit={handleSubmit}>
              <label
                htmlFor="participant-id"
                className="text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Participant access code
              </label>
              <input
                id="participant-id"
                value={participantId}
                onChange={(event) =>
                  setParticipantId(
                    formatParticipantAccessCodeInput(event.target.value),
                  )
                }
                placeholder="GPO-AB12-CD34"
                maxLength={13}
                className="mt-3 h-12 w-full rounded-md border border-slate-300 dark:border-slate-600 px-4 text-base outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
              />
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Participants receive a unique access code from the workshop
                organizer.
              </p>
              {validationMessage ? (
                <p className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-sm leading-6 text-amber-900 dark:text-amber-300">
                  {validationMessage}
                </p>
              ) : null}
              <button
                type="submit"
                className="mt-4 h-12 w-full rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                disabled={!participantId.trim() || isValidating}
              >
                {isValidating ? "Checking..." : "Enter workspace"}
              </button>
            </form>
            ) : null}

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-200 dark:border-slate-700 pt-5 text-center">
              {statCards.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-semibold text-slate-950 dark:text-slate-50">
                    {typeof stat.value === "number" ? stat.value : "-"}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex flex-col items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-4 text-center text-xs text-slate-400 sm:flex-row sm:justify-between sm:text-left">
          <span>
            Ethan B. Chen and Dr. Po-Hao Chen
          </span>
          <Link href="/admin" className="font-semibold text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300">
            Organizer access
          </Link>
        </footer>
      </section>
    </main>
  );
}

async function validateParticipantCode(accessCode: string) {
  const response = await fetch(
    "/api/participants/validate", {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode }),
    },
  );

  if (!response.ok) {
    throw new Error(`Participant validation failed with ${response.status}.`);
  }

  return (await response.json()) as ParticipantValidationResponse;
}

async function validateParticipantSession(
  participantCode: string,
  participantToken: string,
) {
  const response = await fetch(
    "/api/participants/validate", {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantCode, participantToken }),
    },
  );

  if (!response.ok) {
    throw new Error(`Participant session validation failed with ${response.status}.`);
  }

  return (await response.json()) as ParticipantValidationResponse;
}
