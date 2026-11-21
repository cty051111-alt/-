const {createRequire}=require('node:module');
const req=require;
const {chromium}=req('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..','plugin');
const mock=`
const album={id:'a',channel:'listening',title:'D家听力测试',unitCount:96,mixedPracticeVisible:true};
const units=Array.from({length:4},(_,s)=>Array.from({length:24},(_,k)=>({id:s+'-'+k,partId:s+'-'+k,mixedSlot:'P'+(s+1),mixedSelectable:true,available:true,progressStatus:k%2?'todo':'done',resultId:k%2?null:'old',myAccuracy:k%2?null:30+k*2,averageAccuracy:55+k,title:'Listening '+s+'-'+k,titleZh:'测试题',parts:[{questionTypes:[{type:k%2?'matching':'fill-in-the-blank'}]}]}))).flat();
window.__testUnits=units;
export const q={request:async(path,params)=>{
 if(path.endsWith('feature-entitlements'))return {userId:'test',entitlements:{mixed_practice:false}};
 if(path.endsWith('/writing/albums'))return {list:[]};
 if(path==='/practice/v1/albums')return {list:[album]};
 if(path.includes('/albums/a/units'))return {list:units};
 if(path.endsWith('/exam')){const id=path.split('/').at(-2);return {parts:[{id,total:10,groups:[{questions:Array.from({length:10},(_,i)=>({qNumber:i+1}))}]}]};}
 if(path.includes('/practice-history/records'))return {records:window.__testRecords||[],totalPages:1};
 if(path.endsWith('/review'))return {attempt:{correctCount:7,totalCount:10,elapsedSeconds:120}};
 throw new Error('Unexpected path '+path);
}};`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let content,type='text/javascript';
 if(url.pathname==='/'){type='text/html';content='<html><meta charset="utf-8"><div id="app"></div><script>localStorage.setItem("token","mock-session");document.querySelector("#app").__vue_app__={config:{globalProperties:{$router:{push:async r=>{window.__lastRoute=r;location.hash="/listening-exam";}}}}};</script><script type="module" src="/xxgg-enhanced/panel.mjs"></script></html>';}
 else if(url.pathname==='/assets/index-7YkHW729.js')content=mock;
 else if(url.pathname.startsWith('/xxgg-enhanced/')){const file=path.basename(url.pathname);if(!['engine.mjs','panel.mjs','panel.css','records.mjs','difficulty.mjs','calibration.mjs'].includes(file)){res.writeHead(404);res.end();return;}content=fs.readFileSync(path.join(base,file));if(file.endsWith('.css'))type='text/css';}
 else {res.writeHead(404);res.end();return;}res.setHeader('content-type',type);res.end(content);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1100,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#xxgg-plan-launch').click();await page.getByRole('button',{name:'生成练习',exact:true}).waitFor();
  await page.selectOption('#xp-mode','mixed');await page.locator('#xp-count').fill('2');await page.getByRole('button',{name:'生成练习',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已生成 2 套'));
  assert.equal(await page.locator('.xp-paper').count(),2);assert.equal(await page.locator('.xp-item').count(),4);assert.equal(await page.locator('.xp-tag',{hasText:'新题'}).count(),2);assert.equal(await page.locator('.xp-tag',{hasText:'重做'}).count(),2);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert(saved.plans[0].sets[0].modules[0].items.filter(i=>i.seen).every(i=>i.personalAccuracy===30));
  assert.match(await page.locator('#xp-plans').textContent(),/上次正确率 30%/);
  await page.screenshot({path:path.join(base,'../artifacts/ui-preview.png'),fullPage:true});
  await page.getByRole('button',{name:'开始',exact:true}).first().click();await page.waitForFunction(()=>window.__lastRoute);
  const route=await page.evaluate(()=>window.__lastRoute);assert.equal(route.name,'ListeningExam');assert.equal(route.query.channel,'listening');assert.equal(route.query.attemptMode,'fresh');
  await page.evaluate(()=>{location.hash='/';window.__testRecords=[{unitId:window.__lastRoute.query.unitId,attemptId:'new-result',completedAt:new Date(Date.now()+1000).toISOString()}]});
  await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已核对 1 篇'));
  assert.equal(await page.getByRole('button',{name:'重新做',exact:true}).count(),1);assert.match(await page.locator('#xp-summary').textContent(),/7\/10/);
  // A submitted passage can be replayed without changing the partially completed paper.
  const partialBefore=await page.evaluate(()=>localStorage.getItem('xxgg.smart-practice.v1.test'));
  await page.getByRole('button',{name:'重新做',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#xxgg-plan-root').hidden);
  assert.deepEqual(await page.evaluate(()=>window.__lastRoute),route);
  assert.equal(await page.evaluate(()=>localStorage.getItem('xxgg.smart-practice.v1.test')),partialBefore);
  await page.evaluate(()=>{location.hash='/';window.__testRecords.push({unitId:window.__lastRoute.query.unitId,attemptId:'extra-replay',completedAt:new Date(Date.now()+1500).toISOString()});});
  await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled);
  assert.equal(await page.evaluate(()=>localStorage.getItem('xxgg.smart-practice.v1.test')),partialBefore);
  const first=saved.plans[0].sets[0].id,second=saved.plans[0].sets[1].id;
  let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert.equal(state.plans[0].sets[0].snapshot,undefined,'partial work must not create a formal record');
  await page.locator(`[data-view="${second}"]`).click();await page.getByRole('button',{name:'开始',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('另一套卷正在进行中'));
  await page.locator(`[data-view="${first}"]`).click();await page.getByRole('button',{name:'暂存并暂停本套',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('本套进度已暂存并暂停'));
  await page.locator(`[data-view="${second}"]`).click();await page.getByRole('button',{name:'开始',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#xxgg-plan-root').hidden);
  // A deliberately duplicated attempt ID cannot leak from one paper into another.
  await page.evaluate(()=>{location.hash='/';window.__testRecords.push({unitId:window.__lastRoute.query.unitId,attemptId:'new-result',completedAt:new Date(Date.now()+1000).toISOString()});});
  await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('暂未发现'));
  assert.equal(await page.getByRole('button',{name:'重新做',exact:true}).count(),0);
  await page.evaluate(()=>window.__testRecords.push({unitId:window.__lastRoute.query.unitId,attemptId:'second-result',completedAt:new Date(Date.now()+1000).toISOString()}));
  await page.getByRole('button',{name:'刷新提交结果',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已核对 1 篇'));
  await page.getByRole('button',{name:'暂存并暂停本套',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('本套进度已暂存并暂停'));
  await page.locator(`[data-view="${first}"]`).click();
  for(let n=1;n<=3;n++){
   await page.getByRole('button',{name:'开始',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('#xxgg-plan-root').hidden);
   await page.evaluate(n=>{location.hash='/';window.__testRecords.push({unitId:window.__lastRoute.query.unitId,attemptId:'first-'+n,completedAt:new Date(Date.now()+1000).toISOString()});},n);
   await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已核对 1 篇'));
  }
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert.equal(state.plans[0].sets[0].snapshot.modules[0].total,40);assert.equal(state.plans[0].sets[0].snapshot.modules[0].correct,28);
  assert.equal(state.plans[0].sets[1].snapshot,undefined);assert.match(await page.locator('#xp-paper-list').textContent(),/最近 7 天已完成（1 套）/);
  const snapshot=JSON.stringify(state.plans[0].sets[0].snapshot);
  // An archived paper also permits replay; its frozen score and expiry must not change.
  const archivedBefore=await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')).plans[0].sets[0]));
  assert.equal(await page.getByRole('button',{name:'重新做',exact:true}).count(),4);
  await page.getByRole('button',{name:'重新做',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#xxgg-plan-root').hidden);
  await page.evaluate(()=>{location.hash='/';});await page.locator('#xxgg-plan-launch').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled);
  assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')).plans[0].sets[0])),archivedBefore);

  // Additional batches preserve old independent records and reserve unfinished papers' passages.
  await page.locator('#xp-count').fill('1');await page.getByRole('button',{name:'生成练习',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#xp-status').textContent.includes('已生成 1 套'));
  assert.equal(await page.locator('.xp-paper').count(),3);
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  const reserved=new Set(state.plans[0].sets[1].modules[0].items.map(i=>i.key));
  assert(state.plans[1].sets[0].modules[0].items.every(i=>!reserved.has(i.key)));
  assert.equal(JSON.stringify(state.plans[0].sets[0].snapshot),snapshot);
  assert.equal(state.plans[1].sets[0].modules[0].difficultyMeta.inRange,true);
  const third=state.plans[1].sets[0].id;
  await page.getByRole('button',{name:'删除本套记录',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('.xp-paper').count(),3);
  await page.getByRole('button',{name:'删除本套记录',exact:true}).click();await page.getByRole('button',{name:'确认删除本套',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.xp-paper').length===2);
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert(!state.plans.flatMap(p=>p.sets).some(s=>s.id===third));assert.equal(JSON.stringify(state.plans[0].sets[0].snapshot),snapshot);
  await page.reload();await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelectorAll('.xp-paper').length===2);
  await page.locator(`[data-view="${first}"]`).click();assert.match(await page.locator('#xp-plans').textContent(),/28\/40/);
  await page.screenshot({path:path.join(base,'../artifacts/ui-records-preview.png'),fullPage:true});
  // Simulate reopening after eight days; only completed local records should expire.
  await page.addInitScript(({future})=>{const Original=Date;globalThis.Date=class extends Original{constructor(...args){super(...(args.length?args:[future]));}static now(){return future;}};},{future:Date.now()+8*86400000});
  await page.reload();await page.locator('#xxgg-plan-launch').click();await page.waitForFunction(()=>document.querySelectorAll('.xp-paper').length===1);
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('xxgg.smart-practice.v1.test')));
  assert(!state.plans.flatMap(p=>p.sets).some(s=>s.id===first));assert(state.plans.flatMap(p=>p.sets).some(s=>s.id===second));
  await page.evaluate(()=>localStorage.setItem('token','different-account'));
  await page.waitForFunction(()=>document.querySelector('#xxgg-plan-root').hidden);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: completed passage replay and immutable archives, mixed selection, independent papers, pause/resume, attempt ownership, archive, batch preservation, reload, 7-day cleanup and account change');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
