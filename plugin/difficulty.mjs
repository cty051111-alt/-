import {CALIBRATION} from './calibration.mjs';
export const DIFFICULTY_BANDS={
 relaxed:{min:1,max:2,label:'轻松'},easy:{min:2,max:3,label:'基础'},reference:{min:3,max:3.5,label:'接近参照'},
 normal:{min:3.5,max:4,label:'强化'},hard:{min:4,max:5,label:'挑战'}
};
export function aggregateDifficulty(items,channel,band='normal'){
 if(channel==='writing')return null;
 const range=DIFFICULTY_BANDS[band];if(!range)throw new Error('难度档位无效。');
 const reference=CALIBRATION[channel];
 const weight=i=>i.questionCount>0?i.questionCount:channel==='listening'?10:i.slot==='P3'?14:13;
 const total=items.reduce((sum,i)=>sum+weight(i),0);
 const known=items.filter(i=>Number.isFinite(i.accuracy)&&i.accuracy>=0&&i.accuracy<=100);
 const knownWeight=known.reduce((sum,i)=>sum+weight(i),0);
 const coverage=total?knownWeight/total:0;
 const accuracy=knownWeight?known.reduce((sum,i)=>sum+weight(i)*i.accuracy,0)/knownWeight:null;
 const rawLevel=accuracy===null?null:3+(reference.baselineAccuracy-accuracy)/10;
 const complete=coverage===1;
 const inRange=complete&&rawLevel>=range.min-1e-9&&rawLevel<=range.max+1e-9;
 return {version:CALIBRATION.version,band,target:(range.min+range.max)/2,min:range.min,max:range.max,
  level:complete?Math.max(1,Math.min(5,rawLevel)):null,rawLevel:complete?rawLevel:null,coverage,
  weightedAccuracy:complete?accuracy:null,baselineAccuracy:reference.baselineAccuracy,referenceLabel:reference.label,basis:reference.basis,
  inRange,evaluation:!complete?'数据不足':inRange?'目标内':rawLevel<range.min?'偏简单':'偏难',
  deviationReason:!complete?'部分篇目缺少平均正确率，无法可靠估计整套难度。':inRange?'':
   '当前题库、新旧比例、去重和题数条件下，本次搜索未找到目标区间组合；显示最接近的可用候选，不代表已穷尽所有组合。'};
}
export function difficultyRank(meta){
 if(!meta)return [0,0,0];
 if(meta.rawLevel===null)return [2,1-meta.coverage,0];
 const distance=Math.max(meta.min-meta.rawLevel,meta.rawLevel-meta.max,0);
 return [meta.inRange?0:1,distance,Math.abs(meta.rawLevel-meta.target)<=.1?0:1];
}
export function compareRanks(a,b){for(let n=0;n<Math.max(a.length,b.length);n++){const delta=(a[n]||0)-(b[n]||0);if(Math.abs(delta)>1e-9)return delta;}return 0;}
