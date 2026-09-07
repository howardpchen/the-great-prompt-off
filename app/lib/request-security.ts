// Same-origin browser writes only; clients must explicitly send Origin as well.
export function isAllowedWrite(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  return origin === expected && request.headers.get("sec-fetch-site") !== "cross-site";
}

// Single-process private rehearsal limit. Intentionally no spoofable IP headers.
// Global quotas cannot be bypassed by rotating access codes, but can cause denial of service.
const windows = new Map<string, { count: number; ends: number }>();
export function takeLoginAttempt(kind: "admin" | "participant", now = Date.now()) {
  const limit = kind === "admin" ? 10 : 100;
  let entry = windows.get(kind);
  if (!entry || now >= entry.ends) {
    entry = { count: 0, ends: now + 60_000 };
    windows.set(kind, entry);
  }
  if (entry.count >= limit) return Math.ceil((entry.ends - now) / 1000);
  entry.count += 1;
  return 0;
}

export const privateResponseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function readLoginBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
