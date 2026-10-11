import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/db/database";
import { providerQueueSnapshot } from "@/app/lib/provider-concurrency";
import { liveReportSnapshot } from "@/app/lib/provider-telemetry";

export const runtime = "nodejs";

export async function GET(request:Request) {
  try { await requireAdminSession(); }
  catch { return Response.json({error:"Admin session required."},{status:401,headers:{"Cache-Control":"private, no-store"}}); }
  const [active] = await createDatabase().sql<{id:string;schema_version:number}>("SELECT id,schema_version FROM challenges WHERE is_active");
  if (!active || active.id !== request.headers.get("X-Contest-Id") || active.schema_version !== Number(request.headers.get("X-Contest-Version"))) {
    return Response.json({error:"Active contest changed; reload organizer page."},{status:409,headers:{"Cache-Control":"private, no-store"}});
  }
  return Response.json({queue:providerQueueSnapshot(),reports:liveReportSnapshot(active.id),updatedAt:new Date().toISOString()},
    {headers:{"Cache-Control":"private, no-store"}});
}
