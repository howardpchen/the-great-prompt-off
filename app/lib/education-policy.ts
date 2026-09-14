/** Pure policy shared by admission and participant projections. Legacy is opt-out. */
export function isEducationContest(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const education = (schema as {education?: {version?: unknown}}).education;
  return education?.version === 1;
}
export function hideEducationFinal(schema: unknown, phase: string): boolean {
  return isEducationContest(schema) && phase !== 'ended';
}
export function projectFinalResponse<T extends {kind: string}>(response: T, schema: unknown, phase: string): T {
  if (response.kind !== 'final' || !hideEducationFinal(schema, phase)) return response;
  // Never persist this projection: replay after reveal must use the original result.
  return {...response, finalScore: null, score: null, correctFields: null,
    totalFields: null, reportCount: null, summary: null, feedback: undefined,
    resultsHidden: true};
}
