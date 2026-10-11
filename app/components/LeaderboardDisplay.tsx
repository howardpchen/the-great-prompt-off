"use client";

import { useEffect, useState } from "react";
import { eventPhaseLabel, type EventPhase } from "@/app/lib/event-phase";

type ChallengeDataStatus = {
  challenge: {
    title: string;
    eventPhase: EventPhase;
    eventAnnouncement: string;
    eventTimerEndsAt: string | null;
    eventTimerLabel: string;
  } | null;
};

type LeaderboardRow = {
  rank: number;
  participant: string;
  displayName?: string | null;
  score: number;
  final: boolean;
  submittedAt?: string;
};

type LeaderboardResponse = {
  visible: boolean;
  rows: LeaderboardRow[];
};

export function LeaderboardDisplay() {
  const [challengeData, setChallengeData] = useState<ChallengeDataStatus | null>(
    null,
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse>({
    visible: false,
    rows: [],
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [warning, setWarning] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let ignore = false;

    async function loadDisplayData() {
      try {
        const [challengeResponse, leaderboardResponse] = await Promise.all([
          fetch("/api/challenge-data"),
          fetch("/api/leaderboard"),
        ]);

        if (!challengeResponse.ok || !leaderboardResponse.ok) {
          throw new Error("Display data request failed.");
        }

        const [nextChallengeData, nextLeaderboard] = (await Promise.all([
          challengeResponse.json(),
          leaderboardResponse.json(),
        ])) as [ChallengeDataStatus, LeaderboardResponse];

        if (!ignore) {
          setChallengeData(nextChallengeData);
          setLeaderboard(nextLeaderboard);
          setLastUpdated(new Date());
          setWarning("");
        }
      } catch {
        if (!ignore) {
          setWarning("Live display could not update. Showing the last available data.");
        }
      }
    }

    loadDisplayData();
    const timer = window.setInterval(loadDisplayData, 12000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const challenge = challengeData?.challenge;
  const phase = challenge?.eventPhase ?? "not_started";
  const announcement = challenge?.eventAnnouncement?.trim() ?? "";
  const timerEndsAt = challenge?.eventTimerEndsAt ?? null;
  const timerLabel = challenge?.eventTimerLabel?.trim() ?? "";

  return (
    <main className="min-h-screen bg-[#071411] px-8 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-teal-200">
              The Great Prompt-Off
            </p>
            <h1 className="mt-2 text-5xl font-semibold tracking-normal text-white xl:text-7xl">
              Leaderboard
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-lg text-slate-200">
              <span className="rounded-md border border-teal-300/30 bg-teal-300/10 px-3 py-1 font-semibold text-teal-100">
                {eventPhaseLabel(phase)}
              </span>
              <span>Updates automatically</span>
              <span aria-hidden="true">|</span>
              <span>Last updated: {formatDisplayTime(lastUpdated)}</span>
            </div>
          </div>
          {timerEndsAt ? (
            <DisplayTimer endsAt={timerEndsAt} label={timerLabel} now={now} />
          ) : null}
        </header>

        {announcement ? (
          <section className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-2xl font-semibold leading-8 text-cyan-50">
            {announcement}
          </section>
        ) : null}

        {warning ? (
          <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-lg text-amber-100">
            {warning}
          </p>
        ) : null}

        {!leaderboard.visible ? (
          <section className="flex flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-10 text-center">
            <p className="max-w-3xl text-4xl font-semibold leading-tight text-slate-100">
              Leaderboard is currently hidden by the organizer.
            </p>
          </section>
        ) : leaderboard.rows.length === 0 ? (
          <section className="flex flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-10 text-center">
            <p className="max-w-3xl text-4xl font-semibold leading-tight text-slate-100">
              No submissions yet.
            </p>
          </section>
        ) : (
          <section className="grid flex-1 content-start gap-3">
            {leaderboard.rows.map((row) => (
              <LeaderboardDisplayRow key={row.participant} row={row} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function DisplayTimer({
  endsAt,
  label,
  now,
}: {
  endsAt: string;
  label: string;
  now: number;
}) {
  const endTimestamp = Date.parse(endsAt);

  if (!Number.isFinite(endTimestamp)) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.ceil((endTimestamp - now) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timerText =
    remainingSeconds > 0
      ? `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : "Timer ended";

  return (
    <div className="rounded-lg border border-indigo-300/30 bg-indigo-300/10 px-5 py-4 text-right">
      <p className="text-base font-semibold uppercase tracking-[0.16em] text-indigo-200">
        {label || "Event timer"}
      </p>
      <p className="mt-1 text-5xl font-semibold tabular-nums text-white">
        {timerText}
      </p>
    </div>
  );
}

function LeaderboardDisplayRow({ row }: { row: LeaderboardRow }) {
  return (
    <article className="grid grid-cols-[90px_minmax(0,1fr)_140px] items-center gap-4 rounded-lg border border-white/10 bg-white/[0.06] px-5 py-4 shadow-sm">
      <div className="text-4xl font-semibold text-teal-100">#{row.rank}</div>
      <div className="min-w-0">
        <p className="truncate text-4xl font-semibold text-white">
          {row.displayName || row.participant}
        </p>
        <p className="mt-1 text-lg text-slate-300">
          {row.final ? "Final submission" : "Test attempt"}
          {row.submittedAt ? ` · ${formatDateTime(row.submittedAt)}` : ""}
        </p>
      </div>
      <div className="text-right text-5xl font-semibold tabular-nums text-white">
        {Number(row.score).toFixed(1)}%
      </div>
    </article>
  );
}

function formatDisplayTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
