export const sessionMaxAgeSeconds = 8 * 60 * 60;
export function validSessionIssuedAt(iat: unknown, now = Math.floor(Date.now() / 1000)) {
  return typeof iat === "number" && Number.isSafeInteger(iat) && iat > 0 && iat <= now && now - iat < sessionMaxAgeSeconds;
}
