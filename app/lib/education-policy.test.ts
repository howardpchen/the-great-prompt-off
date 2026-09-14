import {describe,it,expect} from 'vitest';
import {hideEducationFinal,isEducationContest,projectFinalResponse} from './education-policy';
const schema={education:{version:1,pipeline:'structured-v1',baselineInstructions:'baseline'}};
describe('educational final privacy',()=>{
 it('opts in explicitly and preserves legacy',()=>{
  expect(isEducationContest(null)).toBe(false);
  expect(isEducationContest({education:{version:2}})).toBe(false);
  expect(hideEducationFinal({},'final_open')).toBe(false);
 });
 it('redacts every score-bearing projection without mutating stored replay',()=>{
  const stored={kind:'final',score:90,finalScore:90,correctFields:9,totalFields:10,reportCount:5,summary:{accuracy:90},feedback:{score:90}};
  for(const phase of ['not_started','practice_open','final_open']) {
   const hidden=projectFinalResponse(stored,schema,phase);
   expect(hidden.score).toBeNull();expect(hidden.finalScore).toBeNull();
   expect(hidden.summary).toBeNull();expect(hidden.feedback).toBeUndefined();
   expect(hidden.correctFields).toBeNull();expect(hidden.totalFields).toBeNull();
  }
  expect(projectFinalResponse(stored,schema,'ended')).toBe(stored);
  expect(stored.score).toBe(90);
 });
 it('does not hide practice or legacy feedback',()=>{
  const practice={kind:'public',score:90};
  expect(projectFinalResponse(practice,schema,'practice_open')).toBe(practice);
  const legacy={kind:'final',score:90};
  expect(projectFinalResponse(legacy,null,'final_open')).toBe(legacy);
 });
});
