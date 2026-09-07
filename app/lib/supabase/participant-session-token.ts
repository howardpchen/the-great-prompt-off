import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { readAuthSecret } from "../auth-secret";
import { validSessionIssuedAt } from "../session-expiry";
import { normalizeParticipantCode } from "../participant-codes";

type ParticipantSessionPayload = {
  participantCode: string;
  iat: number;
};

function getParticipantSessionSecret() {
  const secret = readAuthSecret("PARTICIPANT_SESSION_SECRET");
  if (secret === readAuthSecret("ADMIN_SECRET")) throw new Error("Authentication secrets must be independent.");
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getParticipantSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createParticipantSessionToken(participantCode: string) {
  const payload: ParticipantSessionPayload = {
    participantCode: normalizeParticipantCode(participantCode),
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyParticipantSessionToken(token: string) {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined || token.length > 2048) {
    return null;
  }

  let expectedSignature: string;
  try { expectedSignature = sign(encodedPayload); } catch { return null; }
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<ParticipantSessionPayload>;
    if (!payload || typeof payload.participantCode !== "string" || !validSessionIssuedAt(payload.iat)) return null;
    const participantCode = normalizeParticipantCode(payload.participantCode);

    return participantCode ? { participantCode } : null;
  } catch {
    return null;
  }
}
