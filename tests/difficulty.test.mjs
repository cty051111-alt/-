import {test}from'node:test';import assert from'node:assert/strict';
import {CALIBRATION}from'../plugin/calibration.mjs';
import {aggregateDifficulty}from'../plugin/difficulty.mjs';
import {buildBatch}from'../plugin/engine.mjs';
function pool(accuracy){return Array.from({length:4},(_,s)=>({key:'u'+s,channel:'listening',partId:'p'+s,slot:'P'+(s+1),albums:['a'],seen:false,accuracy,questionCount:10,types:['fill'],topic:'test'}));}
test('pinned full reading recall gives exactly level 3 using question weights',()=>{
 const items=CALIBRATION.reading.items.map(i=>({...i,questionCount:i.count}));const meta=aggregateDifficulty(items,'reading','reference');
 assert.equal(items.reduce((a,i)=>a+i.questionCount,0),40);assert(Math.abs(meta.weightedAccuracy-65.0555)<1e-9);assert.equal(meta.level,3);assert.equal(meta.basis,'recall-matched');
});
test('default reinforcement target is level 3.75, 7.5 percentage points below reference',()=>{
 const meta=aggregateDifficulty(pool(CALIBRATION.listening.baselineAccuracy-7.5),'listening');
 assert(Math.abs(meta.level-3.75)<1e-9);assert(meta.inRange);assert.equal(meta.min,3.5);assert.equal(meta.max,4);assert.equal(meta.basis,'catalog-only');
});
test('aggregate is weighted by actual questions, not by passage count',()=>{
 const items=[{accuracy:80,questionCount:13},{accuracy:60,questionCount:13},{accuracy:60,questionCount:14}];
 assert.equal(aggregateDifficulty(items,'reading').weightedAccuracy,66.5);
});
test('strict difficulty fails but permitted fallback explicitly marks easier and harder candidates',()=>{
 const opts={channels:['listening'],albums:['a'],count:1,seed:44};
 assert.throws(()=>buildBatch(pool(95),opts),/无法/);
 const easy=buildBatch(pool(95),{...opts,allowDeviation:true}).sets[0].modules[0].difficultyMeta;
 assert.equal(easy.evaluation,'偏简单');assert.equal(easy.level,1);assert(!easy.inRange);assert(easy.deviationReason);
 const hard=buildBatch(pool(10),{...opts,allowDeviation:true}).sets[0].modules[0].difficultyMeta;
 assert.equal(hard.evaluation,'偏难');assert.equal(hard.level,5);assert(!hard.inRange);
});
test('missing averages never turn into fabricated difficulty levels',()=>{
 const units=pool(60);units[0].accuracy=null;const meta=aggregateDifficulty(units,'listening');
 assert.equal(meta.level,null);assert.equal(meta.weightedAccuracy,null);assert.equal(meta.coverage,.75);assert.equal(meta.evaluation,'数据不足');
});
test('writing has no fabricated numeric difficulty',()=>assert.equal(aggregateDifficulty([],'writing'),null));
