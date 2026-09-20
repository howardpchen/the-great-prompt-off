import { describe, expect, it } from "vitest";
import {
  CHALLENGE_CONFIGURATION_LOCK_MESSAGE,
  isChallengeConfigurationLocked,
} from "./challenge-lock";

describe("challenge configuration locking", () => {
  it("remains mutable before any successful submission", () => {
    expect(isChallengeConfigurationLocked(0)).toBe(false);
  });

  it("locks after the first successful public or final submission", () => {
    expect(isChallengeConfigurationLocked(1)).toBe(true);
    expect(isChallengeConfigurationLocked(2)).toBe(true);
  });

  it("uses submissions as the durable lock marker", () => {
    // Failed prompt_runs and calibration calls do not create submission rows.
    expect(isChallengeConfigurationLocked(0)).toBe(false);
  });

  it("keeps the participant-safe lock message stable", () => {
    expect(CHALLENGE_CONFIGURATION_LOCK_MESSAGE).toContain(
      "frozen after activation",
    );
  });
});

