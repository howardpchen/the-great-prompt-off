export const CHALLENGE_CONFIGURATION_LOCK_MESSAGE =
  "Contest configuration is frozen after activation or evaluation. Duplicate as a new draft to make changes.";

/** Historical compatibility check; permanent lifecycle state is also checked in the database. */
export function isChallengeConfigurationLocked(successfulSubmissionCount: number) {
  return successfulSubmissionCount > 0;
}

