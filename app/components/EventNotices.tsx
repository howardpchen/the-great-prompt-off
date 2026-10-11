"use client";

import { useState } from "react";

// The caller keys this by contest, participant and message: polling the same
// announcement does not reopen it; a changed announcement gets a fresh notice.
export function AnnouncementNotification({ announcement }: { announcement: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <aside aria-label="New organizer announcement" className="fixed inset-x-3 bottom-3 z-40 max-h-[45dvh] overflow-y-auto rounded-xl border-2 border-cyan-500 bg-white p-4 text-slate-950 shadow-2xl dark:border-cyan-400 dark:bg-slate-900 dark:text-slate-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96">
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-bold text-cyan-800 dark:text-cyan-300">New organizer announcement</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-base leading-6">{announcement}</p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="mt-3 min-h-11 rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">Got it</button>
    </aside>
  );
}
