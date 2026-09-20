"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminAutoRefresh({
  intervalSeconds,
}: {
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoRefreshEnabled = typeof intervalSeconds === "number";

  const refreshNow = useCallback(() => {
    setLastRefreshed(new Date());
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const refreshIfSafe = useCallback(() => {
    if (hasEditableFocus()) {
      return;
    }

    refreshNow();
  }, [refreshNow]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setLastRefreshed(new Date());
    }, 0);

    if (typeof intervalSeconds !== "number") {
      return () => {
        window.clearTimeout(initialTimer);
      };
    }

    const timer = window.setInterval(refreshIfSafe, intervalSeconds * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [intervalSeconds, refreshIfSafe]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 shadow-sm">
      <span>
        {autoRefreshEnabled
          ? `Auto-refresh: ${intervalSeconds}s`
          : "Manual refresh"}
      </span>
      <span aria-hidden="true">|</span>
      <span>
        Last refreshed:{" "}
        {lastRefreshed
          ? lastRefreshed.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })
          : "-"}
      </span>
      <button
        type="button"
        onClick={refreshNow}
        disabled={isPending}
        className="ml-auto h-7 rounded-md border border-slate-300 dark:border-slate-600 px-2 font-semibold text-slate-600 dark:text-slate-300 hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
      >
        {isPending ? "Refreshing..." : "Refresh now"}
      </button>
    </div>
  );
}

function hasEditableFocus() {
  const activeElement = document.activeElement;

  if (!activeElement) {
    return false;
  }

  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement.getAttribute("contenteditable") === "true"
  );
}
