import {withActiveContest} from "@/app/lib/db/admin-contest-fence";
import { requireAdminSession } from "@/app/lib/supabase/admin-auth";
import { updateParticipantIdentity } from "@/app/lib/supabase/admin-dashboard";

const maxDisplayNameLength = 80;
const maxEmailLength = 254;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function scopedPost(request: Request) {
  try {
    await requireAdminSession();
    const body = (await request.json().catch(() => null)) as {
      displayName?: unknown;
      email?: unknown;
      participantCode?: unknown;
    } | null;
    const participantCode =
      typeof body?.participantCode === "string" ? body.participantCode.trim() : "";
    const displayName = normalizeOptionalString(body?.displayName);
    const email = normalizeOptionalString(body?.email);

    if (!participantCode) {
      return Response.json(
        { error: "participantCode is required." },
        { status: 400 },
      );
    }

    if (displayName && displayName.length > maxDisplayNameLength) {
      return Response.json(
        { error: `Display name must be ${maxDisplayNameLength} characters or fewer.` },
        { status: 400 },
      );
    }

    if (email && email.length > maxEmailLength) {
      return Response.json(
        { error: `Email must be ${maxEmailLength} characters or fewer.` },
        { status: 400 },
      );
    }

    if (email && !emailPattern.test(email)) {
      return Response.json(
        { error: "Email must be blank or a valid email address." },
        { status: 400 },
      );
    }

    await updateParticipantIdentity({
      participantCode,
      displayName,
      email,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Identity update failed." },
      { status: 401 },
    );
  }
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

export const POST = (request: Request) => withActiveContest(request, scopedPost);
