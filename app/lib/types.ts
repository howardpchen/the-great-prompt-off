import type { defaultChallengeMode } from "./challenge-modes";

export type FindingKey = (typeof defaultChallengeMode.fields)[number]["key"];

export type FindingValue =
  (typeof defaultChallengeMode.fields)[number]["allowedValues"][number];

export type AnswerKey = Record<FindingKey, FindingValue>;

export type ReportSplit = "sample" | "public" | "private";

export type ReportManifestItem = {
  id: string;
  filename: string;
  split: ReportSplit;
};

export type AnswerKeyItem = ReportManifestItem & {
  answer_key: AnswerKey;
  notes?: string;
};

export type SampleReport = AnswerKeyItem & {
  text: string;
};

export type ScoreSummary = {
  correct: number;
  total: number;
  accuracy: number;
};

export type FieldScoreResult = {
  field: FindingKey;
  expected: FindingValue;
  actual: FindingValue | null;
  correct: boolean;
  missing: boolean;
  invalid: boolean;
};

export type InvalidFieldResult = {
  field: string;
  value: unknown;
};

export type ScoringResult = {
  valid_json: boolean;
  per_field: FieldScoreResult[];
  missing_fields: FindingKey[];
  invalid_fields: InvalidFieldResult[];
  field_accuracy: number;
  overall_score: number;
  diagnostics: ScoringDiagnostics;
};

export type SchemaFieldScoreResult = {
  weight?: number;
  field: string;
  expected: string | number | null;
  actual: string | number | null;
  correct: boolean;
  missing: boolean;
  invalid: boolean;
};

export type SchemaScoringResult = {
  valid_json: boolean;
  per_field: SchemaFieldScoreResult[];
  missing_fields: string[];
  invalid_fields: InvalidFieldResult[];
  field_accuracy: number;
  overall_score: number;
  diagnostics: ScoringDiagnostics;
};

export type ScoringDiagnostics = {
  strict_json_valid: boolean;
  recovered_json_used: boolean;
  nested_object_used: boolean;
  normalization_used: boolean;
  key_normalization_used: boolean;
  value_normalization_used: boolean;
  ignored_outer_key: string | null;
  ignored_extra_fields: string[];
};

export type SubmissionKind = "public" | "final";

export type StoredSubmission = {
  id: string;
  participantId: string;
  kind: SubmissionKind;
  createdAt: string;
  promptSnapshot: string;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
};

export type ParticipantSubmissionHistory = {
  publicSubmissions: StoredSubmission[];
  finalSubmission: StoredSubmission | null;
};
