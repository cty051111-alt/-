// Local paper lifecycle. A draft is recoverable; a completed paper becomes a fixed seven-day record.
export const RETENTION_MS=7*24*60*60*1000;
export function parseTime(value){
  if(!value)return NaN;
  return new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'+08:00').getTime();
}
export const paperItems=s=>(s.modules||[]).flatMap(m=>m.items||[]);
export const isComplete=s=>paperItems(s).length>0&&paperItems(s).every(i=>!!i.result);
export function paperStatus(s){return s.completedAt?'completed':s.pausedAt?'paused':s.startedAt?'active':'queued';}
export function allPapers(plans){return plans.flatMap(p=>p.sets.map(s=>({p,s})));}
export function activePaper(plans){return allPapers(plans).find(({s})=>paperStatus(s)==='active');}
function moduleSnapshot(m){
  const items=m.items;
  const numeric=items.filter(i=>i.channel!=='writing');
  const sum=(group,key)=>group.reduce((a,i)=>a+(i.result?.[key]||0),0);
  return {channel:m.channel,passages:items.length,total:sum(numeric,'total'),correct:sum(numeric,'correct'),
    elapsedSeconds:sum(numeric,'elapsedSeconds'),missingTime:numeric.filter(i=>i.result?.elapsedSeconds==null).length,
    first:{total:sum(numeric.filter(i=>!i.seen),'total'),correct:sum(numeric.filter(i=>!i.seen),'correct')},
    review:{total:sum(numeric.filter(i=>i.seen),'total'),correct:sum(numeric.filter(i=>i.seen),'correct')}};
}
export function syncRecords(plans,now=Date.now()){
  for(const {p,s}of allPapers(plans)){
    if(!s.createdAt)s.createdAt=p.createdAt||new Date(now).toISOString();
    if(!s.startedAt){const dates=paperItems(s).map(i=>parseTime(i.startedAt)).filter(Number.isFinite);
      if(dates.length)s.startedAt=new Date(Math.min(...dates)).toISOString();}
    if(!s.completedAt&&isComplete(s)){
      const dates=paperItems(s).map(i=>parseTime(i.result.completedAt)).filter(Number.isFinite);
      s.completedAt=new Date(dates.length?Math.max(...dates):now).toISOString();
      s.expiresAt=new Date(parseTime(s.completedAt)+RETENTION_MS).toISOString();
      s.snapshot={version:1,completedAt:s.completedAt,modules:s.modules.map(moduleSnapshot)};
      delete s.pausedAt;
    }
    if(s.completedAt&&!s.expiresAt)s.expiresAt=new Date(parseTime(s.completedAt)+RETENTION_MS).toISOString();
  }
  return plans;
}
export function pruneExpired(plans,now=Date.now()){
  syncRecords(plans,now);
  return plans.map(p=>({...p,sets:p.sets.filter(s=>!(s.completedAt&&parseTime(s.expiresAt)<=now))})).filter(p=>p.sets.length);
}
export function readState(raw,now=Date.now()){
  const data=raw?JSON.parse(raw):{plans:[]};
  if(!Array.isArray(data.plans)||data.plans.some(p=>!p.id||!Array.isArray(p.sets)||p.sets.some(s=>!s.id||!Array.isArray(s.modules)||s.modules.some(m=>!Array.isArray(m.items)))))throw new Error('本地练习记录格式异常，已保留原数据，请联系检查。');
  const plans=pruneExpired(data.plans,now);
  const selectedSetId=allPapers(plans).some(({s})=>s.id===data.selectedSetId)?data.selectedSetId:'';
  return {version:2,plans,selectedSetId};
}
export function pendingKeys(plans){return new Set(allPapers(plans).filter(({s})=>!s.completedAt).flatMap(({s})=>paperItems(s).map(i=>i.key)));}
export function removePaper(plans,setId){return plans.map(p=>({...p,sets:p.sets.filter(s=>s.id!==setId)})).filter(p=>p.sets.length);}
