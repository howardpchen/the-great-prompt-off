import { createDatabase } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ChallengeHealthRow = {
  id: string;
  slug: string;
  title: string;
};

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();
  const keepaliveSecret = process.env.KEEPALIVE_SECRET;

  if (keepaliveSecret) {
    const providedSecret = request.headers.get("x-keepalive-secret");
    const bearerToken = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (providedSecret !== keepaliveSecret && bearerToken !== keepaliveSecret) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized health check request.",
          checkedAt,
        },
        { status: 401 },
      );
    }
  }

  try {
    const supabase = createDatabase();
    const { data, error } = await supabase.execute<ChallengeHealthRow>({ table: "challenges", columns: "id, slug, title", limit: 1, single: "maybeSingle", operation: "select", where: [["is_active", "eq", true]], order: [["created_at", { ascending: false }]] });

    if (error) {
      console.warn("Supabase health check failed.");

      return Response.json(
        {
          ok: false,
          source: "supabase",
          error: "Supabase health check failed.",
          checkedAt,
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      source: "supabase",
      checkedAt,
      activeChallenge: data
        ? {
            id: data.id,
            slug: data.slug,
            title: data.title,
          }
        : null,
    });
  } catch {
    console.warn("Supabase health check could not run.");

    return Response.json(
      {
        ok: false,
        source: "supabase",
        error: "Supabase health check could not run.",
        checkedAt,
      },
      { status: 503 },
    );
  }
}
