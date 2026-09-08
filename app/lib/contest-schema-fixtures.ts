import type { ChallengeModeDefinition } from "./challenge-modes";
// Header names only; no RSNA reports or dataset answers are distributed here.
export const rsnaFindingColumns = [
  "ACL",
  "MCL",
  "Medial Meniscus",
  "Lateral Meniscus",
  "Medial OA",
  "Lateral OA",
  "PF OA",
  "Effusion",
  "Synovitis",
  "Baker's",
  "Contusion",
  "Fracture",
] as const;
export const twelveBinaryTemplate: ChallengeModeDefinition = {
  id: "rsna_knee_12_binary",
  version: 1,
  title: "Twelve binary findings (synthetic test)",
  domain: "knee_mri",
  fields: rsnaFindingColumns.map((label) => ({
    key: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_$/, ""),
    label,
    type: "binary",
    allowedValues: ["0", "1"],
    description: `Extract ${label}. Labels are strings: 0 = absent, 1 = present.`,
    weight: 1,
  })),
};
export const mixedTemplate: ChallengeModeDefinition = {
  id: "mixed_extraction",
  version: 1,
  title: "Mixed extraction (synthetic test)",
  domain: "general",
  fields: [
    ...Array.from({ length: 5 }, (_, i) => ({
      key: `binary_${i + 1}`,
      label: `Binary ${i + 1}`,
      type: "binary" as const,
      allowedValues: ["absent", "present"],
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      key: `class_${i + 1}`,
      label: `Class ${i + 1}`,
      type: "multiclass" as const,
      allowedValues: ["low", "medium", "high"],
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      key: `measurement_${i + 1}`,
      label: `Measurement ${i + 1}`,
      type: "number" as const,
      allowedValues: [],
      unit: "mm",
      minimum: 0,
      maximum: 500,
      tolerance: 0.5,
      nullable: true,
      weight: 2,
    })),
  ],
};
