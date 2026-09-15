import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { createDatabase } from "@/app/lib/db/database";
import { listContests, mutateContestLibrary } from "@/app/lib/db/contest-library";
export async function GET() {
  try { await requireAdminSession(); } catch { return Response.json({error:'Admin session required.'},{status:401}); }
  return Response.json({contests:await listContests(createDatabase())});
}
export async function POST(request: Request) {
  try { await requireAdminSession(); } catch { return Response.json({error:'Admin session required.'},{status:401}); }
  const text=await request.text();
  if(text.length>2000000) return Response.json({error:'Request too large.'},{status:413});
  try { return Response.json(await mutateContestLibrary(createDatabase(),JSON.parse(text))); }
  catch(e) { return Response.json({error:e instanceof Error?e.message:'Invalid request.'},{status:400}); }
}
