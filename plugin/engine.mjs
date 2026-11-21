// Pure selection logic. No network, answers or authentication data enter this module.
import {aggregateDifficulty,DIFFICULTY_BANDS,difficultyRank,compareRanks} from './difficulty.mjs';
export const CHANNELS = {listening:'听力',reading:'阅读',writing:'写作'};
export const slotsFor = (c,writingTasks=['Task1','Task2']) => c==='listening'?['P1','P2','P3','P4']:c==='reading'?['P1','P2','P3']:writingTasks;
export const isSeen = u => u.channel==='writing'
  ? u.hasSubmitted===true || u.latestAttemptStatus==='submitted'
  : u.progressStatus==='done' || !!u.resultId || !!u.lastAttemptAt;
const bounded = (n,a,b)=>Math.max(a,Math.min(b,n));
function personalAccuracy(u) {
  if(u.myAccuracy==null||u.myAccuracy==='')return null;
  const value=Number(u.myAccuracy);
  return Number.isFinite(value)&&value>=0&&value<=100?value:null;
}
// Error rate makes passages with different question counts comparable. Missing scores are not guessed.
const errorPriority=u=>u.seen&&u.channel!=='writing'&&u.personalAccuracy!=null?(100-u.personalAccuracy)/100:0;
export function normalize(catalogs) {
  const map = new Map();
  for (const {album,units} of catalogs) for (const u of units) {
    const channel = album.channel || u.channel;
    if (!Object.hasOwn(CHANNELS,channel)) continue;
    const writing = channel==='writing';
    if(writing&&(u.available===false||u.hidden===true||u.lockedForOrdinaryUsers===true))continue;
    if (!writing && (u.mixedSelectable!==true || u.available===false || u.lockedForOrdinaryUsers===true)) continue;
    const partId=String(u.partId || u.parts?.[0]?.partId || u.parts?.[0]?.id || u.id);
    const taskType=u.writingTaskType||u.parts?.[0]?.writingTaskType||'';
    const slot=writing ? (/^task1_/.test(taskType)?'Task1':/^task2_/.test(taskType)?'Task2':null) : u.mixedSlot;
    if (!slotsFor(channel).includes(slot)) continue;
    const key=channel+':'+partId;
    const old=map.get(key);
    if (old) {
      old.seen ||= isSeen({...u,channel});old.albums.push(String(album.id));
      const at=String(u.lastAttemptAt||'').replace(' ','T');
      if(at>old.personalAccuracyAt || (!at&&!old.personalAccuracyAt&&old.personalAccuracy===null)){
        old.personalAccuracy=personalAccuracy(u);old.personalAccuracyAt=at;
      }
      continue;
    }
    const accuracy = u.averageAccuracy==null ? null : Number(u.averageAccuracy);
    const types = writing ? [u.writingTaskType || slot] : [...new Set((u.parts||[]).flatMap(p=>(p.questionTypes||[]).map(q=>q.subtype || q.type)).filter(Boolean))];
    map.set(key,{key,channel,partId,slot,unitId:String(u.unitId||u.id),albumId:String(album.id),albumTitle:album.title,
      albums:[String(album.id)],title:u.title||u.titleZh||'未命名',titleZh:u.titleZh||'',seen:isSeen({...u,channel}),
      accuracy:Number.isFinite(accuracy)?accuracy:null,personalAccuracy:personalAccuracy(u),personalAccuracyAt:String(u.lastAttemptAt||'').replace(' ','T'),types,topic:writing?(u.writingTopicType||''):topicOf(u.title+' '+u.titleZh),
      questionCount:null});
  }
  return [...map.values()];
}
function topicOf(s) {
  const topics=[['nature',/animal|bird|tree|plant|forest|climate|environment|energy|water|wildlife|生态|动物|环境|气候|能源/i],['society',/history|ancient|museum|art|music|culture|archaeol|历史|文化|艺术|博物馆/i],['science',/science|research|brain|technology|robot|memory|科学|技术|研究|记忆/i],['education',/school|student|education|university|learning|学校|学生|大学|教育/i],['business',/business|company|work|market|office|job|rent|booking|工作|商业|公司|租赁|预订/i]];
  return topics.find(([,re])=>re.test(s))?.[0]||'other';
}
export function seededRandom(seed) {
  let a=Number(seed)>>>0;
  return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function buildBatch(units,{channels,albums,mode='fresh',newRatio=.5,count=1,difficulty='normal',seed=Date.now(),priorCoverage=[],allowDeviation=false,writingTasks=['Task1','Task2'],freshCountOverride=null}={}) {
  if (!channels?.length) throw new Error('请至少勾选一科。');
  if (!['fresh','mixed','review'].includes(mode)) throw new Error('练习模式无效。');
  if (!Number.isInteger(count)||count<1||count>10) throw new Error('一次可生成 1–10 套。');
  if (!Object.hasOwn(DIFFICULTY_BANDS,difficulty)) throw new Error('难度选项无效。');
  if(channels.includes('writing')&&(!Array.isArray(writingTasks)||!writingTasks.length||writingTasks.some(s=>!['Task1','Task2'].includes(s))||new Set(writingTasks).size!==writingTasks.length))throw new Error('请至少选择小作文或大作文。');
  const allowed=new Set(albums), pool=units.filter(u=>u.albums.some(a=>allowed.has(a)));
  const rng=seededRandom(seed);
  const used=new Set(), coverage=new Map(priorCoverage), sets=[];
  for(let k=0;k<count;k++) {
    const modules=[];
    for(const channel of channels) {
      const slots=slotsFor(channel,writingTasks), n=slots.length;
      // One essay cannot be half new and half old. Balance single-essay batches across papers.
      const fresh=freshCountOverride!==null?bounded(freshCountOverride,0,n):mode==='fresh'?n:mode==='review'?0:n===1?Math.round((k+1)*newRatio)-Math.round(k*newRatio):bounded(Math.round(n*newRatio),1,n-1);
      const candidates=slots.map(s=>pool.filter(u=>u.channel===channel&&u.slot===s&&!used.has(u.key)));
      if(candidates.some(a=>!a.length)) throw new Error(`第 ${k+1} 套${CHANNELS[channel]}缺少可用的 ${slots.filter((s,i)=>!candidates[i].length).join('、')}。请勾选对应题库或减少套数。`);
      const newChoices=candidates.map(a=>a.filter(u=>!u.seen));
      const oldChoices=candidates.map(a=>a.filter(u=>u.seen).sort((a,b)=>errorPriority(b)-errorPriority(a)));
      let best=null,bestRank=null;
      // Search both status assignments and selections; never silently weaken the selected mode.
      for(let trial=0;trial<4000;trial++) {
        const order=Array.from({length:n},(_,i)=>i);
        for(let i=n-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
        const freshSlots=new Set(order.slice(0,fresh));
        const selected=candidates.map((a,i)=>{
          const freshSlot=freshSlots.has(i), choices=freshSlot?newChoices[i]:oldChoices[i];
          // Explore the most-missed items first, then broaden the search for feasible difficulty/40Q sets.
          const rank=freshSlot||channel==='writing'?rng():trial<80?0:trial%3===0?rng():Math.pow(rng(),3);
          return choices[Math.floor(rank*choices.length)];
        });
        if(selected.some(u=>!u)||new Set(selected.map(u=>u.key)).size!==n)continue;
        const meta=aggregateDifficulty(selected,channel,difficulty);
        if(meta&&!meta.inRange&&!allowDeviation)continue;
        const totalKnown=selected.every(u=>u.questionCount!==null);
        if(channel!=='writing' && totalKnown && selected.reduce((a,u)=>a+u.questionCount,0)!==40)continue;
        const tags=selected.flatMap(u=>[...u.types, 'topic:'+u.topic]);
        const distinct=new Set(tags);
        const breadth=[...distinct].reduce((a,t)=>a+1/(1+(coverage.get(channel+':'+t)||0)),0);
        const score=breadth*2-(meta?.rawLevel==null?0:Math.abs(meta.rawLevel-meta.target)*.3)+rng()*3;
        const priority=selected.reduce((sum,u)=>sum+errorPriority(u),0);
        // Lexicographic priority: personal errors outrank breadth/randomness among feasible candidates.
        const rank=[...difficultyRank(meta),-priority,-score];
        if(!bestRank||compareRanks(rank,bestRank)<0){
          bestRank=rank;best={channel,items:selected.map(u=>({...u})),difficulty:meta?.level??null,difficultyMeta:meta};
        }
      }
      if(!best)throw new Error(`第 ${k+1} 套${CHANNELS[channel]}无法同时满足新旧比例和难度条件。请更换模式、增加题库或减少套数。`);
      for(const u of best.items){used.add(u.key);for(const t of [...u.types,'topic:'+u.topic]){const key=channel+':'+t;coverage.set(key,(coverage.get(key)||0)+1);}}
      modules.push(best);
    }
    sets.push({id:`${seed}-${k}`,number:k+1,modules});
  }
  return {version:1,id:String(seed),createdAt:new Date().toISOString(),options:{channels,albums,mode,newRatio,count,difficulty,seed,writingTasks},sets};
}
export function validateWritingDetail(detail,item){
 const actualId=String(detail?.unit?.unitId||detail?.unit?.id||'');
 if(actualId!==item.unitId)throw new Error('写作原题编号不一致，请重新抽选。');
 const part=detail?.parts?.find(p=>String(p.partId||p.id)===item.partId);
 const slot=/^task1_/.test(part?.writingTaskType||'')?'Task1':/^task2_/.test(part?.writingTaskType||'')?'Task2':null;
 if(!part||slot!==item.slot||!part.groups?.some(g=>g.type==='writing'&&g.questions?.length))throw new Error('这篇写作缺少有效的原题内容或题型已更新，请重新抽选。');
 return true;
}
export function examQuestionCount(exam,partId) {
  const p=exam?.parts?.find(p=>String(p.id)===String(partId));
  if(!p)throw new Error('原题已更新或已下架，请重新组卷。');
  const qs=(p.groups||[]).flatMap(g=>g.questions||[]);
  const unique=new Set(qs.map(q=>String(q.qNumber)).filter(q=>q&&q!=='undefined'));
  if(!unique.size || (Number(p.total)>0 && Number(p.total)!==unique.size))throw new Error('题目数量暂时无法可靠核对，请换题。');
  return unique.size;
}
export function reviewStats(review) {
  const attempt=review?.attempt;
  if(!attempt)throw new Error('提交结果格式暂不支持，保留结果待核对。');
  const total=Number(attempt.totalCount ?? attempt.questionCount ?? attempt.total);
  const correct=Number(attempt.correctCount ?? attempt.rightCount);
  if(!Number.isInteger(total)||total<=0||!Number.isInteger(correct)||correct<0||correct>total)throw new Error('提交结果缺少可靠的题数或正确数。');
  return {total,correct,elapsedSeconds:Number.isFinite(Number(attempt.elapsedSeconds))&&attempt.elapsedSeconds!=null?Number(attempt.elapsedSeconds):null};
}
export function bandReference(correct,total,channel='listening') {
  if(total!==40)return '完成 40 题后提供参考';
  // Official average raw-score anchors; do not invent precise half-band cut-offs.
  if(correct>=35)return '约 8 分或以上';
  if(correct>=30)return '约 7–8 分';
  if(correct>=23)return '约 6–7 分';
  if(correct>=(channel==='reading'?15:16))return '约 5–6 分';
  return '低于约 5 分参考线';
}
export function trainingFeedback(correct,total){
  if(total!==40||!Number.isInteger(correct)||correct<0||correct>40)return '';
  const target=correct<30?`距训练下限还差 ${30-correct} 题`:correct<=32?'达到训练目标':'超过训练目标';
  return `6.5 备考目标：30–32/40（错 8–10 题）；本次${target}。这是练习表现，非考试定级。`;
}

// A single module fallback, only after the selected mode fails the target difficulty.
export function buildWithReviewFallback(units,opts){
 if(!opts.allowReviewFallback||opts.channels.length!==1||opts.channels[0]==='writing'||opts.mode==='review')return buildBatch(units,opts);
 const strict={...opts,allowDeviation:false};
 try{return buildBatch(units,strict);}catch(originalError){
  const n=slotsFor(opts.channels[0]).length;
  const requestedFresh=opts.mode==='fresh'?n:Math.max(1,Math.min(n-1,Math.round(n*(opts.newRatio??.5))));
  for(let fresh=requestedFresh-1;fresh>=0;fresh--){
   try{
    const batch=buildBatch(units,{...strict,freshCountOverride:fresh});
    const module=batch.sets[0].modules[0];
    module.reviewFallback={requestedMode:opts.mode,extraOld:requestedFresh-fresh,newCount:fresh,oldCount:n-fresh};
    return batch;
   }catch{}
  }
  // Difficulty deviation remains a separate, explicitly chosen option.
  if(opts.allowDeviation)return buildBatch(units,opts);
  throw originalError;
 }
}
