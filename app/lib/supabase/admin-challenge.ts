import "server-only";

import {
  CHALLENGE_CONFIGURATION_LOCK_MESSAGE,
  isChallengeConfigurationLocked,
} from "@/app/lib/challenge-lock";

export { CHALLENGE_CONFIGURATION_LOCK_MESSAGE, isChallengeConfigurationLocked };

export class ChallengeConfigurationLockedError extends Error {
  constructor() {
    super(CHALLENGE_CONFIGURATION_LOCK_MESSAGE);
    this.name = "ChallengeConfigurationLockedError";
  }
}

/**
 * Route-level preflight for a clearer admin error. The database trigger in
 * supabase/challenge-config-lock.sql is the authoritative race-safe guard.
 */
export async function assertChallengeConfigurationMutable(
  supabase: unknown,
  challengeId: string,
) {
  if (await getChallengeConfigurationLockStatus(supabase, challengeId)) {
    throw new ChallengeConfigurationLockedError();
  }
}

export async function getChallengeConfigurationLockStatus(
  supabase: unknown,
  challengeId: string,
) {
  const client = supabase as import('../db/database').Database;
  const {count, error} = await client.execute({table:'submissions',count:true,where:[['challenge_id','eq',challengeId]]});

  if (error) {
    throw new Error(`Could not check challenge configuration lock: ${error.message}`);
  }

  const [row] = await client.sql<{schema_locked:boolean}>("SELECT schema_locked FROM challenges WHERE id=$1",[challengeId]);
  return Boolean(row?.schema_locked) || isChallengeConfigurationLocked(count ?? 0);
}
