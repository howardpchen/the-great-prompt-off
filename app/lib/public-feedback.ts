export type ClinicalComparison = {
  report: string;
  fields: Array<{ field: string; expected: string | number | null; actual: string | number | null; noDecision: boolean; correct: boolean }>;
};

// Canonical public report order, independent of filenames or completion order.
export function comparisonForReport(comparisons: ClinicalComparison[], report: {id: string; filename?: string}) {
  return comparisons.find(item => item.report === report.id)
    ?? (report.filename ? comparisons.find(item => item.report === report.filename) : undefined);
}
export function feedbackRowId(report: string, field: string) {
  return `public-feedback-${encodeURIComponent(report)}-${encodeURIComponent(field)}`;
}
