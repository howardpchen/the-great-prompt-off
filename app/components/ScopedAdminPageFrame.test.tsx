import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./AdminLayout", () => ({ AdminPageFrame: ({children}: {children: unknown}) => children }));
vi.mock("../lib/db/database", () => ({ createDatabase: () => { throw new Error("Frame must never resolve active identity again"); } }));
import { ScopedAdminPageFrame } from "./ScopedAdminPageFrame";

it("renders the supplied data snapshot's fence without re-reading mutable active identity", () => {
  const frame = ScopedAdminPageFrame({ contestContext: { id: "snapshot-A", schema_version: 7 }, children: "A controls" });
  expect(frame.props["data-active-contest"]).toBe("snapshot-A");
  expect(frame.props["data-contest-version"]).toBe(7);
  expect(frame.props.children.props.children).toBe("A controls");
});
it("fails closed when no contest exists in the data snapshot", () => {
  const frame = ScopedAdminPageFrame({ contestContext: null, children: "No contest" });
  expect(frame.props["data-active-contest"]).toBe("");
  expect(frame.props["data-contest-version"]).toBe(0);
});
