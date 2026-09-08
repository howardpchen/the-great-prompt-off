import { validateContestSchema, isValidFieldValue } from "./contest-schema";
import {
  challengeModes,
  defaultChallengeMode,
  type ChallengeModeDefinition,
} from "./challenge-modes";

export type AnswerValue = string | number | null;
export type OutputSchema = {
  type: "object";
  required: readonly string[];
  additionalProperties: false;
  properties: Record<
    string,
    {
      type: string | string[];
      enum?: readonly (string | null)[];
      minimum?: number;
      maximum?: number;
      description?: string;
    }
  >;
};
export function buildOutputSchema(
  mode: ChallengeModeDefinition = defaultChallengeMode,
): OutputSchema {
  return {
    type: "object",
    required: mode.fields.map((f) => f.key),
    additionalProperties: false,
    properties: Object.fromEntries(
      mode.fields.map((f) => [
        f.key,
        f.type === "number"
          ? {
              type: f.nullable ? ["number", "null"] : "number",
              minimum: f.minimum,
              maximum: f.maximum,
              description: `${f.description || f.label}; unit: ${f.unit}; tolerance: ${f.tolerance}`,
            }
          : {
              type: f.nullable ? ["string", "null"] : "string",
              enum: f.nullable
                ? [...f.allowedValues, null]
                : [...f.allowedValues],
              ...(f.description ? { description: f.description } : {}),
            },
      ]),
    ),
  };
}

export function resolveChallengeMode(
  modeId?: string | null,
  schemaVersion?: number | null,
  snapshot?: unknown,
): ChallengeModeDefinition {
  if (snapshot != null) {
    const stored = validateContestSchema(snapshot);
    if (stored.id !== modeId || stored.version !== schemaVersion)
      throw new Error("Contest schema identity mismatch.");
    return stored;
  }
  const mode = modeId
    ? Object.values(challengeModes).find((candidate) => candidate.id === modeId)
    : defaultChallengeMode;

  if (!mode) {
    throw new Error(`Unsupported challenge mode: ${modeId}`);
  }

  if (schemaVersion != null && schemaVersion !== mode.version) {
    throw new Error(
      `Unsupported schema version ${schemaVersion} for challenge mode ${mode.id}.`,
    );
  }

  return mode;
}

export function createSchemaSnapshot(mode: ChallengeModeDefinition) {
  return {
    id: mode.id,
    version: mode.version,
    title: mode.title,
    description: mode.description,
    domain: mode.domain,
    fields: mode.fields.map((field) => ({
      ...field,
      key: field.key,
      label: field.label,
      description: field.description,
      allowedValues: [...field.allowedValues],
      aliases: field.aliases ? [...field.aliases] : undefined,
    })),
  };
}

export function createRunSchemaMetadata(mode: ChallengeModeDefinition) {
  return {
    mode_id: mode.id,
    schema_version: mode.version,
    schema_snapshot: createSchemaSnapshot(mode),
  };
}

export function buildScoredValues(
  perField: readonly {
    field: string;
    actual: AnswerValue;
    missing?: boolean;
    invalid?: boolean;
  }[],
): Record<string, AnswerValue> {
  return perField.reduce<Record<string, AnswerValue>>((values, field) => {
    if (
      field.actual !== null ||
      (field.missing === false && field.invalid === false)
    ) {
      values[field.field] = field.actual;
    }

    return values;
  }, {});
}

export function buildAnswerKeyStoragePayload(
  answerValues: Record<string, unknown>,
  mode: ChallengeModeDefinition = defaultChallengeMode,
) {
  const validated = validateAnswerValues(answerValues, mode);
  const payload: Record<string, unknown> = {
    answer_values: validated,
  };

  if (mode.id === defaultChallengeMode.id) {
    Object.assign(payload, validated);
  }

  return payload;
}

export function buildVersionedAnswerKeyStoragePayload(
  answerValues: Record<string, unknown>,
  mode: ChallengeModeDefinition = defaultChallengeMode,
) {
  return {
    mode_id: mode.id,
    schema_version: mode.version,
    provenance: mode.id === defaultChallengeMode.id ? "legacy" : "unknown",
    ...buildAnswerKeyStoragePayload(answerValues, mode),
  };
}

export function canUseLegacySixFieldAnswerKey(mode: ChallengeModeDefinition) {
  return (
    mode.id === defaultChallengeMode.id &&
    mode.version === defaultChallengeMode.version
  );
}

export function validateAnswerValues(
  value: unknown,
  mode: ChallengeModeDefinition,
): Record<string, AnswerValue> {
  if (!isPlainObject(value)) {
    throw new Error(`Answer values for ${mode.id} must be a JSON object.`);
  }

  const expectedKeys = new Set(mode.fields.map((field) => field.key));
  const actualKeys = Object.keys(value);
  const unexpectedKeys = actualKeys.filter((key) => !expectedKeys.has(key));
  const missingKeys = mode.fields
    .map((field) => field.key)
    .filter((key) => !Object.hasOwn(value, key));

  if (unexpectedKeys.length > 0 || missingKeys.length > 0) {
    throw new Error(
      `Answer values for ${mode.id} do not match its schema fields.`,
    );
  }

  const validated: Record<string, AnswerValue> = {};

  for (const field of mode.fields) {
    const fieldValue = value[field.key];

    if (!isValidFieldValue(fieldValue, field)) {
      throw new Error(
        `Answer value for ${field.key} is invalid for challenge mode ${mode.id}.`,
      );
    }

    validated[field.key] = fieldValue;
  }

  return validated;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
