import { expect, it } from "vitest";
import { mapWithConcurrency } from "./evaluation-workers";
it("drains current work and does not schedule more after a provider failure", async () => {
  const started:number[]=[], completed:number[]=[];
  await expect(mapWithConcurrency([0,1,2,3,4,5],3,async i=>{
    started.push(i);
    await new Promise(resolve=>setTimeout(resolve,i===0?2:15));
    if(i===0) throw new Error("fixture failure");
    completed.push(i);return i;
  })).rejects.toThrow("fixture failure");
  expect(started).toEqual([0,1,2]);expect(completed).toEqual([1,2]);
});
