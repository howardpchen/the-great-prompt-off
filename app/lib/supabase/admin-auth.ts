import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { readAuthSecret } from "../auth-secret";
import { validSessionIssuedAt } from "../session-expiry";
import { cookies } from "next/headers";

export const adminSessionCookieName = "great-prompt-off-admin-session";

const adminSessionMaxAgeSeconds = 60 * 60 * 8;

function getAdminSecret() {
  return readAuthSecret("ADMIN_SECRET");
}

function sign(value: string) {
  return createHmac("sha256", getAdminSecret()).update(value).digest("base64url");
}

export function isAdminSecretConfigured() {
  try { return getAdminSecret().length >= 32; } catch { return false; }
}

export function verifyAdminSecret(candidate: string) {
  const adminSecret = getAdminSecret();

  if (!adminSecret || !candidate) {
    return false;
  }

  const candidateBytes = Buffer.from(candidate);
  const secretBytes = Buffer.from(adminSecret);

  return (
    candidateBytes.length === secretBytes.length &&
    timingSafeEqual(candidateBytes, secretBytes)
  );
}

export function createAdminSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", iat: Math.floor(Date.now() / 1000) }),
    "utf8",
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string) {
  if (!isAdminSecretConfigured()) {
    return false;
  }

  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra !== undefined || token.length > 2048) {
    return false;
  }

  const expectedSignature = sign(payload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (signatureBytes.length !== expectedBytes.length || !timingSafeEqual(signatureBytes, expectedBytes)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded?.role === "admin" && validSessionIssuedAt(decoded.iat);
  } catch { return false; }
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value || "";

  return verifyAdminSessionToken(token);
}

export async function requireAdminSession() {
  if (!(await hasAdminSession())) {
    throw new Error("Admin session required.");
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: adminSessionMaxAgeSeconds,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
