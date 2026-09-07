// An allowlist at the route boundary prevents future evaluator additions leaking hidden cases.
export function finalFeedback(result: {
  score: number; correctFields: number; totalFields: number; reportCount: number;
  feedback?: { validJsonCount?: number; missingFieldsCount?: number; invalidValuesCount?: number };
}) {
  return {
    kind: "final" as const,
    score: result.score,
    correctFields: result.correctFields,
    totalFields: result.totalFields,
    reportCount: result.reportCount,
    validJsonCount: result.feedback?.validJsonCount,
    missingFieldsCount: result.feedback?.missingFieldsCount,
    invalidValuesCount: result.feedback?.invalidValuesCount,
  };
}
