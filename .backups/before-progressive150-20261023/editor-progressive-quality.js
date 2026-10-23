/* Geometry-based observation cost for certified, plain progressive puzzles. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(0,Math.min(1,(v-a)/(b-a)));
 function measure(map,simulation){
  const count=map.worms.length,directions=[0,0,0,0],bins=new Set(),xs=new Map(),ys=new Map();
  let turns=0,segments=0,interior=0;const turnsPerWorm=[],lengths=map.worms.map(w=>w.cells.length).sort((a,b)=>a-b);
  for(const worm of map.worms){let wormTurns=0;
   const[head,neck]=worm.cells,dx=head[0]-neck[0],dy=head[1]-neck[1];directions[dx>0?0:dx<0?1:dy>0?2:3]++;
   if(head[0]>0&&head[1]>0&&head[0]<map.XSize-1&&head[1]<map.YSize-1)interior++;
   bins.add(Math.min(3,Math.floor(head[0]*4/map.XSize))+4*Math.min(3,Math.floor(head[1]*4/map.YSize)));
   xs.set(head[0],(xs.get(head[0])||0)+1);ys.set(head[1],(ys.get(head[1])||0)+1);
   for(let i=2;i<worm.cells.length;i++){const[a,b,c]=worm.cells.slice(i-2,i+1);if(b[0]-a[0]!==c[0]-b[0]||b[1]-a[1]!==c[1]-b[1]){turns++;wormTurns++;}segments++;}
   turnsPerWorm.push(wormTurns);
  }
  const dependencies=simulation.paths.map(path=>new Set(path.blockers.map(cell=>simulation.I.wormAt[cell])));
  const bounds=map.worms.map(w=>[Math.min(...w.cells.map(c=>c[0])),Math.max(...w.cells.map(c=>c[0])),Math.min(...w.cells.map(c=>c[1])),Math.max(...w.cells.map(c=>c[1]))]);
  let bestScanMistakes=count,bestOpeningMistakes=count;
  for(const axis of [0,1])for(const sign of [-1,1])for(const anchor of ['head','body'])for(const secondary of [-1,1]){
   const key=id=>anchor==='head'?map.worms[id].cells[0][axis]:bounds[id][axis*2+(sign<0?1:0)];
   const ids=map.worms.map((_,id)=>id).sort((a,b)=>sign*(key(a)-key(b))||secondary*(map.worms[a].cells[0][1-axis]-map.worms[b].cells[0][1-axis])||sign*(map.worms[a].cells[0][axis]-map.worms[b].cells[0][axis]));
   const removed=new Set();let mistakes=0,opening=0;
   ids.forEach((id,step)=>{if([...dependencies[id]].every(parent=>removed.has(parent)))removed.add(id);else{mistakes++;if(step<Math.min(12,count))opening++;}});
   bestScanMistakes=Math.min(bestScanMistakes,mistakes);bestOpeningMistakes=Math.min(bestOpeningMistakes,opening);
  }
  const entropy=-directions.reduce((sum,n)=>sum+(n?n/count*Math.log2(n/count):0),0)/2;
  turnsPerWorm.sort((a,b)=>a-b);
  const result={count,medianTurns:turnsPerWorm[Math.floor(count/2)],medianLength:lengths[Math.floor(count/2)],maxWormShare:lengths.at(-1)/map.worms.reduce((s,w)=>s+w.cells.length,0),complexWorms:turnsPerWorm.filter(n=>n>=4).length/count,turnRatio:segments?turns/segments:0,meanTurns:turns/count,directions:directions.filter(Boolean).length,directionEntropy:entropy,interiorHeads:interior/count,headBins:bins.size,maxHeadLine:Math.max(...xs.values(),...ys.values())/count,meanDependencies:dependencies.reduce((sum,d)=>sum+d.size,0)/count,bestScanMistakes,bestOpeningMistakes};
  result.varied=count>=12&&result.medianTurns>=4&&result.complexWorms>=.6&&result.maxWormShare<=.25&&result.turnRatio>=.30&&result.meanTurns>=5&&result.directions>=3&&result.interiorHeads>=.6&&result.maxHeadLine<=.35&&result.headBins>=Math.min(10,Math.ceil(count/2))&&result.meanDependencies>=1.5&&bestScanMistakes>=Math.ceil(count*.3)&&bestOpeningMistakes>=3;
  const size=.8+.2*clamp(count,12,36);
  result.score=Math.round(100*size*(.25*clamp(result.turnRatio,.15,.75)+.20*clamp(result.medianTurns,2,10)+.15*entropy+.15*clamp(bestScanMistakes/count,.15,.85)+.10*clamp(result.meanDependencies,1,5)+.10*result.interiorHeads+.05*bins.size/16));
  if(result.medianTurns<6||result.complexWorms<.75)result.score=Math.min(74,result.score);
  return result;
 }
 function enhance(map,simulation,base,solver){
  if(map.worms.length<12||map.worms.length>120||map.worms.some(w=>w.ice||w.lock||w.bomb||w.area)||map.portals.length||map.holes.length||map.keys.length)return base;
  const metrics=measure(map,simulation);if(!metrics.varied)return base;
  const designer=typeof module!=='undefined'&&module.exports?require('./editor-exit-design.js'):root.CWExitDesign;
  if(!designer||!designer.analyze({simulate:()=>simulation,...solver},map,'progressive').matches)return base;
  const score=Math.max(base.score,metrics.score);
  return{...base,score,tier:score<20?0:score<40?1:score<60?2:score<75?3:score<90?4:5,observation:metrics,factors:[...base.factors,
   {k:'trace',l:'Quan sát thân giun đan xen',raw:'Trung vị '+metrics.medianTurns+' khúc/con · '+Math.round(metrics.complexWorms*100)+'% giun ≥4 khúc',v:clamp(metrics.meanTurns,2,18),w:0},
   {k:'sweep',l:'Bấm quét từ 4 phía',raw:'Ít nhất '+metrics.bestScanMistakes+'/'+metrics.count+' lượt bị chặn · mất 3 tim ngay đầu',v:clamp(metrics.bestScanMistakes/metrics.count,.15,.85),w:0},
   {k:'heads',l:'Hướng và vị trí đầu giun',raw:metrics.directions+' hướng · '+Math.round(metrics.interiorHeads*100)+'% đầu nằm trong bàn',v:(metrics.directionEntropy+metrics.interiorHeads)/2,w:0}]};
 }
 const api={measure,enhance};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWProgressiveQuality=api;
})(typeof globalThis!=='undefined'?globalThis:window);
