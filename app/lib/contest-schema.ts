import { isLegacyChallengeMode } from "./challenge-modes";
import type {
  ChallengeFieldDefinition,
  ChallengeModeDefinition,
} from "./challenge-modes";
export function isValidFieldValue(
  value: unknown,
  field: ChallengeFieldDefinition,
): value is string | number | null {
  if (value === null) return field.nullable === true;
  if (field.type === "number")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (field.minimum === undefined || value >= field.minimum) &&
      (field.maximum === undefined || value <= field.maximum)
    );
  return typeof value === "string" && field.allowedValues.includes(value);
}
/** All persisted/client-authored schema definitions cross this bounded validation boundary. */
export function validateContestSchema(input: unknown): ChallengeModeDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Schema must be an object.");
  const s = input as ChallengeModeDefinition;
  const text = (v: unknown, n: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= n;
  if (
    !text(s.id, 80) ||
    !/^[a-z][a-z0-9_]*$/.test(s.id) ||
    !Number.isSafeInteger(s.version) ||
    s.version < 1 ||
    !text(s.title, 160) ||
    !text(s.domain, 80) ||
    (s.description !== undefined && !text(s.description, 4000))
  )
    throw new Error("Invalid schema identity, title, description or version.");
  if (!Array.isArray(s.fields) || s.fields.length < 1 || s.fields.length > 64)
    throw new Error("A schema requires 1–64 fields.");
  const keys = new Map<string, string>();
  if (new Set(s.fields.map((f) => f?.key)).size !== s.fields.length)
    throw new Error("Duplicate field keys.");
  for (const f of s.fields) {
    if (
      !f ||
      !text(f.key, 80) ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(f.key) ||
      !text(f.label, 160) ||
      (f.description !== undefined && !text(f.description, 2000))
    )
      throw new Error("Invalid field key, label or instructions.");
    if (
      f.type !== undefined &&
      !["binary", "multiclass", "number"].includes(f.type)
    )
      throw new Error("Unsupported field type.");
    if (f.nullable !== undefined && typeof f.nullable !== "boolean")
      throw new Error("nullable must be boolean.");
    if (
      f.weight !== undefined &&
      (!Number.isFinite(f.weight) || f.weight <= 0 || f.weight > 100)
    )
      throw new Error("Weight must be positive and at most 100.");
    if (
      f.aliases !== undefined &&
      (!Array.isArray(f.aliases) || f.aliases.length > 20)
    )
      throw new Error("Invalid aliases.");
    for (const key of [f.key, ...(f.aliases || [])]) {
      if (!text(key, 80)) throw new Error("Invalid alias.");
      const token = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        [
          "proto",
          ...Object.getOwnPropertyNames(Object.prototype).map((k) =>
            k.toLowerCase().replace(/[^a-z0-9]/g, ""),
          ),
        ].includes(token) ||
        (keys.has(token) && keys.get(token) !== f.key)
      )
        throw new Error("Duplicate or unsafe normalized field key/alias.");
      keys.set(token, f.key);
    }
    if (!Array.isArray(f.allowedValues))
      throw new Error("allowedValues must be an array (empty for numbers).");
    if (f.type === "number") {
      if (
        f.allowedValues.length ||
        !text(f.unit, 40) ||
        !Number.isFinite(f.tolerance) ||
        f.tolerance! < 0
      )
        throw new Error(
          "Measurements require a unit and nonnegative absolute tolerance, with no labels.",
        );
      for (const bound of [f.minimum, f.maximum])
        if (bound !== undefined && !Number.isFinite(bound))
          throw new Error("Invalid numeric bound.");
      if (
        f.minimum !== undefined &&
        f.maximum !== undefined &&
        f.minimum > f.maximum
      )
        throw new Error("Minimum exceeds maximum.");
    } else {
      if (
        f.allowedValues.length < 2 ||
        f.allowedValues.length > 50 ||
        (f.type === "binary" && f.allowedValues.length !== 2) ||
        f.allowedValues.some((v: unknown) => !text(v, 100)) ||
        new Set(
          f.allowedValues.map((v: string) =>
            v.trim().toLowerCase().replace(/\s+/g, " "),
          ),
        ).size !== f.allowedValues.length
      )
        throw new Error("Invalid classification labels.");
    }
  }
  const normalized = JSON.parse(JSON.stringify(s)) as ChallengeModeDefinition;
  if (!isLegacyChallengeMode(normalized)) {
    normalized.fields = normalized.fields.map(f => ({ ...f, type: f.type ?? "multiclass" }));
  }
  return normalized;
}
