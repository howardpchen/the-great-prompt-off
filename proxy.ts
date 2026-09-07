import { NextResponse, type NextRequest } from "next/server";
import { isAllowedWrite, privateResponseHeaders } from "./app/lib/request-security";

export function proxy(request: NextRequest) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !isAllowedWrite(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: privateResponseHeaders });
  }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(privateResponseHeaders)) response.headers.set(name, value);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
export const config = { matcher: ["/api/:path*", "/admin/:path*"] };
