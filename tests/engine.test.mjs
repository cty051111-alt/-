import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalize,buildBatch,examQuestionCount,reviewStats,bandReference,trainingFeedback,validateWritingDetail} from '../plugin/engine.mjs';
import {CALIBRATION}from'../plugin/calibration.mjs';
function pool(){return ['listening','reading','writing'].flatMap(channel=>{const slots=channel==='listening'?4:channel==='reading'?3:2;return Array.from({length:slots},(_,s)=>Array.from({length:30},(_,k)=>({key:`${channel}:${s}:${k}`,channel,partId:`${s}:${k}`,slot:channel==='writing'?`Task${s+1}`:`P${s+1}`,albums:['a'],seen:k%2===0,accuracy:50+k%21,questionCount:channel==='listening'?10:channel==='reading'?[13,13,14][s]:null,types:['fill',k%2?'choice':'matching'],topic:String(k%3)}))).flat();});}
const options={channels:['listening','reading','writing'],albums:['a'],count:3,seed:42};

test('writing supports Task1 only, Task2 only and both from selected native pools',()=>{
 for(const writingTasks of [['Task1'],['Task2'],['Task1','Task2']]){
  const b=buildBatch(pool(),{...options,channels:['writing'],writingTasks});
  assert(b.sets.every(s=>s.modules[0].items.length===writingTasks.length));
  assert(b.sets.flatMap(s=>s.modules[0].items).every(i=>writingTasks.includes(i.slot)));
 }
 assert.throws(()=>buildBatch(pool(),{...options,channels:['writing'],writingTasks:[]}),/小作文或大作文/);
 assert.throws(()=>buildBatch(pool().filter(i=>i.slot==='Task2'),{...options,channels:['writing'],writingTasks:['Task1']}),/Task1/);
});
test('single-essay mixed batches balance new and old while preserving strict modes',()=>{
 for(const mode of ['mixed','fresh','review']){
  const b=buildBatch(pool(),{...options,channels:['writing'],writingTasks:['Task2'],count:4,mode});
  const items=b.sets.flatMap(s=>s.modules[0].items);
  assert.equal(items.filter(i=>!i.seen).length,mode==='mixed'?2:mode==='fresh'?4:0);
 }
});
test('unknown or explicitly unavailable writing items cannot be misclassified as Task2',()=>{
 const album={id:'w',channel:'writing'},units=[{id:'x'}, {id:'y',writingTaskType:'task2_opinion',available:false}, {id:'z',writingTaskType:'task2_opinion'}];
 assert.deepEqual(normalize([{album,units}]).map(i=>i.unitId),['z']);
});
test('native writing detail must match unit, part, selected Task and actual writing questions',()=>{
 const item={unitId:'u',partId:'p',slot:'Task2'};
 const detail={unit:{id:'u'},parts:[{id:'p',writingTaskType:'task2_opinion',groups:[{type:'writing',questions:[{id:'q'}]}]}]};
 assert.equal(validateWritingDetail(detail,item),true);
 for(const bad of [{...detail,unit:{id:'other'}},{...detail,parts:[]},{...detail,parts:[{...detail.parts[0],writingTaskType:'task1_map'}]},{...detail,parts:[{...detail.parts[0],groups:[]}]}])assert.throws(()=>validateWritingDetail(bad,item));
});
test('strict fresh/review mode and global batch uniqueness',()=>{for(const mode of ['fresh','review']){const b=buildBatch(pool(),{...options,mode});const all=b.sets.flatMap(s=>s.modules.flatMap(m=>m.items));assert.equal(new Set(all.map(i=>i.key)).size,all.length);assert(all.every(i=>i.seen===(mode==='review')));}});
test('mixed respects rounded new ratio in every subject',()=>{const b=buildBatch(pool(),{...options,mode:'mixed'});for(const s of b.sets)for(const m of s.modules){const n=m.items.length;assert.equal(m.items.filter(i=>!i.seen).length,Math.round(n*.5));}});
test('selection is repeatable and exact 40 questions',()=>{assert.deepEqual(buildBatch(pool(),options).sets,buildBatch(pool(),options).sets);for(const s of buildBatch(pool(),options).sets)for(const m of s.modules.filter(m=>m.channel!=='writing'))assert.equal(m.items.reduce((a,i)=>a+i.questionCount,0),40);});
test('shortages, invalid counts and impossible difficulty fail rather than relaxing rules',()=>{assert.throws(()=>buildBatch([],{...options}),/缺少/);assert.throws(()=>buildBatch(pool(),{...options,count:0}),/1–10/);assert.throws(()=>buildBatch(pool().map(u=>({...u,accuracy:0})),options),/无法/);});
test('duplicates inherit seen status from another album; draft is not done',()=>{const album={id:'1',channel:'reading',title:'one'},u={id:'1',partId:'p',mixedSlot:'P1',mixedSelectable:true,progressStatus:'todo'};const n=normalize([{album,units:[u]},{album:{...album,id:'2'},units:[{...u,resultId:'result'}]}]);assert.equal(n.length,1);assert.equal(n[0].seen,true);assert.equal(n[0].albums.length,2);const w=normalize([{album:{id:'w',channel:'writing'},units:[{id:'w1',hasDraft:true,latestAttemptStatus:'draft',writingTaskType:'task1_map'}]}]);assert.equal(w[0].seen,false);});
test('score reference requires exactly forty; no fake score for incomplete sets',()=>{assert.equal(bandReference(23,40),'约 6–7 分');assert.match(bandReference(9,10),/40/);assert.equal(bandReference(15,40,'reading'),'约 5–6 分');assert.equal(bandReference(15,40,'listening'),'低于约 5 分参考线');});
function priorityPool(){return pool().filter(u=>u.channel==='listening'&&Number(u.key.split(':').at(-1))<5).map(u=>({...u,accuracy:CALIBRATION.listening.baselineAccuracy-7.5,personalAccuracy:u.seen?{0:60,2:70,4:100}[Number(u.key.split(':').at(-1))]:null}));}
test('review picks 6/10 before 7/10 or perfect results in every Part',()=>{
 for(let seed=1;seed<=15;seed++){
  const module=buildBatch(priorityPool(),{...options,channels:['listening'],count:1,mode:'review',seed}).sets[0].modules[0];
  assert(module.items.every(i=>i.personalAccuracy===60));
 }
});
test('mixed keeps half new while prioritizing the weakest submitted passages',()=>{
 const batch=buildBatch(priorityPool(),{...options,channels:['listening'],count:1,mode:'mixed'});
 const items=batch.sets[0].modules[0].items;assert.equal(items.filter(i=>!i.seen).length,2);
 assert(items.filter(i=>i.seen).every(i=>i.personalAccuracy===60));
});
test('error priority does not override exact counts, Part slots or difficulty',()=>{
 const units=priorityPool().map(u=>u.personalAccuracy===60?{...u,accuracy:0}:u);
 const module=buildBatch(units,{...options,channels:['listening'],count:1,mode:'review'}).sets[0].modules[0];
 assert(module.items.every(i=>i.personalAccuracy===70));assert(Math.abs(module.difficulty-3.75)<1e-9);
});
test('batch uses the weakest remaining old passages without repeating them',()=>{
 const batch=buildBatch(priorityPool(),{...options,channels:['listening'],count:2,mode:'review'});
 assert(batch.sets[0].modules[0].items.every(i=>i.personalAccuracy===60));
 assert(batch.sets[1].modules[0].items.every(i=>i.personalAccuracy===70));
});
test('personal score is latest user accuracy, not population accuracy or all-time worst',()=>{
 const album={id:'a',channel:'reading'},u={id:'u',partId:'p',mixedSlot:'P1',mixedSelectable:true,progressStatus:'done',averageAccuracy:30,myAccuracy:60,lastAttemptAt:'2026-10-01 12:00:00'};
 const out=normalize([{album,units:[u]},{album:{...album,id:'b'},units:[{...u,myAccuracy:90,lastAttemptAt:'2026-10-30 12:00:00'}]}]);
 assert.equal(out[0].personalAccuracy,90);assert.equal(out[0].accuracy,30);
 assert.equal(normalize([{album,units:[{...u,myAccuracy:null}]}])[0].personalAccuracy,null);
});

test('training margin uses personal forty-question totals and does not label them exam ability',()=>{
 assert.equal(trainingFeedback(9,10),'');assert.equal(trainingFeedback(-1,40),'');
 assert.match(trainingFeedback(29,40),/还差 1 题/);
 for(const n of [30,31,32])assert.match(trainingFeedback(n,40),/达到训练目标/);
 assert.match(trainingFeedback(33,40),/超过训练目标/);
 assert.match(trainingFeedback(30,40),/非考试定级/);
});