export type ChallengeFieldDefinition = {
  type?: "binary" | "multiclass" | "number";
  unit?: string;
  minimum?: number;
  maximum?: number;
  tolerance?: number;
  nullable?: boolean;
  weight?: number;
  key: string;
  label: string;
  description?: string;
  allowedValues: readonly string[];
  aliases?: readonly string[];
};

export type ChallengeModeDefinition = {
  id: string;
  version: number;
  title: string;
  description?: string;
  domain: string;
  fields: readonly ChallengeFieldDefinition[];
};

export type PublicChallengeModeMetadata = {
  id: string;
  version: number;
  title: string;
  fields: readonly ChallengeFieldDefinition[];
  allowedValues: readonly string[];
};

export const kneeMri6BasicMode = {
  id: "knee_mri_6_basic",
  version: 1,
  title: "Knee MRI Extraction Challenge",
  description: "Extract structured findings from synthetic non-PHI radiology reports.",
  domain: "knee_mri",
  fields: [
    {
      key: "acl_tear",
      label: "ACL tear",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "acl",
        "ACL",
        "acl_status",
        "ACL_status",
        "ACL_intact_or_torn",
        "acl_intact_or_torn",
        "anterior_cruciate_ligament",
      ],
    },
    {
      key: "mcl_injury",
      label: "MCL injury",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "mcl",
        "MCL",
        "mcl_status",
        "MCL_status",
        "MCL_intact_or_torn",
        "mcl_intact_or_torn",
        "medial_collateral_ligament",
      ],
    },
    {
      key: "meniscus_tear",
      label: "Meniscus tear",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "meniscus",
        "meniscal_tear",
        "meniscal_tear_partial_or_full_thickness",
        "medial_or_lateral_meniscus_tear",
        "medial_meniscus",
        "lateral_meniscus",
      ],
    },
    {
      key: "fracture",
      label: "Fracture",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: ["fx", "bone_fracture"],
    },
    {
      key: "osteoarthritis",
      label: "Osteoarthritis",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "arthritis",
        "oa",
        "degenerative_change",
        "degenerative_joint_disease",
        "degenerative_narrowing_or_spurring_osteoarthritis",
        "degenerative_narrowing",
        "spurring",
      ],
    },
    {
      key: "effusion",
      label: "Effusion",
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
      aliases: [
        "joint_effusion",
        "knee_effusion",
        "knee_joint_effusion",
        "suprapatellar_effusion",
      ],
    },
  ],
} as const satisfies ChallengeModeDefinition;

const dormantAllowedValues = [
  "present",
  "absent",
  "uncertain",
  "not_reported",
] as const;

function dormantField(
  key: string,
  label: string,
  aliases: readonly string[] = [],
): ChallengeFieldDefinition {
  return {
    key,
    label,
    allowedValues: dormantAllowedValues,
    aliases,
  };
}

export const kneeMri12BasicMode = {
  id: "knee_mri_12_basic",
  version: 1,
  title: "Knee MRI Extraction Challenge (12 findings)",
  description: "Dormant future schema for broader synthetic knee MRI extraction.",
  domain: "knee_mri",
  fields: [
    dormantField("acl_tear", "ACL tear", ["acl", "anterior_cruciate_ligament"]),
    dormantField("mcl_tear", "MCL tear", ["mcl", "medial_collateral_ligament"]),
    dormantField("medial_meniscus_tear", "Medial meniscus tear", ["medial_meniscus"]),
    dormantField("lateral_meniscus_tear", "Lateral meniscus tear", ["lateral_meniscus"]),
    dormantField("fracture", "Fracture", ["fx", "bone_fracture"]),
    dormantField("bone_contusion", "Bone contusion", ["bone_bruise", "osseous_contusion"]),
    dormantField("medial_osteoarthritis", "Medial compartment osteoarthritis", ["medial_oa"]),
    dormantField("lateral_osteoarthritis", "Lateral compartment osteoarthritis", ["lateral_oa"]),
    dormantField("patellofemoral_osteoarthritis", "Patellofemoral osteoarthritis", ["patellofemoral_oa"]),
    dormantField("effusion", "Effusion", ["joint_effusion", "knee_effusion"]),
    dormantField("synovitis", "Synovitis", ["synovial_inflammation"]),
    dormantField("bakers_cyst", "Baker's cyst", ["baker_cyst", "popliteal_cyst"]),
  ],
} satisfies ChallengeModeDefinition;

export const shoulderMriBasicMode = {
  id: "shoulder_mri_basic",
  version: 1,
  title: "Shoulder MRI Extraction Challenge",
  description: "Dormant proof-of-generalization schema for synthetic shoulder MRI extraction.",
  domain: "shoulder_mri",
  fields: [
    dormantField("rotator_cuff_tear", "Rotator cuff tear", ["rotator_cuff", "cuff_tear"]),
    dormantField("labral_tear", "Labral tear", ["labrum", "labral_injury"]),
    dormantField("biceps_tendinopathy", "Biceps tendinopathy", ["biceps_tendonitis", "biceps_tendon"]),
    dormantField("ac_joint_arthritis", "AC joint arthritis", ["acromioclavicular_arthritis", "ac_arthritis"]),
    dormantField("glenohumeral_arthritis", "Glenohumeral arthritis", ["gh_arthritis"]),
    dormantField("fracture", "Fracture", ["fx", "bone_fracture"]),
    dormantField("effusion", "Effusion", ["joint_effusion", "shoulder_effusion"]),
    dormantField("bursitis", "Bursitis", ["subacromial_bursitis", "subdeltoid_bursitis"]),
  ],
} satisfies ChallengeModeDefinition;

export const challengeModes = {
  [kneeMri6BasicMode.id]: kneeMri6BasicMode,
  [kneeMri12BasicMode.id]: kneeMri12BasicMode,
  [shoulderMriBasicMode.id]: shoulderMriBasicMode,
} as const;

export const defaultChallengeMode = kneeMri6BasicMode;

// Dormant registry entries are intentionally not activation-eligible yet.
export const activatableChallengeModeIds = [defaultChallengeMode.id] as const;

export function isChallengeModeActivationAllowed(modeId: string) {
  return activatableChallengeModeIds.includes(
    modeId as (typeof activatableChallengeModeIds)[number],
  );
}

export function getPublicChallengeModeMetadata(
  mode: ChallengeModeDefinition = defaultChallengeMode,
): PublicChallengeModeMetadata {
  return {
    id: mode.id,
    version: mode.version,
    title: mode.title,
    fields: mode.fields.map(f => ({key:f.key,label:f.label,allowedValues:[...f.allowedValues],
      ...(f.type !== undefined ? {type:f.type} : {}), ...(f.description !== undefined ? {description:f.description} : {}),
      ...(f.unit !== undefined ? {unit:f.unit} : {}), ...(f.minimum !== undefined ? {minimum:f.minimum} : {}),
      ...(f.maximum !== undefined ? {maximum:f.maximum} : {}), ...(f.tolerance !== undefined ? {tolerance:f.tolerance} : {}),
      ...(f.nullable !== undefined ? {nullable:f.nullable} : {}), ...(f.weight !== undefined ? {weight:f.weight} : {})})),
    allowedValues: [
      ...new Set(mode.fields.flatMap((field) => field.allowedValues)),
    ],
  };
}
