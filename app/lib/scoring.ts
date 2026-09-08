import { isValidFieldValue } from "./contest-schema";
import {
  defaultChallengeMode,
  isLegacyChallengeMode,
  type ChallengeFieldDefinition,
  type ChallengeModeDefinition,
} from "./challenge-modes";
import type {
  AnswerKey,
  InvalidFieldResult,
  SchemaFieldScoreResult,
  SchemaScoringResult,
  ScoringDiagnostics,
  ScoringResult,
} from "./types";

type ModelOutputObject = Record<string, unknown>;

type ParsedModelOutput = {
  diagnostics: ScoringDiagnostics;
  output: ModelOutputObject | null;
};

const nestedReportKeys = new Set([
  "report",
  "report1",
  "report_1",
  "findings",
  "result",
  "results",
]);

export function scoreModelOutput(
  modelOutput: ModelOutputObject | string,
  answerKey: AnswerKey,
): ScoringResult;
export function scoreModelOutput(
  modelOutput: ModelOutputObject | string,
  answerKey: Record<string, string | number | null>,
  mode: ChallengeModeDefinition,
): SchemaScoringResult;
export function scoreModelOutput(
  modelOutput: ModelOutputObject | string,
  answerKey: Record<string, string | number | null>,
  mode: ChallengeModeDefinition = defaultChallengeMode,
): ScoringResult | SchemaScoringResult {
  const schema = createSchemaRuntime(mode);
  const parsed = parseModelOutput(modelOutput);

  if (!parsed.output) {
    return buildInvalidJsonResult(answerKey, parsed.diagnostics, schema.fields);
  }

  const normalized = normalizeOutputObject(
    parsed.output,
    parsed.diagnostics,
    schema,
  );
  const output = normalized.output;
  const missingFields: string[] = [];
  const invalidFields: InvalidFieldResult[] = [];

  const perField = schema.fields.map<SchemaFieldScoreResult>((field) => {
    const rawValue = output[field.key];
    const missing = rawValue === undefined;
    const invalid = !missing && !isAllowedValue(rawValue, field);
    const actual = isAllowedValue(rawValue, field) ? rawValue : null;

    if (missing) {
      missingFields.push(field.key);
    }

    if (invalid) {
      invalidFields.push({ field: field.key, value: rawValue });
    }

    return {
      field: field.key,
      expected: answerKey[field.key],
      actual,
      weight: field.weight ?? 1,
      correct:
        !missing &&
        !invalid &&
        (typeof actual === "number" && typeof answerKey[field.key] === "number"
          ? Math.abs(actual - (answerKey[field.key] as number)) <=
            (field.tolerance ?? 0) +
              Number.EPSILON *
                Math.max(
                  1,
                  Math.abs(actual),
                  Math.abs(answerKey[field.key] as number),
                ) *
                4
          : actual === answerKey[field.key]),
      missing,
      invalid,
    };
  });

  return buildScoringResult({
    diagnostics: normalized.diagnostics,
    invalidFields,
    missingFields,
    perField,
    validJson: true,
    fieldCount: schema.fields.length,
  });
}

function parseModelOutput(
  modelOutput: ModelOutputObject | string,
): ParsedModelOutput {
  const baseDiagnostics: ScoringDiagnostics = {
    strict_json_valid: false,
    recovered_json_used: false,
    nested_object_used: false,
    normalization_used: false,
    key_normalization_used: false,
    value_normalization_used: false,
    ignored_outer_key: null,
    ignored_extra_fields: [],
  };

  if (typeof modelOutput !== "string") {
    return {
      diagnostics: {
        ...baseDiagnostics,
        strict_json_valid: isPlainObject(modelOutput),
      },
      output: isPlainObject(modelOutput) ? modelOutput : null,
    };
  }

  const strict = parseJson(modelOutput);
  const strictJsonWasValid = strict.ok;

  if (strict.ok) {
    if (isPlainObject(strict.value)) {
      return {
        diagnostics: { ...baseDiagnostics, strict_json_valid: true },
        output: strict.value,
      };
    }

    if (isSingleObjectArray(strict.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: true,
          recovered_json_used: true,
        },
        output: strict.value[0],
      };
    }
  }

  const candidates = [
    stripMarkdownFence(modelOutput),
    extractFirstJsonObject(modelOutput),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const recovered = parseJson(candidate);

    if (!recovered.ok) {
      continue;
    }

    if (isPlainObject(recovered.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: false,
          recovered_json_used: true,
        },
        output: recovered.value,
      };
    }

    if (isSingleObjectArray(recovered.value)) {
      return {
        diagnostics: {
          ...baseDiagnostics,
          strict_json_valid: false,
          recovered_json_used: true,
        },
        output: recovered.value[0],
      };
    }
  }

  return {
    diagnostics: {
      ...baseDiagnostics,
      strict_json_valid: strictJsonWasValid,
    },
    output: null,
  };
}

type SchemaRuntime = {
  legacy: boolean;
  fields: readonly ChallengeFieldDefinition[];
  keyMap: Map<string, string>;
};

function createSchemaRuntime(mode: ChallengeModeDefinition): SchemaRuntime {
  const keyMap = new Map<string, string>();

  for (const field of mode.fields) {
    keyMap.set(normalizeKeyToken(field.key), field.key);

    for (const alias of field.aliases ?? []) {
      keyMap.set(normalizeKeyToken(alias), field.key);
    }
  }

  return { fields: mode.fields, keyMap, legacy: isLegacyChallengeMode(mode) };
}

function normalizeOutputObject(
  output: ModelOutputObject,
  diagnostics: ScoringDiagnostics,
  schema: SchemaRuntime,
) {
  const unwrapped = unwrapNestedSingleReport(output);
  const sourceOutput = unwrapped.output;
  const normalized: ModelOutputObject = Object.create(null);
  const ignoredExtraFields: string[] = [];
  let normalizationUsed = diagnostics.normalization_used;
  let keyNormalizationUsed = diagnostics.key_normalization_used;
  let valueNormalizationUsed = diagnostics.value_normalization_used;

  Object.entries(sourceOutput).forEach(([rawField, rawValue]) => {
    const field = normalizeField(rawField, schema);

    if (!field) {
      ignoredExtraFields.push(rawField);
      return;
    }

    if (field !== rawField) {
      normalizationUsed = true;
      keyNormalizationUsed = true;
    }

    if (normalized[field] !== undefined) {
      ignoredExtraFields.push(rawField);
      return;
    }

    const normalizedValue = normalizeValue(rawValue, field, schema);

    if (normalizedValue !== rawValue) {
      normalizationUsed = true;
      valueNormalizationUsed = true;
    }

    normalized[field] = normalizedValue;
  });

  return {
    diagnostics: {
      ...diagnostics,
      nested_object_used: diagnostics.nested_object_used || unwrapped.used,
      normalization_used: normalizationUsed,
      key_normalization_used: keyNormalizationUsed,
      value_normalization_used: valueNormalizationUsed,
      ignored_outer_key:
        unwrapped.ignoredOuterKey ?? diagnostics.ignored_outer_key,
      ignored_extra_fields: ignoredExtraFields,
    },
    output: normalized,
  };
}

function normalizeField(field: string, schema: SchemaRuntime): string | null {
  const normalized = normalizeKeyToken(field);

  return schema.keyMap.get(normalized) ?? null;
}

function normalizeValue(value: unknown, field: string, schema: SchemaRuntime) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = normalizeValueText(value);
  const fieldDefinition = schema.fields.find((item) => item.key === field);

  if (!schema.legacy) return value;
  if (fieldDefinition?.allowedValues.includes(normalized)) {
    return normalized;
  }

  // Structural recovery and field-name aliases are allowed, but value scoring is
  // intentionally strict: clinical phrases are invalid unless the model returns
  // one of the exact controlled labels after trim/lowercase cleanup.
  void field;
  return value;
}

function normalizeKeyToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeValueText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unwrapNestedSingleReport(output: ModelOutputObject) {
  // Manual fixture this should recover:
  // { "report_1": { "ACL_intact_or_torn": "intact", ... } }
  // Multi-report objects are left alone because each scoring call is for one report.
  const entries = Object.entries(output);

  if (entries.length !== 1) {
    return { ignoredOuterKey: null, output, used: false };
  }

  const [outerKey, innerValue] = entries[0];

  if (
    !nestedReportKeys.has(outerKey.trim().toLowerCase()) ||
    !isPlainObject(innerValue)
  ) {
    return { ignoredOuterKey: null, output, used: false };
  }

  return {
    ignoredOuterKey: outerKey,
    output: innerValue,
    used: true,
  };
}

function parseJson(
  value: string,
): { ok: true; value: unknown } | { ok: false; value: null } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function stripMarkdownFence(value: string) {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  return match?.[1]?.trim() ?? "";
}

function extractFirstJsonObject(value: string) {
  const start = value.indexOf("{");

  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return "";
}

function buildInvalidJsonResult(
  answerKey: Record<string, string | number | null>,
  diagnostics: ScoringDiagnostics,
  fields: readonly ChallengeFieldDefinition[],
): SchemaScoringResult {
  const perField = fields.map<SchemaFieldScoreResult>((field) => ({
    field: field.key,
    expected: answerKey[field.key],
    actual: null,
    correct: false,
    missing: true,
    invalid: false,
  }));

  return buildScoringResult({
    diagnostics,
    validJson: false,
    perField,
    missingFields: fields.map((field) => field.key),
    invalidFields: [],
    fieldCount: fields.length,
  });
}

function buildScoringResult({
  diagnostics,
  invalidFields,
  missingFields,
  perField,
  validJson,
  fieldCount,
}: {
  diagnostics: ScoringDiagnostics;
  invalidFields: InvalidFieldResult[];
  missingFields: string[];
  perField: SchemaFieldScoreResult[];
  validJson: boolean;
  fieldCount: number;
}): SchemaScoringResult {
  const correct = perField.filter((result) => result.correct).length;
  const totalWeight = perField.reduce((sum, f) => sum + (f.weight ?? 1), 0);
  const earnedWeight = perField.reduce(
    (sum, f) => sum + (f.correct ? (f.weight ?? 1) : 0),
    0,
  );
  const fieldAccuracy = fieldCount === 0 ? 0 : (correct / fieldCount) * 100;

  return {
    valid_json: validJson,
    per_field: perField,
    missing_fields: missingFields,
    invalid_fields: invalidFields,
    field_accuracy: fieldAccuracy,
    overall_score:
      validJson && totalWeight ? (100 * earnedWeight) / totalWeight : 0,
    diagnostics,
  };
}

function isAllowedValue(
  value: unknown,
  field: ChallengeFieldDefinition,
): value is string | number | null {
  return isValidFieldValue(value, field);
}

function isPlainObject(value: unknown): value is ModelOutputObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSingleObjectArray(value: unknown): value is [ModelOutputObject] {
  return Array.isArray(value) && value.length === 1 && isPlainObject(value[0]);
}
