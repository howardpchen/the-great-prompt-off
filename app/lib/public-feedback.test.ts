import {describe, it, expect} from "vitest";
import {comparisonForReport, feedbackRowId} from "./public-feedback";
describe("public feedback identity mapping", () => {
  it("matches shuffled results by ID or filename, never digits or order", () => {
    const results = [{report:"file-001.txt",fields:[]},{report:"id-a",fields:[]}];
    expect(comparisonForReport(results,{id:"id-a",filename:"file-999.txt"})).toBe(results[1]);
    expect(comparisonForReport(results,{id:"id-b",filename:"file-001.txt"})).toBe(results[0]);
    expect(comparisonForReport(results,{id:"id-missing",filename:"file-1.txt"})).toBeUndefined();
  });
  it("keeps report/field focus targets distinct and safe for arbitrary labels", () => {
    expect(feedbackRowId("report/a","field b")).not.toBe(feedbackRowId("report","a/field b"));
    expect(feedbackRowId("report/a","field b")).not.toContain(" ");
  });
});
