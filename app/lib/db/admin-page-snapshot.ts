import "server-only";
import { createDatabase, transactionContext } from "./database";
import { requireAdminSession } from "../supabase/admin-auth";

export type AdminContestContext = { id: string; schema_version: number } | null;

/** Resolve the frame and every subordinate read from one MVCC snapshot.
 * No lock is held while React renders; a subsequent activation makes the old
 * frame's mutation fence stale, rather than relabelling its data.
 */
export async function readAdminPageSnapshot<T>(load: (context: AdminContestContext) => Promise<T>) {
  return createDatabase().transaction(async (tx) => {
    await tx.sql("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return transactionContext.run(tx, async () => {
      const [active] = await tx.sql<NonNullable<AdminContestContext>>(
        "SELECT id,schema_version FROM challenges WHERE is_active",
      );
      return { contestContext: active ?? null, data: await load(active ?? null) };
    });
  });
}

/** Async console reads must not replace an A frame's content with B data.
 * Headerless read-only API consumers retain their existing behavior.
 */
export async function withAdminReadContext(request: Request, load: (request: Request) => Promise<Response>) {
  try { await requireAdminSession(); } catch {
    return Response.json({ error: "Admin session required." }, { status: 401 });
  }
  const snapshot = await readAdminPageSnapshot(async (active) => {
    if (request.headers.has("X-Contest-Id") &&
      (!active || active.id !== request.headers.get("X-Contest-Id") ||
        active.schema_version !== Number(request.headers.get("X-Contest-Version")))) {
      return Response.json({ error: "Active contest changed; reload organizer page." }, { status: 409 });
    }
    return load(request);
  });
  return snapshot.data;
}
