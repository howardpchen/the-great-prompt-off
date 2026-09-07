import { isAllowedWrite, privateResponseHeaders, readLoginBody, takeLoginAttempt } from "@/app/lib/request-security";
import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminSecretConfigured,
  verifyAdminSecret,
} from "@/app/lib/supabase/admin-auth";

export async function POST(request: Request) {
  if (!isAllowedWrite(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: privateResponseHeaders });
  const retry = takeLoginAttempt("admin");
  if (retry) return NextResponse.json({ error: "Too many login attempts. Try again shortly." }, { status: 429, headers: { ...privateResponseHeaders, "Retry-After": String(retry) } });
  const body = await readLoginBody(request);
  const secret = typeof body?.secret === "string" ? body.secret : "";

  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 500, headers: privateResponseHeaders },
    );
  }

  if (!verifyAdminSecret(secret)) {
    return NextResponse.json({ error: "Incorrect admin secret." }, { status: 401, headers: privateResponseHeaders });
  }

  const response = NextResponse.json({ ok: true }, { headers: privateResponseHeaders });
  response.cookies.set(
    adminSessionCookieName,
    createAdminSessionToken(),
    adminSessionCookieOptions(),
  );

  return response;
}
