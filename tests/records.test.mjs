import {test}from'node:test';
import assert from'node:assert/strict';
import {RETENTION_MS,syncRecords,pruneExpired,readState,activePaper,pendingKeys,paperStatus,removePaper}from'../plugin/records.mjs';
const now=Date.parse('2026-10-30T12:00:00Z');
function paper(id){return {id,number:1,modules:[{channel:'listening',items:Array.from({length:4},(_,k)=>({key:id+':'+k,channel:'listening',seen:k%2===0,questionCount:10}))}]};}
function plans(){return [{id:'p',createdAt:new Date(now).toISOString(),sets:[paper('one'),paper('two')]}];}
function finish(s,time=now){s.modules[0].items.forEach((i,k)=>{i.startedAt=new Date(time-600000+k*120000).toISOString();i.result={attemptId:s.id+k,total:10,correct:6+k,elapsedSeconds:120,completedAt:new Date(time).toISOString()};});}
test('partial work remains a recoverable draft, never a completed score record',()=>{
 const p=plans(),s=p[0].sets[0];finish(s);delete s.modules[0].items[3].result;syncRecords(p,now);
 assert.equal(paperStatus(s),'active');assert.equal(s.snapshot,undefined);assert.equal(s.completedAt,undefined);
 assert.equal(readState(JSON.stringify({plans:p}),now).plans[0].sets[0].modules[0].items[0].result.correct,6);
});
test('each paper finalizes independently with separate score snapshot and fixed expiration',()=>{
 const p=plans();finish(p[0].sets[0]);syncRecords(p,now);
 const [a,b]=p[0].sets;assert.equal(a.snapshot.modules[0].correct,30);assert.equal(a.snapshot.modules[0].total,40);
 assert.equal(b.snapshot,undefined);assert.equal(Date.parse(a.expiresAt),now+RETENTION_MS);
 const before=JSON.stringify(a.snapshot);syncRecords(p,now+3600000);assert.equal(JSON.stringify(a.snapshot),before);assert.equal(Date.parse(a.expiresAt),now+RETENTION_MS);
});
test('seven-day cleanup removes only expired completed papers, keeping unfinished siblings',()=>{
 const p=plans();finish(p[0].sets[0]);syncRecords(p,now);
 assert.equal(pruneExpired(p,now+RETENTION_MS-1)[0].sets.length,2);
 const clean=pruneExpired(p,now+RETENTION_MS);assert.deepEqual(clean[0].sets.map(s=>s.id),['two']);
});
test('old completed batches migrate using actual completion date and no fifteen-batch truncation',()=>{
 const p=plans();finish(p[0].sets[0],now-RETENTION_MS);const state=readState(JSON.stringify({version:1,plans:p}),now);
 assert.equal(state.version,2);assert.deepEqual(state.plans[0].sets.map(s=>s.id),['two']);
 const many=Array.from({length:20},(_,i)=>({id:'batch'+i,createdAt:new Date(now).toISOString(),sets:[paper('paper'+i)]}));
 assert.equal(readState(JSON.stringify({plans:many}),now).plans.length,20);
});
test('paused drafts remain recoverable and reserve their passages',()=>{
 const p=plans();p[0].sets[0].startedAt=new Date(now).toISOString();syncRecords(p,now);
 assert.equal(activePaper(p).s.id,'one');p[0].sets[0].pausedAt=new Date(now).toISOString();assert.equal(activePaper(p),undefined);
 assert.equal(paperStatus(p[0].sets[0]),'paused');assert(pendingKeys(p).has('one:0'));
 assert.equal(pruneExpired(p,now+RETENTION_MS*2)[0].sets.length,2);
});
test('malformed stored records fail without replacing original data',()=>{assert.throws(()=>readState('{oops'));assert.throws(()=>readState('{"plans":[{}]}'),/格式异常/);});
test('manual removal deletes exactly one paper and preserves its siblings',()=>{
 const p=plans();finish(p[0].sets[0]);syncRecords(p,now);const clean=removePaper(p,'one');
 assert.deepEqual(clean[0].sets.map(s=>s.id),['two']);assert.equal(p[0].sets.length,2);
 assert.equal(removePaper(clean,'two').length,0);
});
