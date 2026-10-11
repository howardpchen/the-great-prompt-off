export type SubmissionProgress = {
  phase: "queued" | "processing" | "retrying" | "saving";
  completedReports: number;
  totalReports: number | null;
  retries: number;
};

export type SubmissionProgressEvent =
  | { type: "start"; totalReports: number }
  | { type: "saving" }
  | { type: "queued" | "processing" | "retrying" | "completed"; reportIndex: number };

export type PublicSubmissionReceipt<T = unknown> = {
  state: SubmissionProgress["phase"] | "completed" | "failed" | "stalled";
  progress?: SubmissionProgress;
  result?: T;
  instructions?: string;
  error?: string;
};

export function submissionProgressMessage(receipt: PublicSubmissionReceipt): string {
  const progress = receipt.progress;
  const count = progress?.totalReports
    ? ` ${progress.completedReports} of ${progress.totalReports} reports complete.` : "";
  if (receipt.state === "retrying") return `The evaluation service is temporarily unavailable. Retrying automatically.${count} Please wait—no need to submit again.`;
  if (receipt.state === "saving") return "Evaluation complete. Saving your result…";
  if (receipt.state === "processing") return `Evaluating your test submission.${count} Please wait; your result will appear here automatically.`;
  return "Your test submission is queued. Please wait; it will run automatically and your result will appear here. You do not need to submit again.";
}
