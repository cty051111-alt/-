// Pinned comparison snapshot, not official IELTS equating data. Never silently re-anchor old papers.
export const CALIBRATION={
 version:'2026-10-30-v1',snapshotAt:'2026-10-30',scaleAnchor:3,percentagePointsPerLevel:10,
 reading:{baselineAccuracy:65.0555,basis:'recall-matched',label:'2024-04-13 阅读回忆参照',
  source:'https://www.xhd.cn/ielts/jijing/189427.html',
  items:[
   {slot:'P1',unitId:'2017137445822894081',partId:'2017200378225459201',title:'Rubber',count:13,accuracy:68.8},
   {slot:'P2',unitId:'2017137445915168771',partId:'2018961385545371650',title:'Herbal Medicines',count:13,accuracy:67.38},
   {slot:'P3',unitId:'2017137445986471938',partId:'2020880690813960194',title:'Star Performers',count:14,accuracy:59.42}
  ],note:'新航道同场回忆三篇题数、题型组合及特征题干对应。排除同日期其他网页的替代文章。仍非官方原卷或官方等值校准，回忆答案不保证完全准确。'},
 listening:{baselineAccuracy:64.51571406271893,basis:'catalog-only',label:'听力题库参照 · 尚未整套校准',
  source:null,partMeans:{P1:67.86044444444444,P2:67.89892307692308,P3:64.5290625,P4:57.774426229508194},
  note:'各 Part 可选题目平均正确率的等权均值。已检查同场回忆，但未找到四个 Part 全部同版本的完整参照，不能声称已接近真实考试难度。'}
};
