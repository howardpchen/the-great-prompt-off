/** HTTP callers must supply a concrete database UUID, never a truthy fallback. */
export function isContestId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
