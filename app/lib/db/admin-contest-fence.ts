import "server-only";
import { createDatabase,transactionContext } from "./database";
import { requireAdminSession } from "../supabase/admin-auth";
/** Legacy active-console actions remain active-only, but never silently retarget a stale form. */
export async function withActiveContest(request: Request, handler: (request: Request) => Promise<Response>) {
  try {await requireAdminSession();} catch {return Response.json({error:'Admin session required.'},{status:401});}
  const id=request.headers.get('X-Contest-Id'); const version=Number(request.headers.get('X-Contest-Version'));
  if(!id || !Number.isInteger(version) || version<1) return Response.json({error:'Contest context required; reload organizer page.'},{status:409});
  try { return await createDatabase().transaction(async tx=>{
    await tx.sql('SELECT pg_advisory_xact_lock(718204,1)');
    const [active]=await tx.sql<{id:string;schema_version:number}>('SELECT id,schema_version FROM challenges WHERE is_active');
    if(!active || active.id!==id || active.schema_version!==version) return Response.json({error:'Active contest changed; reload before saving.'},{status:409});
    const response=await transactionContext.run(tx,()=>handler(request));
    if (!response.ok) throw new RejectedResponse(response);
    return response;
  }); } catch(error) {
    if(error instanceof RejectedResponse) return error.response;
    return Response.json({error:"Organizer update failed; no changes committed."},{status:500});
  }
}
class RejectedResponse { constructor(readonly response:Response) {} }
