import "server-only";
import type { Database } from "./db/database";
import type { SubmissionProgress, SubmissionProgressEvent } from "./submission-progress-types";

export type SubmissionProgressObserver = (event: SubmissionProgressEvent) => void;

/** Serialize snapshots so delayed writes cannot move progress backwards. */
export function createSubmissionProgress(db: Database, reservationId: string) {
  const progress: SubmissionProgress = {phase:"queued",completedReports:0,totalReports:null,retries:0};
  const reports = new Map<number, "queued" | "processing" | "retrying" | "completed">();
  let writes = Promise.resolve();
  const write = () => db.sql(
    "UPDATE attempt_reservations SET response=jsonb_build_object('progress',$2::jsonb) WHERE id=$1 AND status='pending'",
    [reservationId, JSON.stringify(progress)],
  ).then(()=>{});
  return {
    initialize: write,
    observe(event: SubmissionProgressEvent) {
      if (event.type === "start") progress.totalReports = event.totalReports;
      else if (event.type === "saving") progress.phase = "saving";
      else {
        reports.set(event.reportIndex,event.type);
        if (event.type === "retrying") progress.retries++;
        const states = [...reports.values()];
        progress.completedReports = states.filter(state=>state==="completed").length;
        progress.phase = states.includes("retrying") ? "retrying" : states.includes("processing") ? "processing" : "queued";
      }
      const snapshot = JSON.stringify(progress);
      writes = writes.then(()=>db.sql(
        "UPDATE attempt_reservations SET response=jsonb_build_object('progress',$2::jsonb) WHERE id=$1 AND status='pending'",
        [reservationId,snapshot],
      )).then(()=>{}).catch(()=>{
        // Losing a progress snapshot must not discard a valid evaluation.
        console.error("[submission-progress] Progress update unavailable");
      });
    },
    flush: () => writes,
  };
}
