import { expect, it } from "vitest";
import { withProviderSlot } from "./provider-concurrency";
it("limits simultaneous provider work across independent submissions and releases failed slots", async () => {
  let running = 0, maximum = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => withProviderSlot(3, async () => {
    running++; maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--; if (i === 4) throw new Error("simulated failure"); return i;
  })));
  expect(maximum).toBe(3);
  expect(outcomes.filter(x => x.status === "rejected")).toHaveLength(1);
  expect(await withProviderSlot(3, async () => "healthy")).toBe("healthy");
});
