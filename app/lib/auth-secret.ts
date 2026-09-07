import "server-only";
import { readFileSync } from "node:fs";

export function readAuthSecret(name: "ADMIN_SECRET" | "PARTICIPANT_SESSION_SECRET") {
  const direct = process.env[name];
  const file = process.env[`${name}_FILE`];
  if (direct && file) throw new Error(`${name}: configure one secret source only.`);
  const value = file ? readFileSync(file, "utf8").trimEnd() : direct || "";
  if (Buffer.byteLength(value) < 32) throw new Error(`${name}: at least 32 bytes required.`);
  return value;
}
