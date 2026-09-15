import { expect, it } from "vitest";
import { isContestId } from "./contest-context";

it.each([undefined, null, "", " ", 123, {}, "not-a-contest", "00000000-0000-0000-0000-000000000000\n"])("rejects non-concrete HTTP contest identity %j", (value) => {
  expect(isContestId(value)).toBe(false);
});
it("accepts database UUID identities", () => {
  expect(isContestId("ec32914e-f33b-4586-a952-6D064BB6C761")).toBe(true);
});
