import {CHANNELS,normalize,buildBatch,buildWithReviewFallback,examQuestionCount,reviewStats,bandReference,validateWritingDetail} from './engine.mjs';
import {parseTime,paperItems,paperStatus,allPapers,activePaper,syncRecords,pruneExpired,readState,pendingKeys,removePaper} from './records.mjs';
import {aggregateDifficulty,difficultyRank,compareRanks} from './difficulty.mjs';

// This module adds an isolated panel. Native answer screens, requests and submissions stay intact.
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./panel.css',import.meta.url);document.head.append(style);
const launch=document.createElement('button');launch.id='xxgg-plan-launch';launch.textContent='智能练习';launch.hidden=true;document.body.append(launch);
const root=document.createElement('div');root.id='xxgg-plan-root';root.hidden=true;document.body.append(root);
root.innerHTML=`<div class="xp-dialog" role="dialog" aria-modal="true" aria-labelledby="xp-title"><div class="xp-header"><div><h2 id="xp-title">智能练习</h2><small>在原题库练习 · 按你的进度组题</small></div><button data-action="close" aria-label="关闭智能练习">关闭 ×</button></div><div class="xp-body">
<div class="xp-grid"><section><h3>① 选择内容</h3><div id="xp-subjects">${Object.entries(CHANNELS).map(([key,name])=>`<label><input type="checkbox" name="channel" value="${key}" ${key==='listening'?'checked':''}>${name}</label>`).join('')}</div><div class="xp-row"><small>题库来源（可多选）</small><button data-action="albums-all">全选当前科目</button></div><div class="xp-albums" id="xp-albums">打开后读取目录…</div></section>
<section><h3>② 设置搭配</h3><div id="xp-writing-options" hidden><p>写作内容：<label><input type="checkbox" name="writing-task" value="Task1" checked>小作文（Task 1）</label><label><input type="checkbox" name="writing-task" value="Task2" checked>大作文（Task 2）</label></p><p class="xp-note">只抽选原软件写作题库中的原题。可只选一种或两种都选。混合模式只选一种时，按本批套数分配新旧题；一套无法各占一半。</p></div><p><label>练习模式 <select id="xp-mode"><option value="fresh">全部新题</option><option value="mixed">新题＋做过的题（错多优先）</option><option value="review">全部重做（错多优先）</option></select></label></p><p><label>混合时新题占比 <select id="xp-ratio"><option value="0.33">约 1/3</option><option value="0.5" selected>约 1/2</option><option value="0.67">约 2/3</option></select></label><label>生成 <input id="xp-count" type="number" min="1" max="10" value="1" style="width:65px"> 套</label></p><p><label>整体难度 <select id="xp-difficulty"><option value="relaxed">1.0–2.0 · 轻松</option><option value="easy">2.0–3.0 · 基础</option><option value="reference">3.0–3.5 · 接近参照</option><option value="normal" selected>3.5–4.0 · 强化（默认）</option><option value="hard">4.0–5.0 · 挑战</option></select></label></p><label class="xp-note"><input id="xp-deviation" type="checkbox" checked>目标难度组不出时，允许显示偏简单 / 偏难的备选卷</label><p class="xp-note">1–5 档是相对练习难度，不是雅思分数。按题数加权软件平均正确率，目标内再优先选你错得多的旧题。写作只按题型搭配。</p><details class="xp-note"><summary>参照样本与计算方式</summary><p>你的目标：6.5 分，训练留余量。听力、学术阅读每科以 30–32/40（错 8–10 题）为训练目标；首次作答、限时完成更适合检查进步，重做成绩单独看。该目标是备考建议，不是考试保证。软件群体平均正确率不等于你的预计成绩，3.5–4 档也不等于 6.5 或 7 分。</p><p>阅读参照：2024-04-13 新航道回忆三篇（Rubber、Herbal Medicines、Star Performers），题型、特征题干和 40 题结构核对。该组软件加权平均正确率 65.06%，定义为 3 档；每降低 10 个百分点增加 1 档。默认 3.5–4 档，即约 55.06%–60.06%，优先靠近 57.56%。<a href="https://www.xhd.cn/ielts/jijing/189427.html" target="_blank" rel="noopener">回忆来源</a></p><p>听力尚未匹配到同版本完整四篇，暂以固定题库参照 64.52% 为 3 档，不能称为已完成真实考试校准。已检查你提供的剑雅 20、21 共 8 套听力题：均为 P1、P4 各 10 道填空，P2、P3 为选择或匹配类。此为题型结构参考，不是难度等值证据；当前组题仍按题库题型覆盖搭配，不保证逐套复制此比例。统计缺少参与人数及首次作答分布，只能估计相对难度。</p></details><p><label><input type="checkbox" id="xp-review-fallback">难度无法满足时，允许用做过的题补足</label></p><p class="xp-note">听力、阅读先按所选新旧模式寻找目标难度；找不到时逐步增加旧题。仍保留每科 40 题、Part 结构及去重，旧题会明确标注。不会使用其他未完成卷占用的题。</p></section></div>
<section><div class="xp-row"><div><h3>③ 我的练习卷</h3><small>每套独立记录；听力 4 篇、阅读 3 篇、写作按勾选内容抽 1 或 2 篇。</small></div><div class="xp-actions"><button data-action="refresh">刷新提交结果</button><button class="xp-primary" data-action="generate">生成练习</button></div></div><p id="xp-access" class="xp-note"></p><div class="xp-status" role="status" aria-live="polite" id="xp-status"></div><div id="xp-delete-confirm" hidden></div><div id="xp-paper-list"></div><div id="xp-plans"></div></section>
<section><div class="xp-row"><h3>今日练习小结</h3><button data-action="summary">更新小结</button></div><div id="xp-summary" class="xp-muted">完成练习后，回到这里刷新。</div><p class="xp-note">仅统计通过本入口开始并核对成功的提交。分篇完成后累加题数；并非连续限时模考。写作不计分，重做与首次练习分别显示。<a href="https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail" target="_blank" rel="noopener">分数参考依据</a></p></section>
<p class="xp-note">本地增强 0.12 · 每套记录可手动删除；已完成篇目可直接重新做；重做记入原软件历史，不重复计入原套卷及今日小结。完成记录保留 7 天。仅清理本地增强记录，原软件历史保留。软件关闭期间的到期记录，下次启动时清理。</p></div></div>`;
const $=id=>root.querySelector('#'+id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=o=>Array.isArray(o)?o:o?.list||[];
const date=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
const timestamp=parseTime;
let api,router,session='',account='',albums=[],catalogs=[],units=[],plans=[],selectedSetId='',pendingDelete='',busy=false,lastFocus,entitled=false;
const key=()=>`xxgg.smart-practice.v1.${account}`;
function status(text,error=false){$('xp-status').textContent=text;$('xp-status').dataset.error=String(error);}
function save(){if(!account)throw new Error('请先登录。');sameSession();plans=pruneExpired(plans);localStorage.setItem(key(),JSON.stringify({version:2,plans,selectedSetId}));}
function sameSession(){if(!session||localStorage.getItem('token')!==session)throw new Error('登录状态已变化，请关闭并重新打开智能练习。');}
async function request(path,params={}){sameSession();const result=await api.request(path,params,'GET',{skipAuth:false,deferAuthExpired:true});sameSession();return result;}
function channels(){return [...root.querySelectorAll('[name=channel]:checked')].map(n=>n.value);}
function renderAlbums(){
 const enabled=channels();$('xp-writing-options').hidden=!enabled.includes('writing');const previous=new Set([...root.querySelectorAll('[name=album]:checked')].map(n=>n.value));
 $('xp-albums').innerHTML=albums.filter(a=>enabled.includes(a.channel)).map(a=>`<label><input type="checkbox" name="album" value="${esc(a.id)}" ${previous.has(String(a.id))||!previous.size?'checked':''}><span>${esc(a.title)} <small>${esc(CHANNELS[a.channel])} · ${a.unitCount??'?'} 篇</small></span></label>`).join('')||'请先选择科目。';
}
async function loadCatalog(){
 const [lr,w,e]=await Promise.all([request('/practice/v1/albums',{includeEntryModes:'exam'}),request('/practice/v1/units/writing/albums'),request('/practice/v1/me/feature-entitlements')]);
 account=String(e.userId||'');if(!account)throw new Error('无法识别当前账号，暂不保存计划。');
 entitled=e.entitlements?.mixed_practice===true;
 albums=[...list(lr).filter(a=>['listening','reading'].includes(a.channel)&&a.hidden!==true&&a.mixedPracticeVisible!==false),...list(w).map(a=>({...a,channel:'writing'}))];
 $('xp-access').textContent=entitled?'当前使用原软件分篇练习入口，提交后回此处继续下一篇；不自动提交任何答案。':'账号暂未开通原软件的合并组卷权限。本增强入口按搭配顺序打开原单篇练习，完成后汇总，不绕过权限。';
 const stored=readState(localStorage.getItem(key()));plans=stored.plans;selectedSetId=stored.selectedSetId;save();
 renderAlbums();renderPlans();renderSummary();
}
async function fetchCatalogs(){
 // Load completion metadata from all eligible albums, so duplicates inherit a submitted status.
 const output=[];
 for(let offset=0;offset<albums.length;offset+=4){
  const chunk=await Promise.all(albums.slice(offset,offset+4).map(async album=>{
   const path=album.channel==='writing'?`/practice/v1/units/writing/albums/${encodeURIComponent(album.id)}/units`:`/practice/v1/albums/${encodeURIComponent(album.id)}/units`;
   return {album,units:list(await request(path,{includeEntryModes:'exam'}))};
  }));output.push(...chunk);status(`正在核对题库和提交记录… ${output.length}/${albums.length}`);
 }
 catalogs=output;units=normalize(catalogs);
}
async function getCount(u){
 if(u.channel==='writing'){await checkWriting(u);return;}
 if(u.questionCount===null){const exam=await request(`/practice/v1/units/${encodeURIComponent(u.unitId)}/exam`);u.questionCount=examQuestionCount(exam,u.partId);
  if(exam.parts.length!==1)throw new Error('这道题的原入口包含多篇，暂不支持分篇计划，请换题。');}
}
async function checkWriting(item){
 const detail=await request(`/practice/v1/units/writing/${encodeURIComponent(item.unitId)}`,{albumId:item.albumId});
 try{validateWritingDetail(detail,item);}catch(err){err.invalidWriting=true;throw err;}
}
async function generate(){
 const selected=[...root.querySelectorAll('[name=album]:checked')].map(n=>n.value);
 const opts={channels:channels(),albums:selected,mode:$('xp-mode').value,newRatio:Number($('xp-ratio').value),count:Number($('xp-count').value),difficulty:$('xp-difficulty').value,writingTasks:[...root.querySelectorAll('[name=writing-task]:checked')].map(n=>n.value),allowDeviation:$('xp-deviation').checked,allowReviewFallback:$('xp-review-fallback').checked,seed:Date.now()};
 // Validate input before any potentially slow reads.
 if(!opts.channels.length||!selected.length)throw new Error('请勾选科目和对应题库。');
 if(!Number.isInteger(opts.count)||opts.count<1||opts.count>10)throw new Error('一次可生成 1–10 套。');
 if(opts.channels.includes('writing')&&!opts.writingTasks.length)throw new Error('请至少选择小作文或大作文。');
 await fetchCatalogs();
 const plan={version:1,id:String(opts.seed),createdAt:new Date().toISOString(),options:opts,sets:[]};
 const used=pendingKeys(plans),coverage=new Map(),invalidWriting=new Set();
 for(let k=0;k<opts.count;k++){
  const set={id:`${opts.seed}-${k}`,number:k+1,modules:[]};
  for(const channel of opts.channels){
   let chosen,bestFallback;
   for(let attempt=0;attempt<35;attempt++){
    const available=units.filter(u=>!used.has(u.key)&&!invalidWriting.has(u.key));
    const moduleMode=channel==='writing'&&opts.writingTasks.length===1&&opts.mode==='mixed'?(Math.round((k+1)*opts.newRatio)-Math.round(k*opts.newRatio)?'fresh':'review'):opts.mode;
    const draft=buildWithReviewFallback(available,{...opts,mode:moduleMode,channels:[channel],count:1,priorCoverage:[...coverage],seed:opts.seed+k*7919+attempt*31+(channel==='reading'?7:channel==='writing'?11:0)}).sets[0].modules[0];
    try{for(const item of draft.items){const original=units.find(u=>u.key===item.key);try{await getCount(original);}catch(err){if(err.invalidWriting)invalidWriting.add(item.key);throw err;}item.questionCount=original.questionCount;}}catch(err){if(err.invalidWriting)continue;throw new Error(`核对原题时遇到问题：${err.message}`);}
    if(channel==='writing'){chosen=draft;break;}
    if(draft.items.reduce((a,u)=>a+u.questionCount,0)===40){
     draft.difficultyMeta=aggregateDifficulty(draft.items,channel,opts.difficulty);draft.difficulty=draft.difficultyMeta.level;
     if(draft.difficultyMeta.inRange){chosen=draft;break;}
     if(opts.allowDeviation&&(!bestFallback||compareRanks(difficultyRank(draft.difficultyMeta),difficultyRank(bestFallback.difficultyMeta))<0))bestFallback=draft;
     if(opts.allowDeviation&&attempt>=4)break;
    }
   }
   chosen ||= bestFallback;
   if(!chosen)throw new Error(channel==='writing'?'未能找到可打开且符合条件的写作原题，请扩大题库后重试。':`${CHANNELS[channel]}未能组成准确的 40 题，请扩大题库后重试。`);
   chosen.items.forEach(u=>{used.add(u.key);for(const tag of [...u.types,'topic:'+u.topic]){const key=channel+':'+tag;coverage.set(key,(coverage.get(key)||0)+1);}});set.modules.push(chosen);
   status(`正在核对第 ${k+1}/${opts.count} 套 · ${CHANNELS[channel]}…`);
  }plan.sets.push(set);
 }
 sameSession();plans.push(plan);selectedSetId=activePaper(plans)?.s.id||plan.sets[0].id;save();renderPlans();
 const warnings=plan.sets.flatMap(s=>s.modules.filter(m=>m.difficultyMeta&&!m.difficultyMeta.inRange).map(m=>`第 ${s.number} 套${CHANNELS[m.channel]}：${m.difficultyMeta.evaluation}${m.difficultyMeta.level==null?'':` ${m.difficultyMeta.level.toFixed(2)}/5`}，未达到目标区间。`));
 status(`已生成 ${opts.count} 套独立练习卷。${warnings.length?'\n'+warnings.join('\n'):'已核对原题；听阅档位显示在各科上方。'}${opts.channels.includes('writing')?'\n写作只含软件题库原题，已核对可加载。':''}\n未完成卷保留进度；整套提交后独立存档 7 天。`,warnings.length>0);
}
function allItems(){return plans.flatMap(p=>p.sets.flatMap(s=>s.modules.flatMap(m=>m.items.map(i=>({p,s,m,i})))));}
const paperTitle=s=>s.title || `第 ${s.number} 套`;
function renderPlans(){
 const papers=allPapers(plans);
 const current=papers.find(({s})=>s.id===selectedSetId)||activePaper(plans)||papers.find(({s})=>!s.completedAt)||papers.at(-1);
 if(!current){$('xp-paper-list').innerHTML='';$('xp-plans').innerHTML='<p class="xp-note">生成后，每套卷子都会独立显示在这里。</p>';return;}
 selectedSetId=current.s.id;
 const labels={queued:'待开始',active:'进行中 · 自动暂存',paused:'已暂停 · 可续做',completed:'已完成 · 独立存档'};
 const card=({p,s})=>{const state=paperStatus(s),done=paperItems(s).filter(i=>i.result).length;
  return `<button class="xp-paper ${s.id===selectedSetId?'xp-paper-selected':''}" data-view="${esc(s.id)}" aria-pressed="${s.id===selectedSetId}"><strong>${s.title?esc(paperTitle(s)):esc(new Date(p.createdAt).toLocaleString('zh-CN')+' · '+paperTitle(s))}</strong><span>${esc(s.modules.map(m=>CHANNELS[m.channel]).join('＋'))} · ${done}/${paperItems(s).length} 篇</span><small>${labels[state]}${s.completedAt?` · 到期 ${esc(new Date(s.expiresAt).toLocaleString('zh-CN'))}`:''}</small></button>`;};
 const drafts=papers.filter(({s})=>!s.completedAt),finished=papers.filter(({s})=>s.completedAt).sort((a,b)=>timestamp(b.s.completedAt)-timestamp(a.s.completedAt));
 $('xp-paper-list').innerHTML=`<h3 class="xp-list-title">待练与进行中（${drafts.length} 套）</h3><div class="xp-paper-grid">${drafts.map(card).join('')||'<small>暂无未完成卷。</small>'}</div><h3 class="xp-list-title">最近 7 天已完成（${finished.length} 套）</h3><div class="xp-paper-grid">${finished.map(card).join('')||'<small>整套所选内容全部提交后，记录会出现在这里。</small>'}</div>`;
 const {p,s}=current;
 $('xp-plans').innerHTML=`<div class="xp-set" data-paper="${esc(s.id)}"><div class="xp-row"><h3>${esc(paperTitle(s))} · ${labels[paperStatus(s)]}</h3><div class="xp-actions">${s.startedAt&&!s.completedAt&&!s.pausedAt?`<button data-pause="${esc(s.id)}">暂存并暂停本套</button>`:''}<button data-delete="${esc(s.id)}">删除本套记录</button></div></div><p class="xp-note">卷号 ${esc(s.id)} · ${esc({fresh:'全部新题',mixed:'新旧混合',review:'全部重做',fixed:'题材练习'}[p.options?.mode]||'练习')} · ${esc(new Date(p.createdAt).toLocaleString('zh-CN'))}${s.completedAt?`<br>完成 ${esc(new Date(s.completedAt).toLocaleString('zh-CN'))} · ${esc(new Date(s.expiresAt).toLocaleString('zh-CN'))} 自动清理；成绩已固定。`:'<br>进度仅作临时保存，所选科目全部完成后才形成正式记录。可暂停后切换另一套。'}</p>${s.modules.map(m=>{
 const total=m.items.reduce((a,i)=>a+(i.result?.total||0),0),correct=m.items.reduce((a,i)=>a+(i.result?.correct||0),0),done=m.items.every(i=>i.result);
 const frozen=s.snapshot?.modules?.find(v=>v.channel===m.channel);
 const objective=m.channel!=='writing';
 const correctCount=frozen?.correct??correct, questionCount=frozen?.total??total;
 const submitted=m.items.filter(i=>i.result).length;
 const score=objective&&done?'已完成':`${submitted}/${m.items.length} 篇已提交`;
 const band=objective&&done&&questionCount===40&&correctCount>=23
  ? bandReference(correctCount,questionCount,m.channel) : '';
 const resultLabel=objective&&done
  ? `<small class="xp-result-count">${correctCount}/${questionCount}${band?' · '+esc(band):''}</small>` : '';
 const meta=m.difficultyMeta;
 const difficultyText=m.channel==='writing'?'按写作题型搭配':!meta?'旧版难度 · 未按新参照换算':`${meta.level==null?'无法估计':meta.level.toFixed(2)+'/5'} · ${meta.evaluation} · 目标 ${meta.min}–${meta.max}`;
 return `<div class="xp-module"><header><span>${esc(CHANNELS[m.channel])} <small>${esc(difficultyText)}</small></span><div class="xp-module-status"><small>${esc(score)}</small>${resultLabel}</div></header>${meta?`<p class="xp-note">${esc(meta.referenceLabel)}${meta.weightedAccuracy==null?'':` · 本套软件加权平均正确率 ${meta.weightedAccuracy.toFixed(2)}%`}${meta.inRange?'':`<br>${esc(meta.deviationReason)}`}</p>`:''}${m.reviewFallback?`<p class="xp-note">已启用旧题补足：${m.reviewFallback.newCount} 篇新题＋${m.reviewFallback.oldCount} 篇旧题（比原模式多 ${m.reviewFallback.extraOld} 篇旧题）。</p>`:''}${m.items.map(i=>`<div class="xp-item"><span>${esc(i.slot)}</span><div>${esc(i.title)}<small>${esc(i.titleZh)} · ${esc(i.albumTitle)}${i.accuracy==null?'':` · 平均 ${esc(i.accuracy)}%`}${i.seen&&i.channel!=='writing'&&i.personalAccuracy!=null?` · 上次正确率 ${esc(i.personalAccuracy)}%`:''}${i.result&&i.channel!=='writing'?` · 本次 ${i.result.correct}/${i.result.total}`:''}</small></div><span class="xp-tag">${i.seen?'重做':'新题'}</span><button ${i.result?'data-replay':'data-start'}="${esc(i.key)}" data-set="${esc(s.id)}" ${!i.result&&s.completedAt?'disabled':''} ${i.result?'title="直接重做此篇；原套卷成绩保留，本次提交记入原软件历史"':''}>${i.result?'重新做':i.startedAt?'继续 / 重做':'开始'}</button></div>`).join('')}</div>`;
 }).join('')}</div>`;
}
async function start(key,setId){
 const entry=allItems().find(e=>e.i.key===key&&e.s.id===setId);if(!entry)throw new Error('计划已变化，请刷新。');
 sameSession();const {i,p,s}=entry;if(i.result||s.completedAt)return;
 const active=activePaper(plans);if(active&&active.s.id!==s.id)throw new Error('另一套卷正在进行中。请先完成它，或在那套卷中点“暂存并暂停本套”，再切换。');
 // The native writing page keeps its draft by unit ID, so different tasks can be opened independently.
 const blocked=paperItems(s).some(other=>other!==i&&other.startedAt&&!other.result&&
  !(i.channel==='writing'&&other.channel==='writing'&&i.unitId!==other.unitId));
 if(blocked)throw new Error('本套还有已开始的篇目。请先提交并刷新结果，再开始下一篇。');
 // Recheck current mode before starting: a formerly new item may have been submitted elsewhere.
 const path=i.channel==='writing'?`/practice/v1/units/writing/albums/${i.albumId}/units`:`/practice/v1/albums/${i.albumId}/units`;
 const latest=list(await request(path));const item=latest.find(u=>String(u.unitId||u.id)===i.unitId);
 if(!item)throw new Error('题库中已找不到此题，请重新生成。');
 const fresh=normalize([{album:{id:i.albumId,channel:i.channel,title:i.albumTitle},units:[item]}])[0];
 if(!fresh)throw new Error('这道题目前不可用，请重新生成。');
 if(i.channel==='writing')await checkWriting(i);
 if(!i.startedAt&&fresh.seen!==i.seen&&p.options?.mode!=='fixed')throw new Error('这道题的提交状态已变化，请重新生成以保证新旧模式准确。');
 const nativeRouter=router || document.querySelector('#app')?.__vue_app__?.config.globalProperties.$router;
 if(!nativeRouter)throw new Error('原软件页面尚未就绪，请稍后重试。');
 const existingStartedAt=i.startedAt,existingSetStartedAt=s.startedAt,existingPausedAt=s.pausedAt;
 if(!i.startedAt&&p.options?.mode==='fixed'){i.seen=fresh.seen;i.personalAccuracy=fresh.personalAccuracy;}
 i.startedAt ||= new Date().toISOString();s.startedAt ||= i.startedAt;delete s.pausedAt;selectedSetId=s.id;
 if(!Object.hasOwn(i,'baselineAttemptId'))i.baselineAttemptId=String(item.resultId||item.latestAttemptId||'');
 save();
 const query={albumId:i.albumId,unitId:i.unitId,setId:i.unitId,setName:i.title,channel:i.channel,attemptMode:'fresh'};
 if(i.channel!=='writing')query.module=i.channel==='reading'?'2':'1';
 const name={listening:'ListeningExam',reading:'ReadingExam',writing:'WritingExam'}[i.channel];
 try{const failure=await nativeRouter.push({name,query});if(failure&&nativeRouter.currentRoute?.value?.name!==name)throw new Error('页面跳转未完成。');close();}catch(err){if(!existingStartedAt)delete i.startedAt;if(!existingSetStartedAt)delete s.startedAt;if(existingPausedAt)s.pausedAt=existingPausedAt;save();throw err;}
}
async function replay(key,setId){
 const entry=allItems().find(e=>e.i.key===key&&e.s.id===setId);
 if(!entry?.i.result)throw new Error('请先完成这篇练习，再使用重新做。');
 sameSession();const {i}=entry;
 if(allItems().some(({i:other})=>other.startedAt&&!other.result&&other.channel===i.channel&&other.unitId===i.unitId))throw new Error('这篇题目正在另一套卷中进行，请先完成并刷新那次提交，再重新做，避免成绩记入错误的套卷。');
 const path=i.channel==='writing'?`/practice/v1/units/writing/albums/${i.albumId}/units`:`/practice/v1/albums/${i.albumId}/units`;
 const latest=list(await request(path));
 const item=latest.find(u=>String(u.unitId||u.id)===i.unitId);
 if(!item||!normalize([{album:{id:i.albumId,channel:i.channel,title:i.albumTitle},units:[item]}]).length)throw new Error('这篇题目目前不可用，无法重新做。');
 if(i.channel==='writing')await checkWriting(i);
 const nativeRouter=router||document.querySelector('#app')?.__vue_app__?.config.globalProperties.$router;
 if(!nativeRouter)throw new Error('原软件页面尚未就绪，请稍后重试。');
 const query={albumId:i.albumId,unitId:i.unitId,setId:i.unitId,setName:i.title,channel:i.channel,attemptMode:'fresh'};
 if(i.channel!=='writing')query.module=i.channel==='reading'?'2':'1';
 const name={listening:'ListeningExam',reading:'ReadingExam',writing:'WritingExam'}[i.channel];
 const failure=await nativeRouter.push({name,query});
 if(failure&&nativeRouter.currentRoute?.value?.name!==name)throw new Error('页面跳转未完成。');
 // A replay uses the native history only; the original paper and its score stay immutable.
 close();
}
async function historyFor(day){
 const result=await request('/practice/v1/me/practice-history/records',{date:day,pageNo:1,pageSize:50});
 const records=[...(result.records||[])];
 for(let page=2;page<=Number(result.totalPages||1);page++)records.push(...((await request('/practice/v1/me/practice-history/records',{date:day,pageNo:page,pageSize:50})).records||[]));
 return records;
}
async function refresh(){
 const pending=allItems().filter(e=>e.i.startedAt&&!e.i.result);let completed=0;
 const histories=new Map(),warnings=[],claimed=new Set(allItems().filter(({i})=>i.result).map(({i})=>String(i.result.attemptId)));
 for(const {i} of pending){
  try{
   let result;
   if(i.channel==='writing'){
    const albumKey='writing:'+i.albumId;
    if(!histories.has(albumKey))histories.set(albumKey,list(await request(`/practice/v1/units/writing/albums/${i.albumId}/units`)));
    const item=histories.get(albumKey).find(u=>String(u.unitId||u.id)===i.unitId);
    const id=String(item?.reviewAttemptId||item?.latestAttemptId||'');
    if(item?.hasSubmitted&&id&&!claimed.has(id)&&id!==i.baselineAttemptId&&timestamp(item.submittedAt)>=new Date(i.startedAt).getTime()-2000)result={attemptId:id,completedAt:item.submittedAt,writing:true,total:0,correct:0,elapsedSeconds:null};
   }else{
    const days=[];let day=new Date(i.startedAt);const end=date(Date.now());
    for(let n=0;n<366;n++){const value=date(day);days.push(value);if(value===end)break;day=new Date(day.getTime()+86400000);}
    let records=[];
    for(const day of days){if(!histories.has(day))histories.set(day,await historyFor(day));records.push(...histories.get(day));}
    const record=records.filter(r=>String(r.unitId)===i.unitId&&!claimed.has(String(r.attemptId))&&String(r.attemptId)!==i.baselineAttemptId&&timestamp(r.completedAt)>=new Date(i.startedAt).getTime()-2000).sort((a,b)=>timestamp(a.completedAt)-timestamp(b.completedAt))[0];
    if(record){const stats=reviewStats(await request(`/practice/v1/results/${encodeURIComponent(record.attemptId)}/review`));
     if(stats.total!==i.questionCount)throw new Error('实际提交题数与计划不一致，未自动计入。');
     result={...stats,attemptId:String(record.attemptId),completedAt:record.completedAt};}
   }
   if(result){i.result=result;claimed.add(String(result.attemptId));completed++;}
  }catch(err){warnings.push(`${i.title}：${err.message}`);}
 }
 const before=allPapers(plans).filter(({s})=>s.completedAt).length;
 save();const archived=allPapers(plans).filter(({s})=>s.completedAt).length-before;
 renderPlans();renderSummary();status(warnings.length?`已核对 ${completed} 篇。\n${warnings.join('\n')}`:archived?`已核对 ${completed} 篇，${archived} 套已全部完成并独立存档，保留 7 天。`:completed?`已核对 ${completed} 篇提交，进度已暂存，可继续本套下一篇。`:'暂未发现新的已提交结果。请在原页面提交后再刷新。',warnings.length>0);
}
function renderSummary(){
 const today=date(Date.now());const seenAttempts=new Set();
 const entries=allItems().filter(({i})=>{if(!i.result||date(timestamp(i.result.completedAt))!==today||seenAttempts.has(i.result.attemptId))return false;seenAttempts.add(i.result.attemptId);return true;});
 const items=entries.map(e=>e.i),objective=items.filter(i=>i.channel!=='writing');
 const time=objective.reduce((a,i)=>a+(i.result.elapsedSeconds||0),0),unknown=objective.filter(i=>i.result.elapsedSeconds===null).length;
 const completeSets=allPapers(plans).filter(({s})=>s.completedAt&&date(timestamp(s.completedAt))===today).length;
 $('xp-summary').innerHTML=`<div class="xp-summary"><div><strong>${completeSets}</strong>套已完成</div><div><strong>${items.length}</strong>篇 / 篇次</div></div><p class="xp-note">客观题记录用时 ${Math.round(time/60)} 分钟${unknown?`（${unknown} 篇缺少用时）`:''} · 写作 ${items.filter(i=>i.channel==='writing').length} 篇</p>`+['listening','reading'].map(channel=>{
  return [false,true].map(seen=>{const group=items.filter(i=>i.channel===channel&&i.seen===seen);const n=group.reduce((a,i)=>a+i.result.total,0),c=group.reduce((a,i)=>a+i.result.correct,0);return `<div class="xp-score xp-note">${CHANNELS[channel]} · ${seen?'重做':'首次'}：${group.length} 篇，${c}/${n} 题</div>`;}).join('');
 }).join('')+'<p class="xp-note">听力或阅读整科 40 题完成后，答对至少 23 题才显示分数参考。</p>';
}
async function run(action){if(busy)return;busy=true;root.querySelectorAll('button:not([data-action=close]),select,input').forEach(n=>n.disabled=true);
 try{await action();}catch(err){status(err.message||'操作失败，请稍后重试。',true);}finally{busy=false;root.querySelectorAll('button,select,input').forEach(n=>n.disabled=false);renderPlans();$('xp-ratio').disabled=$('xp-mode').value!=='mixed';}}
async function open(){
 lastFocus=document.activeElement;root.hidden=false;root.querySelector('[data-action=close]').focus();
 await run(async()=>{status('正在读取原软件目录…');
  session=localStorage.getItem('token')||'';if(!session)throw new Error('请先在原软件登录。');
  if(!api){const native=await import('../assets/index-7YkHW729.js');api=native.q;}
  router=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$router;
  await loadCatalog();status('计划仅在本机保存。选择内容后生成；提交后回来继续。');
  if(allItems().some(({i})=>i.startedAt&&!i.result))await refresh();
 });
}
function close(){root.hidden=true;pendingDelete='';$('xp-delete-confirm').hidden=true;lastFocus?.focus?.();}
// BEGIN draggable launcher
const launcherPositionKey='xxgg.smart-practice.launcher-position.v1';
let launcherPosition=null,launcherDrag=null,suppressLauncherClickUntil=0;
try{const p=JSON.parse(localStorage.getItem(launcherPositionKey));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))launcherPosition=p;}catch{}
function positionLauncher(){
 if(!launcherPosition)return;
 const w=launch.offsetWidth||110,h=launch.offsetHeight||48;
 const maxX=Math.max(0,innerWidth-w),maxY=Math.max(0,innerHeight-h);
 launch.style.left=Math.round(Math.min(1,Math.max(0,launcherPosition.x))*maxX)+'px';
 launch.style.top=Math.round(Math.min(1,Math.max(0,launcherPosition.y))*maxY)+'px';
 launch.style.right='auto';launch.style.bottom='auto';
}
launch.title='点击打开智能练习；按住拖动可调整位置';
launch.style.touchAction='none';launch.style.userSelect='none';
launch.addEventListener('pointerdown',e=>{
 if(e.button!==0||!e.isPrimary)return;
 const r=launch.getBoundingClientRect();launcherDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};
 launch.setPointerCapture(e.pointerId);
});
launch.addEventListener('pointermove',e=>{
 const d=launcherDrag;if(!d||d.id!==e.pointerId)return;
 const dx=e.clientX-d.x,dy=e.clientY-d.y;
 if(!d.moved&&Math.hypot(dx,dy)<6)return;
 d.moved=true;launch.style.cursor='grabbing';
 const maxX=Math.max(0,innerWidth-launch.offsetWidth),maxY=Math.max(0,innerHeight-launch.offsetHeight);
 launcherPosition={x:maxX?Math.min(maxX,Math.max(0,d.left+dx))/maxX:0,y:maxY?Math.min(maxY,Math.max(0,d.top+dy))/maxY:0};
 positionLauncher();e.preventDefault();
});
function finishLauncherDrag(e){
 const d=launcherDrag;if(!d||d.id!==e.pointerId)return;
 if(d.moved){suppressLauncherClickUntil=Date.now()+500;try{localStorage.setItem(launcherPositionKey,JSON.stringify(launcherPosition));}catch{}}
 launcherDrag=null;launch.style.cursor='pointer';
 if(launch.hasPointerCapture(e.pointerId))launch.releasePointerCapture(e.pointerId);
}
launch.addEventListener('pointerup',finishLauncherDrag);
launch.addEventListener('pointercancel',finishLauncherDrag);
launch.addEventListener('lostpointercapture',finishLauncherDrag);
launch.addEventListener('click',e=>{if(e.detail!==0&&Date.now()<suppressLauncherClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('resize',positionLauncher);
new ResizeObserver(positionLauncher).observe(launch);
positionLauncher();
// END draggable launcher
launch.addEventListener('click',open);
root.addEventListener('change',e=>{if(e.target.name==='channel')renderAlbums();if(e.target.id==='xp-mode')$('xp-ratio').disabled=e.target.value!=='mixed';});
root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
 if(button.dataset.delete){if(busy)return;pendingDelete=button.dataset.delete;const paper=allPapers(plans).find(({s})=>s.id===pendingDelete);if(!paper)return;
  $('xp-delete-confirm').innerHTML=`<div role="alertdialog" aria-label="确认删除本套记录"><strong>删除「${esc(paperTitle(paper.s))}」的本地记录？</strong><p>卷号 ${esc(pendingDelete)}。本套的临时进度或存档成绩将从智能练习中移除，今日小结也会扣除对应统计。原软件的答案和历史保留。</p><div class="xp-actions"><button data-action="delete-cancel">取消</button><button data-action="delete-confirm">确认删除本套</button></div></div>`;
  $('xp-delete-confirm').hidden=false;$('xp-delete-confirm').querySelector('button').focus();return;
 }
 if(button.dataset.view){if(busy)return;selectedSetId=button.dataset.view;try{save();renderPlans();}catch(err){status(err.message,true);}return;}
 if(button.dataset.pause){run(async()=>{await refresh();const entry=allPapers(plans).find(({s})=>s.id===button.dataset.pause);if(entry&&!entry.s.completedAt){entry.s.pausedAt=new Date().toISOString();save();renderPlans();status('本套进度已暂存并暂停，可以选择另一套；以后可从原进度继续。');}});return;}
 if(button.dataset.replay){run(()=>replay(button.dataset.replay,button.dataset.set));return;}
 if(button.dataset.start){run(()=>start(button.dataset.start,button.dataset.set));return;}
 switch(button.dataset.action){case 'close':close();break;case 'delete-cancel':pendingDelete='';$('xp-delete-confirm').hidden=true;break;case 'delete-confirm':run(async()=>{sameSession();if(!pendingDelete)return;const id=pendingDelete;plans=removePaper(plans,id);if(selectedSetId===id)selectedSetId='';save();pendingDelete='';$('xp-delete-confirm').hidden=true;renderPlans();renderSummary();status('已删除本套本地记录，其他套卷及原软件做题历史保留。');});break;case 'generate':run(generate);break;case 'refresh':case 'summary':run(refresh);break;case 'albums-all':root.querySelectorAll('[name=album]').forEach(n=>n.checked=true);break;}
});
root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const focus=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];const first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function routeVisibility(){
 const inExam= /(?:listening|reading|writing)-exam/.test(location.hash+location.pathname);
 launch.hidden=inExam||!localStorage.getItem('token');
 if(inExam)root.hidden=true;
 if(session&&localStorage.getItem('token')!==session){session='';account='';plans=[];selectedSetId='';pendingDelete='';$('xp-delete-confirm').hidden=true;units=[];catalogs=[];albums=[];root.hidden=true;$('xp-paper-list').textContent='';$('xp-plans').textContent='';$('xp-summary').textContent='';}
}
setInterval(routeVisibility,1000);window.addEventListener('hashchange',routeVisibility);routeVisibility();
function cleanupLocalRecords(){
 if(busy)return;
 for(let n=localStorage.length-1;n>=0;n--){const storageKey=localStorage.key(n);if(!storageKey?.startsWith('xxgg.smart-practice.v1.'))continue;
  try{const raw=localStorage.getItem(storageKey),state=readState(raw);const next=JSON.stringify(state);
   if(next!==raw)localStorage.setItem(storageKey,next);
   if(account&&storageKey===key()){plans=state.plans;selectedSetId=state.selectedSetId;if(!root.hidden){renderPlans();renderSummary();}}
  }catch{/* A corrupt record is preserved, never silently reset. */}
 }
}
cleanupLocalRecords();setInterval(cleanupLocalRecords,60000);
