import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildWithReviewFallback} from '../plugin/engine.mjs';
const opts={channels:['listening'],albums:['a'],mode:'fresh',difficulty:'normal',count:1,seed:42,allowReviewFallback:true};
const pool=Array.from({length:4},(_,s)=>[false,true].map(seen=>({key:`${s}-${seen}`,channel:'listening',slot:`P${s+1}`,albums:['a'],seen,accuracy:seen?57:95,questionCount:10,types:[],topic:'x'}))).flat();
test('off preserves fresh-only restriction',()=>{assert.throws(()=>buildWithReviewFallback(pool,{...opts,allowReviewFallback:false}));});
test('old fallback meets target, exact40 and retains seen labels',()=>{const m=buildWithReviewFallback(pool,opts).sets[0].modules[0];assert(m.difficultyMeta.inRange);assert(m.reviewFallback);assert(m.items.some(i=>i.seen));assert.equal(m.items.reduce((n,i)=>n+i.questionCount,0),40);assert.equal(new Set(m.items.map(i=>i.key)).size,4);});
test('does not substitute old when fresh target is feasible',()=>{const m=buildWithReviewFallback(pool.map(i=>({...i,accuracy:57})),opts).sets[0].modules[0];assert(m.items.every(i=>!i.seen));assert(!m.reviewFallback);});
test('never invents absent slots or relaxes 40 questions',()=>{assert.throws(()=>buildWithReviewFallback(pool.filter(i=>i.slot!=='P4'),opts));assert.throws(()=>buildWithReviewFallback(pool.map(i=>({...i,questionCount:9})),opts));});

