import { expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("./supabase/admin", () => ({ createDatabase: () => ({ execute }) }));

import { getPublicChallengeReports } from "./challenge-data";

it("does not retarget reports to a newly active contest after phase validation", async () => {
  execute.mockResolvedValueOnce({ data: null, error: null });
  await expect(getPublicChallengeReports("checked-contest")).rejects.toThrow("No active challenge found");
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][0].where).toEqual([
    ["is_active", "eq", true],
    ["id", "eq", "checked-contest"],
  ]);
});
