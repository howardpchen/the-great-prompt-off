import {
  challengeModes,
  defaultChallengeMode,
  isChallengeModeActivationAllowed,
  type ChallengeModeDefinition,
} from "../challenge-modes";
import {
  buildOutputSchema,
  resolveChallengeMode,
  validateAnswerValues,
} from "../schema-storage";

export const CHALLENGE_MODE_ERROR = "That challenge mode is not available for activation.";
export const SCHEMA_VERSION_ERROR =
  "That schema version is not supported for the selected challenge mode.";
export const MISSING_ANSWER_KEYS_ERROR =
  "One or more public or private reports are missing answer keys for this mode.";
export const MISSING_SCHEMA_VALUES_ERROR =
  "One or more answer keys do not contain values for the selected schema.";
export const ANSWER_KEY_FIELDS_ERROR =
  "An answer key does not contain exactly the fields required by the selected schema.";
export const ANSWER_KEY_VALUE_ERROR =
  "An answer key contains a value that is not allowed for the selected schema.";
export const EXISTING_ANSWER_KEY_ERROR =
  "One or more answer keys already exist for this mode and schema version. Enable overwrite to replace them.";
export const STAGING_PROVENANCE_ERROR =
  "One or more answer keys for the selected mode are staging/demo only.";
export const UNSUPPORTED_PROVENANCE_ERROR =
  "One or more answer keys for the selected mode have unknown or unsupported provenance.";
export const CLINICAL_READINESS_ERROR =
  "The selected mode has structurally valid answer keys, but they are not marked as clinician-adjudicated.";
export const answerKeyProvenanceValues = [
  "legacy",
  "staging_demo",
  "clinician_adjudicated",
  "imported",
  "unknown",
] as const;

export type AnswerKeyProvenance = (typeof answerKeyProvenanceValues)[number];
export type AnswerKeyProvenanceCounts = Record<AnswerKeyProvenance, number>;

export type AnswerKeyActivationProvenanceResult = {
  ok: boolean;
  compatibleCount: number;
  requiredCount: number;
  provenanceCounts: AnswerKeyProvenanceCounts;
  error: string | null;
};

export type AnswerKeyImportMetadata = {
  provenance: AnswerKeyProvenance;
  import_batch_id: string;
  adjudicated_by: string | null;
  adjudicated_at: string | null;
  notes: string | null;
};

export type AdminChallengeSchemaMetadata = {
  modeId: string;
  schemaVersion: number;
  outputSchema: ReturnType<typeof buildOutputSchema>;
};

type ReportRow = {
  id: string;
  split: "public" | "private";
  filename?: string | null;
  external_id?: string | null;
};

export type AdminSchemaReportRow = ReportRow;

export type AdminSchemaAnswerKeyRow = {
  report_id: string;
  mode_id?: string | null;
  schema_version?: number | null;
  provenance?: string | null;
  answer_values: unknown;
  acl_tear: unknown;
  mcl_injury: unknown;
  meniscus_tear: unknown;
  fracture: unknown;
  osteoarthritis: unknown;
  effusion: unknown;
};

export type ChallengeSchemaValidationIssue = {
  type:
    | "missing_answer_key"
    | "duplicate_answer_key"
    | "missing_schema_values"
    | "invalid_fields"
    | "invalid_values";
  count: number;
  message: string;
};

export type ChallengeSchemaValidationResult = {
  ok: boolean;
  modeId: string;
  schemaVersion: number;
  reportCounts: { public: number; private: number };
  issues: ChallengeSchemaValidationIssue[];
};

export type AdminModeReadiness = {
  modeId: string;
  title: string;
  schemaVersion: number;
  fieldCount: number;
  activationStatus: "active" | "allowlisted" | "dormant";
  publicReportCount: number;
  privateReportCount: number;
  answerKeyCoverageCount: number;
  missingAnswerKeyCount: number;
  validationPasses: boolean;
  clinicallyReady: boolean;
  provenanceCounts: AnswerKeyProvenanceCounts;
  statusMessage:
    | "Active mode"
    | "Ready for activation"
    | "Missing answer keys"
    | "Validation failed"
    | "Structurally valid / staging data only"
    | "Structurally valid / clinician review incomplete"
    | "Dormant / not allowlisted";
  issues: ChallengeSchemaValidationIssue[];
  provenanceNotice: string | null;
};

export type AdminChallengeSchemaPreflight = {
  ok: true;
  modeId: string;
  schemaVersion: number;
  structurallyReady: boolean;
  clinicallyReady: boolean;
  allowlisted: boolean;
  locked: boolean;
  activatableIfAllowlisted: boolean;
  messages: string[];
  reportCounts: { public: number; private: number };
  coverage: { answerKeys: number; missing: number };
  provenanceCounts: AnswerKeyProvenanceCounts;
};

export type AnswerKeyImportIssue = {
  type:
    | "unknown_report"
    | "duplicate_report"
    | "invalid_item"
    | "invalid_fields"
    | "invalid_values"
    | "missing_report_entry"
    | "existing_answer_key";
  count: number;
  message: string;
};

export type AnswerKeyImportValidationResult = {
  ok: boolean;
  modeId: string;
  schemaVersion: number;
  reportCounts: { public: number; private: number };
  itemCount: number;
  validItemCount: number;
  issues: AnswerKeyImportIssue[];
};

export type AnswerKeyImportWriteRow = {
  report_id: string;
  mode_id: string;
  schema_version: number;
  answer_values: Record<string, string | number | null>;
  provenance: AnswerKeyProvenance;
  import_batch_id: string;
  adjudicated_by: string | null;
  adjudicated_at: string | null;
  notes: string | null;
};

export type AnswerKeyImportPreparation = {
  validation: AnswerKeyImportValidationResult;
  rows: AnswerKeyImportWriteRow[];
};

export type AnswerKeyImportWritePlan = {
  blocked: boolean;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
};

export type AnswerKeyImportWriteOperations = {
  insert: (rows: readonly AnswerKeyImportWriteRow[]) => Promise<void>;
  upsert: (rows: readonly AnswerKeyImportWriteRow[]) => Promise<void>;
};

export function getChallengeModeForValidation(
  modeId: unknown,
  schemaVersion: unknown,
): ChallengeModeDefinition {
  if (typeof modeId !== "string" || !challengeModes[modeId as keyof typeof challengeModes]) {
    throw new Error(CHALLENGE_MODE_ERROR);
  }
  if (typeof schemaVersion !== "number") {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  let mode: ChallengeModeDefinition;
  try {
    mode = resolveChallengeMode(modeId, schemaVersion);
  } catch {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  const keys = mode.fields.map((field) => field.key);
  if (
    new Set(keys).size !== keys.length ||
    mode.fields.some((field) => field.allowedValues.length === 0)
  ) {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  return mode;
}

export function createEmptyProvenanceCounts(): AnswerKeyProvenanceCounts {
  return {
    legacy: 0,
    staging_demo: 0,
    clinician_adjudicated: 0,
    imported: 0,
    unknown: 0,
  };
}

export function isAnswerKeyProvenance(
  value: unknown,
): value is AnswerKeyProvenance {
  return typeof value === "string" &&
    answerKeyProvenanceValues.includes(value as AnswerKeyProvenance);
}

export function parseAnswerKeyImportMetadata(
  payload: unknown,
  generatedBatchId: string,
  currentTimestamp: string,
): AnswerKeyImportMetadata {
  const body = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : {};
  const provenanceValue = body.provenance ?? "staging_demo";
  if (!isAnswerKeyProvenance(provenanceValue) || provenanceValue === "legacy") {
    throw new Error(
      provenanceValue === "legacy"
        ? "Legacy provenance is reserved for existing six-field answer keys."
        : "Answer-key provenance is not supported.",
    );
  }

  const suppliedBatchId = body.importBatchId ?? body.import_batch_id;
  if (suppliedBatchId !== undefined && (
    typeof suppliedBatchId !== "string" ||
    suppliedBatchId.trim().length === 0 ||
    suppliedBatchId.trim().length > 120
  )) {
    throw new Error("Import batch ID must be 1 to 120 characters.");
  }
  const importBatchId = typeof suppliedBatchId === "string"
    ? suppliedBatchId.trim()
    : generatedBatchId;

  const suppliedNotes = body.notes;
  if (suppliedNotes !== undefined && (
    typeof suppliedNotes !== "string" || suppliedNotes.length > 1000
  )) {
    throw new Error("Answer-key notes must be 1,000 characters or fewer.");
  }
  const notes = typeof suppliedNotes === "string" && suppliedNotes.trim()
    ? suppliedNotes.trim()
    : null;

  const suppliedAdjudicator = body.adjudicatedBy ?? body.adjudicated_by;
  const suppliedAdjudicatedAt = body.adjudicatedAt ?? body.adjudicated_at;
  if (provenanceValue === "clinician_adjudicated") {
    if (
      typeof suppliedAdjudicator !== "string" ||
      suppliedAdjudicator.trim().length === 0 ||
      suppliedAdjudicator.trim().length > 120
    ) {
      throw new Error(
        "Clinician-adjudicated imports require an adjudicator name of 120 characters or fewer.",
      );
    }
    const adjudicatedAt = suppliedAdjudicatedAt ?? currentTimestamp;
    if (typeof adjudicatedAt !== "string" || Number.isNaN(Date.parse(adjudicatedAt))) {
      throw new Error("Clinician-adjudicated imports require a valid adjudication timestamp.");
    }
    return {
      provenance: provenanceValue,
      import_batch_id: importBatchId,
      adjudicated_by: suppliedAdjudicator.trim(),
      adjudicated_at: new Date(adjudicatedAt).toISOString(),
      notes,
    };
  }

  if (suppliedAdjudicator !== undefined || suppliedAdjudicatedAt !== undefined) {
    throw new Error(
      "Adjudicator metadata is only allowed for clinician-adjudicated imports.",
    );
  }

  return {
    provenance: provenanceValue,
    import_batch_id: importBatchId,
    adjudicated_by: null,
    adjudicated_at: null,
    notes: provenanceValue === "staging_demo"
      ? ["Staging/demo import; not clinically adjudicated.", notes]
          .filter(Boolean)
          .join(" ")
      : notes,
  };
}

export function getActivatableChallengeMode(
  modeId: unknown,
  schemaVersion: unknown,
): ChallengeModeDefinition {
  if (typeof modeId !== "string" || !isChallengeModeActivationAllowed(modeId)) {
    throw new Error(CHALLENGE_MODE_ERROR);
  }
  if (typeof schemaVersion !== "number") {
    throw new Error(SCHEMA_VERSION_ERROR);
  }

  return getChallengeModeForValidation(modeId, schemaVersion);
}

export function createChallengeSchemaMetadata(
  mode: ChallengeModeDefinition,
): AdminChallengeSchemaMetadata {
  return {
    modeId: mode.id,
    schemaVersion: mode.version,
    outputSchema: buildOutputSchema(mode),
  };
}

export function validateTargetAnswerKeys(
  reports: readonly ReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
) {
  const validation = validateTargetAnswerKeyCoverage(reports, answerKeys, mode);
  if (validation.issues.length > 0) {
    const issue = validation.issues[0];
    if (issue.type === "missing_answer_key" || issue.type === "duplicate_answer_key") {
      throw new Error(MISSING_ANSWER_KEYS_ERROR);
    }
    if (issue.type === "missing_schema_values") {
      throw new Error(MISSING_SCHEMA_VALUES_ERROR);
    }
    if (issue.type === "invalid_values") {
      throw new Error(ANSWER_KEY_VALUE_ERROR);
    }
    throw new Error(ANSWER_KEY_FIELDS_ERROR);
  }
}

export function validateAnswerKeyProvenanceForActivation(
  reports: readonly ReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
): AnswerKeyActivationProvenanceResult {
  const reportIds = new Set(reports.map((report) => report.id));
  const matchingAnswerKeys = answerKeys.filter((answerKey) =>
    reportIds.has(answerKey.report_id)
  );
  const provenanceCounts = createEmptyProvenanceCounts();
  let invalidProvenanceCount = 0;
  let compatibleCount = 0;

  for (const answerKey of matchingAnswerKeys) {
    const provenance = isAnswerKeyProvenance(answerKey.provenance)
      ? answerKey.provenance
      : "unknown";
    provenanceCounts[provenance] += 1;
    if (!isAnswerKeyProvenance(answerKey.provenance)) {
      invalidProvenanceCount += 1;
    }

    const compatible = mode.id === defaultChallengeMode.id
      ? provenance === "legacy" || provenance === "clinician_adjudicated"
      : provenance === "clinician_adjudicated";
    if (compatible) compatibleCount += 1;
  }

  const requiredCount = reports.length;
  const ok = requiredCount > 0 && compatibleCount === requiredCount;
  let error: string | null = null;

  if (!ok) {
    if (provenanceCounts.staging_demo > 0) {
      error = STAGING_PROVENANCE_ERROR;
    } else if (
      provenanceCounts.unknown > 0 ||
      provenanceCounts.imported > 0 ||
      invalidProvenanceCount > 0
    ) {
      error = UNSUPPORTED_PROVENANCE_ERROR;
    } else {
      error = CLINICAL_READINESS_ERROR;
    }
  }

  return {
    ok,
    compatibleCount,
    requiredCount,
    provenanceCounts,
    error,
  };
}

export function validateTargetAnswerKeysForActivation(
  reports: readonly ReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
) {
  validateTargetAnswerKeys(reports, answerKeys, mode);
  const provenance = validateAnswerKeyProvenanceForActivation(
    reports,
    answerKeys,
    mode,
  );
  if (!provenance.ok) {
    throw new Error(provenance.error || "The selected mode is not clinically ready for activation.");
  }
}

export function createChallengeSchemaPreflight(
  reports: readonly AdminSchemaReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
  options: { allowlisted: boolean; locked: boolean },
): AdminChallengeSchemaPreflight {
  const structural = validateTargetAnswerKeyCoverage(reports, answerKeys, mode);
  const structurallyReady = reports.length > 0 && structural.ok;
  const provenance = validateAnswerKeyProvenanceForActivation(
    reports,
    answerKeys,
    mode,
  );
  const clinicallyReady = structurallyReady && provenance.ok;
  const coveredReportIds = new Set(
    answerKeys
      .map((answerKey) => answerKey.report_id)
      .filter((reportId) => reports.some((report) => report.id === reportId)),
  );
  const messages = structural.issues.map((issue) => issue.message);

  if (structurallyReady && !clinicallyReady && provenance.error) {
    messages.push(provenance.error);
  }
  if (options.locked) {
    messages.push(
      "Challenge configuration is locked after event activity has started.",
    );
  }
  if (!options.allowlisted) {
    messages.push("The selected mode is not currently allowlisted for activation.");
  }
  if (
    structurallyReady &&
    clinicallyReady &&
    !options.locked &&
    options.allowlisted
  ) {
    messages.push("The selected mode passes the current activation checks.");
  } else if (structurallyReady && clinicallyReady && !options.locked) {
    messages.push("The selected mode would be activatable if it were allowlisted.");
  }

  return {
    ok: true,
    modeId: mode.id,
    schemaVersion: mode.version,
    structurallyReady,
    clinicallyReady,
    allowlisted: options.allowlisted,
    locked: options.locked,
    activatableIfAllowlisted:
      structurallyReady && clinicallyReady && !options.locked,
    messages: [...new Set(messages)],
    reportCounts: structural.reportCounts,
    coverage: {
      answerKeys: coveredReportIds.size,
      missing: Math.max(0, reports.length - coveredReportIds.size),
    },
    provenanceCounts: provenance.provenanceCounts,
  };
}

export function validateTargetAnswerKeyCoverage(
  reports: readonly ReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  mode: ChallengeModeDefinition,
): ChallengeSchemaValidationResult {
  const answerKeysByReport = new Map<string, AdminSchemaAnswerKeyRow[]>();
  for (const answerKey of answerKeys) {
    const rows = answerKeysByReport.get(answerKey.report_id) || [];
    rows.push(answerKey);
    answerKeysByReport.set(answerKey.report_id, rows);
  }

  const issueCounts = new Map<ChallengeSchemaValidationIssue["type"], number>();
  const increment = (type: ChallengeSchemaValidationIssue["type"]) => {
    issueCounts.set(type, (issueCounts.get(type) || 0) + 1);
  };

  for (const report of reports) {
    const rows = answerKeysByReport.get(report.id) || [];
    if (rows.length === 0) {
      increment("missing_answer_key");
      continue;
    }
    if (rows.length > 1) {
      increment("duplicate_answer_key");
      continue;
    }

    const answerKey = rows[0];
    const legacyValues = {
      acl_tear: answerKey.acl_tear,
      mcl_injury: answerKey.mcl_injury,
      meniscus_tear: answerKey.meniscus_tear,
      fracture: answerKey.fracture,
      osteoarthritis: answerKey.osteoarthritis,
      effusion: answerKey.effusion,
    };
    const answerValues =
      answerKey.answer_values ??
      (mode.id === defaultChallengeMode.id ? legacyValues : null);

    if (answerValues === null) {
      increment("missing_schema_values");
      continue;
    }

    try {
      validateAnswerValues(answerValues, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invalid for challenge mode")) {
        increment("invalid_values");
      } else {
        increment("invalid_fields");
      }
    }
  }

  const messages: Record<ChallengeSchemaValidationIssue["type"], string> = {
    missing_answer_key: MISSING_ANSWER_KEYS_ERROR,
    duplicate_answer_key:
      "One or more public or private reports have duplicate answer keys for this mode.",
    missing_schema_values: MISSING_SCHEMA_VALUES_ERROR,
    invalid_fields: ANSWER_KEY_FIELDS_ERROR,
    invalid_values: ANSWER_KEY_VALUE_ERROR,
  };
  const issues = [...issueCounts.entries()].map(([type, count]) => ({
    type,
    count,
    message: messages[type],
  }));
  const reportCounts = reports.reduce(
    (counts, report) => ({ ...counts, [report.split]: counts[report.split] + 1 }),
    { public: 0, private: 0 },
  );

  return {
    ok: issues.length === 0,
    modeId: mode.id,
    schemaVersion: mode.version,
    reportCounts,
    issues,
  };
}

export function createChallengeModesReadiness(
  reports: readonly AdminSchemaReportRow[],
  answerKeys: readonly AdminSchemaAnswerKeyRow[],
  activeModeId: string,
  activeSchemaVersion: number,
): AdminModeReadiness[] {
  const reportIds = new Set(reports.map((report) => report.id));

  return Object.values(challengeModes).map((mode) => {
    const matchingAnswerKeys = answerKeys.filter(
      (answerKey) =>
        reportIds.has(answerKey.report_id) &&
        answerKey.mode_id === mode.id &&
        answerKey.schema_version === mode.version,
    );
    const validation = validateTargetAnswerKeyCoverage(
      reports,
      matchingAnswerKeys,
      mode,
    );
    const validationPasses = reports.length > 0 && validation.ok;
    const coveredReportIds = new Set(
      matchingAnswerKeys.map((answerKey) => answerKey.report_id),
    );
    const isActive = mode.id === activeModeId && mode.version === activeSchemaVersion;
    const isAllowlisted = isChallengeModeActivationAllowed(mode.id);
    const activationStatus = isActive
      ? "active"
      : isAllowlisted
        ? "allowlisted"
        : "dormant";
    const missingAnswerKeyCount = Math.max(
      0,
      reports.length - coveredReportIds.size,
    );
    const provenanceReadiness = validateAnswerKeyProvenanceForActivation(
      reports,
      matchingAnswerKeys,
      mode,
    );
    const provenanceCounts = provenanceReadiness.provenanceCounts;
    const requiresClinicalAdjudication = mode.id !== defaultChallengeMode.id;
    const clinicallyReady = validationPasses && provenanceReadiness.ok;
    let statusMessage: AdminModeReadiness["statusMessage"];

    if (missingAnswerKeyCount > 0) {
      statusMessage = "Missing answer keys";
    } else if (!validationPasses) {
      statusMessage = "Validation failed";
    } else if (requiresClinicalAdjudication && !clinicallyReady) {
      statusMessage = provenanceCounts.staging_demo === reports.length
        ? "Structurally valid / staging data only"
        : "Structurally valid / clinician review incomplete";
    } else if (isActive) {
      statusMessage = "Active mode";
    } else if (!isAllowlisted) {
      statusMessage = "Dormant / not allowlisted";
    } else {
      statusMessage = "Ready for activation";
    }

    return {
      modeId: mode.id,
      title: mode.title,
      schemaVersion: mode.version,
      fieldCount: mode.fields.length,
      activationStatus,
      publicReportCount: validation.reportCounts.public,
      privateReportCount: validation.reportCounts.private,
      answerKeyCoverageCount: coveredReportIds.size,
      missingAnswerKeyCount,
      validationPasses,
      clinicallyReady,
      provenanceCounts,
      statusMessage,
      issues: validation.issues,
      provenanceNotice: provenanceCounts.staging_demo > 0
        ? `${provenanceCounts.staging_demo} answer key${provenanceCounts.staging_demo === 1 ? " is" : "s are"} staging/demo only and not clinically adjudicated.`
        : null,
    };
  });
}

export function validateAnswerKeyImportPayload(
  payload: unknown,
  reports: readonly AdminSchemaReportRow[],
  mode: ChallengeModeDefinition,
): AnswerKeyImportValidationResult {
  return prepareAnswerKeyImportPayload(payload, reports, mode).validation;
}

export function prepareAnswerKeyImportPayload(
  payload: unknown,
  reports: readonly AdminSchemaReportRow[],
  mode: ChallengeModeDefinition,
  metadata: AnswerKeyImportMetadata = {
    provenance: "unknown",
    import_batch_id: "unbatched",
    adjudicated_by: null,
    adjudicated_at: null,
    notes: null,
  },
): AnswerKeyImportPreparation {
  const items =
    typeof payload === "object" && payload !== null && "items" in payload &&
    Array.isArray(payload.items)
      ? payload.items
      : null;
  const issueCounts = new Map<AnswerKeyImportIssue["type"], number>();
  const increment = (type: AnswerKeyImportIssue["type"]) => {
    issueCounts.set(type, (issueCounts.get(type) || 0) + 1);
  };
  const reportsByIdentifier = new Map<string, AdminSchemaReportRow>();
  for (const report of reports) {
    reportsByIdentifier.set(report.id, report);
    if (report.filename) reportsByIdentifier.set(report.filename, report);
    if (report.external_id) reportsByIdentifier.set(report.external_id, report);
  }
  const seenReports = new Set<string>();
  const rows: AnswerKeyImportWriteRow[] = [];
  let validItemCount = 0;

  if (items) {
    for (const item of items) {
      if (typeof item !== "object" || item === null || !("report_id_or_filename" in item)) {
        increment("invalid_item");
        continue;
      }
      const record = item as Record<string, unknown>;
      const identifier = record.report_id_or_filename;
      const report = typeof identifier === "string" ? reportsByIdentifier.get(identifier) : undefined;
      if (!report) {
        increment("unknown_report");
        continue;
      }
      if (seenReports.has(report.id)) {
        increment("duplicate_report");
        continue;
      }
      seenReports.add(report.id);
      try {
        const answerValues = validateAnswerValues(record.answer_values, mode);
        rows.push({
          report_id: report.id,
          mode_id: mode.id,
          schema_version: mode.version,
          answer_values: answerValues,
          ...metadata,
        });
        validItemCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        increment(message.includes("invalid for challenge mode") ? "invalid_values" : "invalid_fields");
      }
    }
  } else {
    increment("invalid_item");
  }

  for (const report of reports) {
    if (!seenReports.has(report.id)) increment("missing_report_entry");
  }

  const messages: Record<AnswerKeyImportIssue["type"], string> = {
    unknown_report: "One or more import entries do not match a public or private report.",
    duplicate_report: "The import contains duplicate entries for one or more reports.",
    invalid_item: "One or more import entries are not in the required format.",
    invalid_fields: "One or more imported answer keys do not contain exactly the required fields.",
    invalid_values: "One or more imported answer keys contain values outside the allowed labels.",
    missing_report_entry: "One or more public or private reports are missing from the import.",
    existing_answer_key: EXISTING_ANSWER_KEY_ERROR,
  };
  const issues = [...issueCounts.entries()].map(([type, count]) => ({
    type,
    count,
    message: messages[type],
  }));
  const reportCounts = reports.reduce(
    (counts, report) => ({ ...counts, [report.split]: counts[report.split] + 1 }),
    { public: 0, private: 0 },
  );

  return {
    validation: {
      ok: issues.length === 0,
      modeId: mode.id,
      schemaVersion: mode.version,
      reportCounts,
      itemCount: items?.length || 0,
      validItemCount,
      issues,
    },
    rows,
  };
}

export function createAnswerKeyImportWritePlan(
  rows: readonly AnswerKeyImportWriteRow[],
  existingReportIds: ReadonlySet<string>,
  overwrite: boolean,
): AnswerKeyImportWritePlan {
  const updatedCount = rows.filter((row) => existingReportIds.has(row.report_id)).length;

  if (updatedCount > 0 && !overwrite) {
    return {
      blocked: true,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: rows.length,
    };
  }

  return {
    blocked: false,
    insertedCount: rows.length - updatedCount,
    updatedCount,
    skippedCount: 0,
  };
}

export async function executeAnswerKeyImportWrite(
  rows: readonly AnswerKeyImportWriteRow[],
  existingReportIds: ReadonlySet<string>,
  overwrite: boolean,
  operations: AnswerKeyImportWriteOperations,
) {
  const plan = createAnswerKeyImportWritePlan(rows, existingReportIds, overwrite);
  if (plan.blocked) return plan;

  if (overwrite) {
    await operations.upsert(rows);
  } else {
    await operations.insert(rows);
  }

  return plan;
}
