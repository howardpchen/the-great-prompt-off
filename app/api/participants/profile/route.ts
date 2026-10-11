import { createDatabase } from "@/app/lib/db/database";
import { verifyParticipantSessionToken } from "@/app/lib/supabase/participant-session-token";
import { isAllowedWrite, privateResponseHeaders, readLoginBody } from "@/app/lib/request-security";

const respond = (body: unknown, status = 200) => Response.json(body, {status, headers: privateResponseHeaders});
async function profile(request: Request, update: boolean) {
  if (update && !isAllowedWrite(request)) return respond({error:"Same-origin request required."},403);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "";
  const session = verifyParticipantSessionToken(token);
  if (!session) return respond({error:"Please sign in again to manage your display name."},401);
  let name: string | undefined;
  if (update) {
    const body = await readLoginBody(request);
    if (!body || Object.keys(body).some(key=>key!=="displayName") || typeof body.displayName!=="string") return respond({error:"Provide only a display name."},400);
    name=body.displayName.trim();
    if (!name || name.length>80 || /[\p{Cc}\p{Cf}]/u.test(name)) return respond({error:"Use 1–80 characters, without control characters."},400);
  }
  try {
    const db=createDatabase();
    const [row]=await db.sql<{participant_code:string;display_name:string|null}>(update
      ? "UPDATE participants SET display_name=$2 WHERE participant_code=$1 AND is_active RETURNING participant_code,display_name"
      : "SELECT participant_code,display_name FROM participants WHERE participant_code=$1 AND is_active",update?[session.participantCode,name]:[session.participantCode]);
    if (!row) return respond({error:"This participant is unavailable. Please contact the organizer."},401);
    return respond({participantCode:row.participant_code,displayName:row.display_name});
  } catch { return respond({error:"Could not save or load your display name. Please try again."},503); }
}
export const GET=(request:Request)=>profile(request,false);
export const PATCH=(request:Request)=>profile(request,true);
