const {createRequire}=require('node:module');
const req=require;
const {chromium}=req('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..','plugin');
const mock=`
const albums=[{id:'small',title:'小作文题库'},{id:'large',title:'大作文题库'}];
window.__catalog=albums.flatMap((a,s)=>Array.from({length:12},(_,k)=>({id:a.id+k,unitId:a.id+k,albumId:a.id,title:a.id+' '+k,writingTaskType:s?'task2_opinion':'task1_map',hasSubmitted:k%2===0,latestAttemptStatus:k%2===0?'submitted':null,latestAttemptId:k%2===0?'old'+k:null,parts:[{id:a.id+'p'+k}]})));
window.__detailReads=[];
export const q={request:async(path,params)=>{
 if(path.endsWith('feature-entitlements'))return {userId:'test',entitlements:{}};
 if(path==='/practice/v1/albums')return {list:[]};
 if(path.endsWith('/writing/albums'))return {list:albums};
 if(path.includes('/writing/albums/'))return {list:window.__catalog.filter(u=>path.includes('/'+u.albumId+'/'))};
 if(path.includes('/practice-history/records'))return {records:[],totalPages:1};
 if(path.startsWith('/practice/v1/units/writing/')){
  const id=path.split('/').at(-1),u=window.__catalog.find(u=>u.id===id);window.__detailReads.push(id);
  if(window.__detailError)throw new Error('原题暂时无法加载');
  if(window.__rejectFirst&&!window.__rejected){window.__rejected=id;return {unit:{id},parts:[]};}
  if(id===window.__rejected)return {unit:{id},parts:[]};
  return {unit:{id},parts:[{id:u.parts[0].id,writingTaskType:u.writingTaskType,groups:[{type:'writing',questions:[{id:'q'}]}]}]};
 }
 throw new Error('unexpected request '+path);
}};`;
const server=http.createServer((r,res)=>{
 const url=new URL(r.url,'http://localhost');let body,type='text/javascript';
 if(url.pathname==='/'){type='text/html';body='<html><meta charset="utf-8"><div id="app"></div><script>localStorage.setItem("token","writing-test");document.querySelector("#app").__vue_app__={config:{globalProperties:{$router:{push:async r=>{window.__lastRoute=r;location.hash="/writing-exam";}}}}};</script><script type="module" src="/xxgg-enhanced/panel.mjs"></script></html>';}
 else if(url.pathname==='/assets/index-7YkHW729.js')body=mock;
 else if(url.pathname.startsWith('/xxgg-enhanced/')){const file=path.basename(url.pathname);if(!['engine.mjs','panel.mjs','panel.css','records.mjs','difficulty.mjs','calibration.mjs'].includes(file)){res.writeHead(404).end();return;}body=fs.readFileSync(path.join(base,file));if(file.endsWith('.css'))type='text/css';}
 else{res.writeHead(404).end();return;}res.setHeader('content-type',type);res.end(body);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const tasks of [['Task1'],['Task2'],['Task1','Task2']]){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#xxgg-plan-launch').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action=generate]').disabled);
  await page.locator('[name=channel][value=listening]').uncheck();await page.locator('[name=channel][value=writing]').check();
  for(const task of ['Task1','Task2'])await page.locator('[name=writing-task][value='+task+']').setChecked(tasks.includes(task));
  for(const [id,task]of [['small','Task1'],['large','Task2']])await page.locator('[name=album][value='+id+']').setChecked(tasks.includes(task));
  await page.evaluate(()=>window.__rejectFirst=true);
  await page.getByRole('button',{name:'生成练习',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已生成 1 套'));
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  const items=stored.plans[0].sets[0].modules[0].items;assert.equal(items.length,tasks.length);assert(items.every(i=>tasks.includes(i.slot)));
  assert(items.every(i=>i.unitId!==stored.__rejected));
  const rejected=await page.evaluate(()=>window.__rejected);assert(items.every(i=>i.unitId!==rejected));
  assert.match(await page.locator('#xp-plans').textContent(),new RegExp('0/'+tasks.length+' 篇已提交'));
  // A failed detail check must not mark the paper as started.
  await page.evaluate(()=>window.__detailError=true);await page.getByRole('button',{name:'开始',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('原题暂时无法加载'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('xxgg.smart-practice.v1.test')),JSON.stringify(stored));
  await page.evaluate(()=>window.__detailError=false);await page.getByRole('button',{name:'开始',exact:true}).first().click();await page.waitForFunction(()=>window.__lastRoute);
  const route=await page.evaluate(()=>window.__lastRoute);assert.equal(route.name,'WritingExam');assert.equal(route.query.channel,'writing');assert.equal(route.query.albumId,items[0].albumId);assert.equal(route.query.unitId,items[0].unitId);assert.equal(route.query.attemptMode,'fresh');
  if(tasks.length===2){
   // Leaving an unsubmitted task must not prevent opening the other task in the same paper.
   await page.evaluate(()=>{window.__lastRoute=null;location.hash='/';});
   await page.locator('#xxgg-plan-launch').click();
   await page.getByRole('button',{name:'开始',exact:true}).click();
   await page.waitForFunction(()=>window.__lastRoute);
   assert.equal(await page.evaluate(()=>window.__lastRoute.query.unitId),items[1].unitId);
  }
  // Simulate native submission metadata, without making any live submissions.
  await page.evaluate(unitId=>{const u=window.__catalog.find(u=>u.id===unitId);Object.assign(u,{hasSubmitted:true,latestAttemptStatus:'submitted',latestAttemptId:'new-writing',reviewAttemptId:'new-writing',submittedAt:new Date(Date.now()+500).toISOString()});location.hash='/';},items[0].unitId);
  await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已核对 1 篇'));
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert.equal(Boolean(stored.plans[0].sets[0].completedAt),tasks.length===1);assert.equal(await page.getByRole('button',{name:'重新做',exact:true}).count(),1);
  assert.equal(errors.length,0);await context.close();
 }
 // Single-task mixed mode balances across the actual panel generation loop.
 const context=await browser.newContext();const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>!document.querySelector('[data-action=generate]').disabled);
 await page.locator('[name=channel][value=listening]').uncheck();await page.locator('[name=channel][value=writing]').check();await page.locator('[name=writing-task][value=Task1]').uncheck();await page.selectOption('#xp-mode','mixed');await page.locator('#xp-count').fill('4');
 await page.getByRole('button',{name:'生成练习',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已生成 4 套'));
 const items=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')).plans[0].sets.flatMap(s=>s.modules[0].items));assert.equal(items.length,4);assert.equal(items.filter(i=>i.seen).length,2);assert.equal(new Set(items.map(i=>i.key)).size,4);await context.close();
 console.log('PASS: native writing-only sources, Task1/Task2/both, invalid detail redraw, safe open failure, correct routes, single-task completion and mixed batch balance');
}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
