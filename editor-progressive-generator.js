/* Dense, intertwined physical progressive puzzles. No timer or extra blocker. */
(function(root){
 'use strict';
 const geometry=typeof module!=='undefined'&&module.exports?require('./editor-progressive-quality.js'):root.CWProgressiveQuality;
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 const abort=()=>{const error=Error('Đã dừng. Map cũ được giữ nguyên.');error.name='AbortError';return error;};
 function board(input,count,profile){
  return{...input,worms:[],portals:[],holes:[],keys:[]};
 }
 async function weave(engine,designer,map,seed,options){
  const W=map.XSize,H=map.YSize,area=W*H,analysis=designer.analyze(engine,map,'progressive');if(!analysis.matches)return null;
  const rnd=engine.random(engine.hash(seed+'|weave')),rank=[],release=map.worms.map(()=>-1),occupied=new Int32Array(area).fill(-1),watch=Array.from({length:area},()=>[]);
  analysis.result.order.forEach((id,step)=>rank[id]=step);
  const minimum=options.skeletonMin||12,maximum=Math.max(minimum,Math.floor(area*.24));
  const paths=map.worms.map(w=>w.cells.map(([x,y])=>y*W+x));paths.forEach((path,id)=>path.forEach(cell=>occupied[cell]=id));
  map.worms.forEach((w,id)=>{const[h,n]=w.cells,dx=h[0]-n[0],dy=h[1]-n[1];for(let x=h[0]+dx,y=h[1]+dy;x>=0&&y>=0&&x<W&&y<H;x+=dx,y+=dy){const cell=y*W+x;watch[cell].push(id);if(occupied[cell]>=0)release[id]=Math.max(release[id],rank[occupied[cell]]);}});
  const allowed=paths.map((_,id)=>Uint8Array.from(watch,observers=>observers.every(other=>other!==id&&rank[id]<=release[other])?1:0));
  // Preserve at least one blocker at every certified release time. This lets
  // entire bodies be rerouted fairly instead of forcing the root to fill gaps.
  const critical=new Int32Array(paths.length),delta=new Int32Array(paths.length),stamps=new Uint32Array(paths.length),touched=[];let stamp=0;
  watch.forEach((observers,cell)=>{const owner=occupied[cell];if(owner>=0)for(const other of observers)if(rank[owner]===release[other])critical[other]++;});
  function reset(){stamp++;touched.length=0;}
  function track(cell,from,to){for(const other of watch[cell]){let d=0;if(from>=0&&rank[from]===release[other])d--;if(to>=0&&rank[to]===release[other])d++;if(!d)continue;if(stamps[other]!==stamp){stamps[other]=stamp;delta[other]=0;touched.push(other);}delta[other]+=d;}}
  function commit(){for(const other of touched)if(critical[other]+delta[other]<=0)return false;for(const other of touched)critical[other]+=delta[other];return true;}
  let used=paths.reduce((sum,p)=>sum+p.length,0);const steps=options.weaveSteps||4000000,cooling=Math.floor(steps*.625);
  for(let step=0;step<steps&&used<area;step++){
   if(step%65536===0){if(options.signal?.stop)throw abort();if(Date.now()>options.deadline)return null;options.onProgress?.({stage:'weave',attempt:options.attempt,iteration:step,total:steps,cells:used,area});await pause();}
   const id=Math.floor(rnd()*paths.length),path=paths[id];
   // Fill two neighboring gaps by bending an existing edge through them.
   // This preserves the head, every existing cell and every release blocker.
   if(rnd()<.1&&path.length+2<=maximum){
    const k=1+Math.floor(rnd()*(path.length-2)),a=path[k],b=path[k+1],dx=b%W-a%W,dy=Math.floor(b/W)-Math.floor(a/W),side=rnd()<.5?-1:1;
    const cx=a%W-dy*side,cy=Math.floor(a/W)+dx*side,ex=b%W-dy*side,ey=Math.floor(b/W)+dx*side;
    if(cx>=0&&cy>=0&&cx<W&&cy<H&&ex>=0&&ey>=0&&ex<W&&ey<H){const c=cy*W+cx,d=ey*W+ex;if(occupied[c]<0&&occupied[d]<0&&allowed[id][c]&&allowed[id][d]){reset();track(c,-1,id);track(d,-1,id);if(commit()){path.splice(k+1,0,c,d);occupied[c]=occupied[d]=id;used+=2;}}}continue;
   }
   if(rnd()<.25&&path.length>3){
    const k=2+Math.floor(rnd()*(path.length-3)),a=path[k-1],b=path[k],c=path[k+1];
    if(a%W!==c%W&&Math.floor(a/W)!==Math.floor(c/W)){const next=a+c-b;if(occupied[next]<0&&allowed[id][next]){reset();track(b,id,-1);track(next,-1,id);if(commit()){occupied[b]=-1;path[k]=next;occupied[next]=id;}}}continue;
   }
   if(rnd()<.006*Math.max(0,1-step/cooling)&&path.length>2&&(path.length>minimum||rnd()<.08)){reset();track(path.at(-1),id,-1);if(commit()){occupied[path.pop()]=-1;used--;}continue;}
   const tail=path.at(-1),dir=Math.floor(rnd()*4),x=tail%W,y=Math.floor(tail/W),nx=x+(dir===0?1:dir===1?-1:0),ny=y+(dir===2?1:dir===3?-1:0);
   if(nx<0||ny<0||nx>=W||ny>=H)continue;const cell=ny*W+nx,other=occupied[cell];
   if(other<0){if(path.length>=maximum||!allowed[id][cell])continue;reset();track(cell,-1,id);commit();path.push(cell);occupied[cell]=id;used++;}
   else if(other===id){const k=path.indexOf(cell);if(k<1||k>=path.length-2)continue;paths[id]=path.slice(0,k+1).concat(path.slice(k+1).reverse());}
   else{const donor=paths[other],k=donor.indexOf(cell);if(k<2||path.length+donor.length-k>maximum||k<minimum&&rnd()>.04)continue;let valid=true;for(let i=k;i<donor.length;i++)if(!allowed[id][donor[i]]){valid=false;break;}if(!valid)continue;reset();for(let i=k;i<donor.length;i++)track(donor[i],other,id);if(!commit())continue;const suffix=donor.splice(k);for(const p of suffix)occupied[p]=id;path.push(...suffix);}
  }
  options.onProgress?.({stage:'candidate-fill',attempt:options.attempt,cells:used,area,lengths:paths.map(p=>p.length)});
  map.worms.forEach((worm,id)=>worm.cells=paths[id].map(cell=>[cell%W,Math.floor(cell/W)]));
  if(used!==area){
   if(area-used>4)return null;
   map=finishGaps(engine,designer,map,Math.min(options.deadline||Infinity,Date.now()+350),options.signal);
   if(!map)return null;
  }
  return designer.analyze(engine,map,'progressive').matches?map:null;
 }
 function finishGaps(engine,designer,input,deadline,signal){
  const near=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1;
  let map=input;
  for(let fill=0;fill<4;fill++){
   const queue=[map],seen=new Set();let found=null;
   for(let state=0;state<queue.length&&state<60&&!found;state++){
    if(signal?.stop)throw abort();if(Date.now()>deadline)return null;
    const current=queue[state],W=current.XSize,H=current.YSize,at=engine.index(current).wormAt;
    const holes=Array.from(at).flatMap((id,cell)=>id<0?[cell]:[]);
    if(!holes.length)return current;
    const put=(id,cells)=>({...current,worms:current.worms.map((worm,i)=>i===id?{...worm,cells}:worm)});
    function enqueue(next){if(!designer.analyze(engine,next,'progressive').matches)return;const key=engine.hash(JSON.stringify(next.worms.map(w=>w.cells)));if(!seen.has(key)){seen.add(key);queue.push(next);}}
    for(const hole of holes){
     const p=[hole%W,Math.floor(hole/W)],ids=new Set();
     for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const x=p[0]+dx,y=p[1]+dy;if(x>=0&&y>=0&&x<W&&y<H&&at[y*W+x]>=0)ids.add(at[y*W+x]);}
     for(const id of ids){
      if(Date.now()>deadline)return null;
      const cells=current.worms[id].cells,paths=[cells],ends=new Set();
      for(let n=0;n<paths.length&&n<35&&!found;n++){
       const path=paths[n];for(const head of [false,true])if(near(head?path[0]:path.at(-1),p)){const next=put(id,head?[p,...path]:[...path,p]);if(designer.analyze(engine,next,'progressive').matches){found=next;break;}}
       for(let k=1;k<path.length-2;k++)if(near(path.at(-1),path[k])){const next=path.slice(0,k+1).concat(path.slice(k+1).reverse()),key=next.at(-1).join(',');if(!ends.has(key)){ends.add(key);paths.push(next);}}
      }
      if(found)break;
      for(const end of [0,cells.length-1])if(near(cells[end?cells.length-2:1],p)){const path=cells.slice();path[end]=p;enqueue(put(id,path));}
      for(let k=1;k<cells.length-1;k++){const[a,b,c]=cells.slice(k-1,k+2);if(a[0]+c[0]-b[0]===p[0]&&a[1]+c[1]-b[1]===p[1]){const path=cells.slice();path[k]=p;enqueue(put(id,path));}}
     }
     if(found)break;
    }
   }
   if(!found)return null;map=found;
  }
  return engine.index(map).wormAt.every(id=>id>=0)?map:null;
 }
 function colorize(engine,map,seed){
  const occupied=engine.index(map).wormAt,adjacent=map.worms.map(()=>new Set()),W=map.XSize,H=map.YSize,rnd=engine.random(engine.hash(seed+'|colors'));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=occupied[y*W+x];for(const b of [x+1<W?occupied[y*W+x+1]:a,y+1<H?occupied[(y+1)*W+x]:a])if(a>=0&&b>=0&&a!==b){adjacent[a].add(b);adjacent[b].add(a);}}
  const count=map.palette?.length||16,colors=map.worms.map(()=>-1),usage=Array(count).fill(0);
  for(let step=0;step<colors.length;step++){
   let chosen=-1,best=-1;
   for(let id=0;id<colors.length;id++)if(colors[id]<0){const saturation=new Set([...adjacent[id]].map(other=>colors[other]).filter(c=>c>=0)).size,score=saturation*100+adjacent[id].size+rnd()*.1;if(score>best){best=score;chosen=id;}}
   let color=0,cost=Infinity;
   for(let c=0;c<count;c++){const score=[...adjacent[chosen]].filter(other=>colors[other]===c).length*1000+usage[c]+rnd()*.5;if(score<cost){cost=score;color=c;}}
   colors[chosen]=color;usage[color]++;
  }
  map.worms.forEach((worm,id)=>worm.color=colors[id]);return map;
 }
 async function refine(engine,designer,input,basis,count,profile,options,onProgress){
  if(basis.XSize!==input.XSize||basis.YSize!==input.YSize||basis.worms.length!==count)throw Error('Bố cục mẫu không đúng kích thước bàn hoặc số giun yêu cầu. Map cũ được giữ nguyên.');
  const rnd=engine.random(engine.hash(String(options.seed)+'|refine|'+profile)),target=profile==='very-hard'?75:60;
  let map=JSON.parse(JSON.stringify(basis));map.name=input.name;map.palette=input.palette||null;map.extraTop=input.extraTop||{};
  // Symmetries preserve every ray and path; subsequent head and boundary moves
  // change the puzzle itself and are accepted only after full certification.
  const original=JSON.parse(JSON.stringify(map)),flipX=rnd()<.5,flipY=rnd()<.5;
  map.worms.forEach(w=>w.cells=w.cells.map(([x,y])=>[flipX?map.XSize-1-x:x,flipY?map.YSize-1-y:y]));
  if((engine.evaluate(map)?.score||0)<target)map=original;
  const startHeads=map.worms.map(w=>w.cells[0].join(',')),same=(a,b)=>a[0]===b[0]&&a[1]===b[1],near=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1;
  let acceptedHeads=0,acceptedBodies=0;
  // Each certification gets more expensive as the dependency graph grows.
  // The starting layout already meets the requested difficulty; scale mutation
  // attempts down for large maps, while certifying every accepted change.
  const iterations=count>65?128:Math.max(400,Math.round(3200*Math.pow(50/Math.max(50,count),2))),deadline=Math.min(options.deadline||Infinity,Date.now()+Math.min(28000,options.searchBudgetMs||24000));
  for(let step=0;step<iterations;step++){
   if(step%40===0){if(options.signal?.stop)throw abort();if(Date.now()>deadline)throw Error('Chưa kiểm chứng xong trong thời gian cho phép. Không thay bằng map dễ; map cũ được giữ nguyên.');onProgress({stage:'refine',iteration:step,total:iterations});await pause();}
   const id=Math.floor(rnd()*count),path=map.worms[id].cells,saved=new Map(),operation=rnd();let body=false;
   function put(index,cells){if(!saved.has(index))saved.set(index,map.worms[index].cells);map.worms[index].cells=cells;}
   if(operation<.4){const candidates=[];for(let k=2;k<path.length;k++)if(near(path[0],path[k]))candidates.push(k);if(!candidates.length)continue;const k=candidates[Math.floor(rnd()*candidates.length)];put(id,path.slice(0,k).reverse().concat(path.slice(k)));}
   else if(operation<.6)put(id,path.slice().reverse());
   else if(operation<.7){const other=Math.floor(rnd()*count);if(other===id)continue;put(id,path.slice().reverse());put(other,map.worms[other].cells.slice().reverse());}
   else{
    if(path.length<4)continue;const k=1+Math.floor(rnd()*(path.length-2)),a=path[k],b=path[k+1],dx=b[0]-a[0],dy=b[1]-a[1],side=rnd()<.5?-1:1,c=[a[0]-dy*side,a[1]+dx*side],d=[b[0]-dy*side,b[1]+dx*side];
    if(c[0]<0||c[1]<0||c[0]>=map.XSize||c[1]>=map.YSize||d[0]<0||d[1]<0||d[0]>=map.XSize||d[1]>=map.YSize)continue;
    const index=engine.index(map).wormAt,other=index[c[1]*map.XSize+c[0]];if(other<0||other===id||index[d[1]*map.XSize+d[0]]!==other)continue;
    const q=map.worms[other].cells,j=q.findIndex(cell=>same(cell,d));if(j<1||j>=q.length-1||!same(q[j+1],c))continue;
    const left=path.slice(0,k+1).concat(q.slice(j+1)),right=q.slice(0,j+1).concat(path.slice(k+1)),area=map.XSize*map.YSize;
    if(Math.min(left.length,right.length)<6||Math.max(left.length,right.length)>area*.25)continue;put(id,left);put(other,right);body=true;
   }
   const analysis=designer.analyze(engine,map,'progressive');
   const metrics=analysis.matches?geometry.measure(map,analysis.simulation):null;
   if(!metrics?.varied||metrics.score<target){for(const[index,cells]of saved)map.worms[index].cells=cells;continue;}
   if(body)acceptedBodies++;else acceptedHeads++;
  }
  colorize(engine,map,String(options.seed)+'|variant');const analysis=designer.analyze(engine,map,'progressive'),quality=engine.evaluate(map,analysis.simulation);
  if(!analysis.matches||!quality?.observation?.varied||quality.score<target)throw Error('Không chứng nhận được biến thể đạt độ khó. Map cũ được giữ nguyên.');
  return{map,quality,analysis,profile,attempts:1,refinement:{acceptedHeads,acceptedBodies,changedHeads:map.worms.filter((w,id)=>w.cells[0].join(',')!==startHeads[id]).length}};
 }
 function pattern(engine,designer,input,count,profile,options){
  const target=profile==='very-hard'?75:60,goal=profile==='very-hard'?82:68,candidates=[];
  const patterns=typeof module!=='undefined'&&module.exports?require('./editor-progressive-patterns.js'):root.CWProgressivePatterns;
  const sources=[...(patterns||[]).filter(raw=>raw.Arrows.length===count).map(raw=>engine.fromGame(raw,input.name)),...(options.templateMap?[options.templateMap]:[])];
  for(const map of sources){if(map.worms.length!==count||map.XSize!==input.XSize||map.YSize!==input.YSize)continue;const analysis=designer.analyze(engine,map,'progressive');if(!analysis.matches)continue;const quality=engine.evaluate(map,analysis.simulation);if(quality?.observation?.varied&&quality.score>=target)candidates.push({map,quality});}
  candidates.sort((a,b)=>a.map.XSize*a.map.YSize-b.map.XSize*b.map.YSize||Math.abs(a.quality.score-goal)-Math.abs(b.quality.score-goal));
  if(!candidates.length)return null;
  const area=candidates[0].map.XSize*candidates[0].map.YSize,pool=candidates.filter(value=>value.map.XSize*value.map.YSize===area),rnd=engine.random(engine.hash(String(options.seed)+'|base'));
  return pool[Math.floor(rnd()*pool.length)].map;
 }
 async function fitSmallerPattern(engine,designer,input,count,profile,options,onProgress,deadline){
  const patterns=typeof module!=='undefined'&&module.exports?require('./editor-progressive-patterns.js'):root.CWProgressivePatterns;
  const candidates=[],target=profile==='very-hard'?75:60;
  for(const raw of (patterns||[]).filter(raw=>raw.Arrows.length===count)){
   const source=engine.fromGame(raw,input.name);
   for(const transpose of [false,true]){
    const W=transpose?source.YSize:source.XSize,H=transpose?source.XSize:source.YSize;
    if(W>input.XSize||H>input.YSize)continue;
    const map=JSON.parse(JSON.stringify(source));map.XSize=W;map.YSize=H;
    if(transpose)map.worms.forEach(w=>w.cells=w.cells.map(([x,y])=>[y,x]));
    const a=designer.analyze(engine,map,'progressive'),q=engine.evaluate(map,a.simulation);
    if(a.matches&&q?.observation?.varied&&q.score>=target)candidates.push(map);
   }
  }
  candidates.sort((a,b)=>b.XSize*b.YSize-a.XSize*a.YSize);
  for(let attempt=0;attempt<Math.min(3,candidates.length)&&Date.now()<deadline;attempt++){
   const map=candidates[attempt],analysis=designer.analyze(engine,map,'progressive');
   const[head,neck]=map.worms[analysis.free[0]].cells,dx=head[0]-neck[0],dy=head[1]-neck[1];
   const ox=dx>0?input.XSize-map.XSize:dx<0?0:Math.floor((input.XSize-map.XSize)/2),oy=dy>0?input.YSize-map.YSize:dy<0?0:Math.floor((input.YSize-map.YSize)/2);
   map.worms.forEach(w=>w.cells=w.cells.map(([x,y])=>[x+ox,y+oy]));map.XSize=input.XSize;map.YSize=input.YSize;
   const filled=await weave(engine,designer,map,String(options.seed)+'|fixed-fit|'+attempt,{...options,weaveSteps:1000000,skeletonMin:6,deadline:Math.min(deadline,Date.now()+1500),attempt,onProgress});
   if(!filled)continue;const a=designer.analyze(engine,filled,'progressive'),q=engine.evaluate(filled,a.simulation);
   if(a.matches&&q?.observation?.varied&&q.score>=target)return filled;
  }
  return null;
 }

 // Small boards keep their honest difficulty score. They still need a dense,
 // physical progression with mixed headings and resistance to straight scans.
 const compactPatterns=[{"XSize":10,"YSize":10,"Arrows":[{"Dx":-1,"Dy":0,"X":6,"Y":3,"Indices":[36,37,47,57,56,46,45,55,65,66,67,77,76,86,96,95],"BendCount":10},{"Dx":0,"Dy":1,"X":8,"Y":7,"Indices":[78,68,69,79],"BendCount":2},{"Dx":1,"Dy":0,"X":4,"Y":5,"Indices":[54,53,63,64],"BendCount":2},{"Dx":1,"Dy":0,"X":5,"Y":8,"Indices":[85,84,94,93,83,73,74,75],"BendCount":4},{"Dx":-1,"Dy":0,"X":8,"Y":4,"Indices":[48,49,59,58],"BendCount":2},{"Dx":0,"Dy":-1,"X":7,"Y":8,"Indices":[87,97,98,99,89,88],"BendCount":3},{"Dx":0,"Dy":1,"X":0,"Y":2,"Indices":[20,10,11,1,0],"BendCount":3},{"Dx":-1,"Dy":0,"X":0,"Y":7,"Indices":[70,71,81,80,90,91,92,82,72,62,52,42,41,51,61,60,50,40,30],"BendCount":9},{"Dx":0,"Dy":1,"X":1,"Y":3,"Indices":[31,21,22,32,33,43,44,34,35,25,26,27,17,7,8,9,19,18,28,29,39,38],"BendCount":17},{"Dx":0,"Dy":1,"X":2,"Y":1,"Indices":[12,2,3,4,5,6,16,15,14,24,23,13],"BendCount":6}],"chuanSong":[],"blackHole":[],"yaoShi":[]},{"XSize":10,"YSize":10,"Arrows":[{"Dx":1,"Dy":0,"X":5,"Y":4,"Indices":[45,44],"BendCount":0},{"Dx":0,"Dy":1,"X":7,"Y":4,"Indices":[47,37,27,28,18,17,16,26,25,24,34,35,36,46,56,55,54,53,43,33,32,22,21,20],"BendCount":13},{"Dx":0,"Dy":1,"X":3,"Y":2,"Indices":[23,13,14,15],"BendCount":1},{"Dx":-1,"Dy":0,"X":4,"Y":6,"Indices":[64,65,66],"BendCount":0},{"Dx":0,"Dy":1,"X":0,"Y":1,"Indices":[10,0,1,11,12,2,3,4,5,6,7,8,9,19,29],"BendCount":6},{"Dx":0,"Dy":1,"X":0,"Y":9,"Indices":[90,80,70,60,61,71,72,62,63,73],"BendCount":6},{"Dx":1,"Dy":0,"X":4,"Y":8,"Indices":[84,83,93,94,95,96],"BendCount":2},{"Dx":-1,"Dy":0,"X":4,"Y":7,"Indices":[74,75,85,86,76,77,78,68,67,57,58,48,38,39,49,59,69,79,89,99,98,88,87,97],"BendCount":15},{"Dx":1,"Dy":0,"X":2,"Y":8,"Indices":[82,81,91,92],"BendCount":2},{"Dx":-1,"Dy":0,"X":1,"Y":4,"Indices":[41,42,52],"BendCount":1},{"Dx":1,"Dy":0,"X":1,"Y":3,"Indices":[31,30,40,50,51],"BendCount":2}],"chuanSong":[],"blackHole":[],"yaoShi":[]},{"XSize":13,"YSize":13,"Arrows":[{"Dx":-1,"Dy":0,"X":9,"Y":10,"Indices":[139,140,127,128,115,114,101,102,103,116,129,142,141,154,155,168,167,166,153,152,165,164],"BendCount":16},{"Dx":0,"Dy":1,"X":0,"Y":3,"Indices":[39,26,27,40,41],"BendCount":3},{"Dx":-1,"Dy":0,"X":3,"Y":3,"Indices":[42,43,44,45],"BendCount":0},{"Dx":-1,"Dy":0,"X":8,"Y":5,"Indices":[73,74,61,60,59],"BendCount":2},{"Dx":-1,"Dy":0,"X":5,"Y":12,"Indices":[161,162,163],"BendCount":0},{"Dx":-1,"Dy":0,"X":7,"Y":3,"Indices":[46,47,48],"BendCount":0},{"Dx":0,"Dy":-1,"X":5,"Y":4,"Indices":[57,70,71,58],"BendCount":2},{"Dx":0,"Dy":-1,"X":4,"Y":4,"Indices":[56,69,68,55],"BendCount":2},{"Dx":0,"Dy":-1,"X":5,"Y":6,"Indices":[83,96,109,108],"BendCount":1},{"Dx":-1,"Dy":0,"X":5,"Y":2,"Indices":[31,32,33,20,7,8,9,10,11,12,25,38,51,50,63,64,77,90,89,76,75,88,87,86,85,72],"BendCount":13},{"Dx":-1,"Dy":0,"X":5,"Y":9,"Indices":[122,123,110],"BendCount":1},{"Dx":1,"Dy":0,"X":9,"Y":9,"Indices":[126,125,124,111,112],"BendCount":2},{"Dx":-1,"Dy":0,"X":0,"Y":12,"Indices":[156,157,158,159,160,147,148,149,150,151,138,137,136,135,134,121,120,107,106,93,80,79,66,67,54,53,52,65,78,91,104,117,130,143],"BendCount":15},{"Dx":0,"Dy":-1,"X":9,"Y":1,"Indices":[22,35,34,21],"BendCount":2},{"Dx":0,"Dy":-1,"X":6,"Y":6,"Indices":[84,97,98,99,100,113],"BendCount":2},{"Dx":0,"Dy":-1,"X":4,"Y":6,"Indices":[82,95,94,81],"BendCount":2},{"Dx":-1,"Dy":0,"X":2,"Y":2,"Indices":[28,29,30,17,18,19,6,5,4,3,16,15,14,13,0,1,2],"BendCount":8},{"Dx":0,"Dy":-1,"X":2,"Y":9,"Indices":[119,132,133,146,145,144,131,118,105,92],"BendCount":4},{"Dx":0,"Dy":1,"X":10,"Y":4,"Indices":[62,49,36,23,24,37],"BendCount":2}],"chuanSong":[],"blackHole":[],"yaoShi":[]},{"XSize":13,"YSize":13,"Arrows":[{"Dx":-1,"Dy":0,"X":6,"Y":4,"Indices":[58,59,60,73,72,71,84,97,110,111,112,125,124,123,136,137,138,139,140,127,126,113,114,115,116,129,128,141,142,155,168,167,154,153,166,165,152],"BendCount":23},{"Dx":-1,"Dy":0,"X":4,"Y":0,"Indices":[4,5,18,19,20,21,22,23,24,37,50,63,76,89,88,75,62,49,36,35,48,61,74,87,100,99,98,85,86],"BendCount":10},{"Dx":0,"Dy":1,"X":5,"Y":3,"Indices":[44,31,32,45,46,47,34,33],"BendCount":5},{"Dx":0,"Dy":-1,"X":4,"Y":1,"Indices":[17,30,43],"BendCount":0},{"Dx":0,"Dy":1,"X":2,"Y":3,"Indices":[41,28,15,14,13,26,27,40,39],"BendCount":5},{"Dx":1,"Dy":0,"X":4,"Y":10,"Indices":[134,133,120,121,108,95,82,69],"BendCount":3},{"Dx":-1,"Dy":0,"X":0,"Y":0,"Indices":[0,1,2,3,16,29],"BendCount":1},{"Dx":0,"Dy":-1,"X":3,"Y":3,"Indices":[42,55,54,53,52,65,78,91,104,117,130,143,156,157,158,159,160,147,146,145,144,131,132,119,118,105,106,107,94,93,80,81,68,67,66,79,92],"BendCount":18},{"Dx":-1,"Dy":0,"X":4,"Y":4,"Indices":[56,57,70,83,96,109,122,135,148,161,162,149,150,151,164,163],"BendCount":6},{"Dx":-1,"Dy":0,"X":6,"Y":0,"Indices":[6,7,8,9,10,11,12,25,38,51,64,77,90,103,102,101],"BendCount":2}],"chuanSong":[],"blackHole":[],"yaoShi":[]}];
 function compactMetrics(engine,designer,map){
  const analysis=designer.analyze(engine,map,'progressive');if(!analysis.matches)return null;
  const metrics=geometry.measure(map,analysis.simulation),count=map.worms.length;
  const qualified=metrics.directions>=3&&metrics.interiorHeads>=.5&&metrics.maxWormShare<=.25&&metrics.meanTurns>=2&&metrics.turnRatio>=.35&&metrics.headBins>=Math.min(6,Math.ceil(count/3))&&metrics.maxHeadLine<=.5&&metrics.bestScanMistakes>=Math.max(2,Math.floor(count*.2));
  const cost=metrics.bestScanMistakes*6+metrics.bestOpeningMistakes*3+metrics.directionEntropy*8+metrics.interiorHeads*4+metrics.medianTurns+metrics.meanTurns-metrics.maxWormShare*10;
  return{analysis,metrics,qualified,cost};
 }
 async function refineCompact(engine,designer,input,seed,options,onProgress){
  let map=JSON.parse(JSON.stringify(input)),current=compactMetrics(engine,designer,map),best=current?.qualified?{map:JSON.parse(JSON.stringify(map)),...current}:null;
  if(!current)return null;
  const rnd=engine.random(engine.hash(seed)),near=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1,total=options.progressiveDifficulty==='very-hard'?1800:1000;
  for(let step=0;step<total;step++){
   if(step%100===0){if(options.signal?.stop)throw abort();if(Date.now()>=options.deadline)break;onProgress({stage:'refine',iteration:step,total});await pause();}
   const ids=new Set([Math.floor(rnd()*map.worms.length)]);if(rnd()<.2)ids.add(Math.floor(rnd()*map.worms.length));
   const saved=new Map();
   for(const id of ids){const path=map.worms[id].cells;saved.set(id,path);
    if(rnd()<.4){const cuts=[];for(let k=2;k<path.length;k++)if(near(path[0],path[k]))cuts.push(k);if(cuts.length){const k=cuts[Math.floor(rnd()*cuts.length)];map.worms[id].cells=path.slice(0,k).reverse().concat(path.slice(k));}}
    else map.worms[id].cells=path.slice().reverse();
   }
   const candidate=compactMetrics(engine,designer,map),heat=2*(1-step/total);
   if(candidate&&(candidate.cost>=current.cost||rnd()<Math.exp((candidate.cost-current.cost)/Math.max(.01,heat)))){
    current=candidate;if(candidate.qualified&&(!best||candidate.cost>best.cost||Math.abs(candidate.cost-best.cost)<1e-8&&rnd()<.02))best={map:JSON.parse(JSON.stringify(map)),...candidate};
   }else for(const[id,cells]of saved)map.worms[id].cells=cells;
  }
  return best;
 }
 async function generateCompact(engine,designer,input,count,profile,options,onProgress,deadline){
  if(Math.min(input.XSize,input.YSize)<3||input.XSize*input.YSize<count*4)throw Error('Bàn quá hẹp hoặc không đủ ô để đan thân cho ít nhất 10 giun. Map cũ được giữ nguyên.');
  let best=null;await pause();
  const certified=compactPatterns.filter(raw=>raw.Arrows.length===count&&raw.XSize===input.XSize&&raw.YSize===input.YSize);
  const candidates=[...(options.templateMap?.worms?.length===count&&options.templateMap.XSize===input.XSize&&options.templateMap.YSize===input.YSize?[options.templateMap]:[]),...certified.map(raw=>engine.fromGame(raw,input.name))];
  for(let attempt=0;attempt<48&&Date.now()<deadline;attempt++){
   if(options.signal?.stop)throw abort();const seed=String(options.seed||'compact')+'|'+profile+'|'+attempt;
   let map=candidates[attempt];
   if(!map){
    const skeletonMin=Math.max(2,Math.min(3,Math.floor(input.XSize*input.YSize/count*.45)));
    try{map=designer.generateProgressive(input,{count,minLen:skeletonMin,maxLen:skeletonMin,seed,boundaryRoot:true,compact:attempt%3!==2,deadline:Math.min(deadline,Date.now()+300)});}catch{continue;}
    onProgress({stage:'weave',attempt,cells:0,area:input.XSize*input.YSize});
    map=await weave(engine,designer,map,seed,{...options,skeletonMin,weaveSteps:300000,deadline:Math.min(deadline,Date.now()+400),attempt,onProgress});if(!map)continue;
   }else{
    map=JSON.parse(JSON.stringify(map));const rnd=engine.random(engine.hash(seed+'|mirror')),fx=rnd()<.5,fy=rnd()<.5;
    map.worms.forEach(w=>w.cells=w.cells.map(([x,y])=>[fx?input.XSize-1-x:x,fy?input.YSize-1-y:y]));
   }
   if(map.worms.reduce((sum,w)=>sum+w.cells.length,0)!==input.XSize*input.YSize)continue;
   const result=await refineCompact(engine,designer,map,seed,{...options,progressiveDifficulty:profile,deadline},onProgress);
   if(result&&(!best||result.cost>best.cost))best=result;
   if(best&&(certified.length||attempt>=(profile==='very-hard'?12:4)))break;
  }
  if(!best)throw Error('Chưa tạo được bố cục kín bàn cho '+count+' giun với nhiều hướng đầu và đúng nhịp. Map cũ được giữ nguyên. Thử Đổi seed.');
  const map=best.map;map.name=input.name;map.palette=input.palette||null;map.extraTop=input.extraTop||{};colorize(engine,map,String(options.seed)+'|compact');
  const analysis=designer.analyze(engine,map,'progressive'),quality=engine.evaluate(map,analysis.simulation);
  if(!analysis.matches||map.worms.length!==count||engine.index(map).wormAt.some(id=>id<0))throw Error('Không chứng nhận được map nhỏ. Map cũ được giữ nguyên.');
  return{map,analysis,quality,profile,compact:true,compactGeometry:best.metrics};
 }
 async function generate(engine,designer,input,count,options={},onProgress=()=>{}){
  if(!Number.isInteger(count)||count<10||count>150)throw Error('Tăng lựa chọn sau mỗi con chỉ hỗ trợ từ 10 đến tối đa 150 giun. Map cũ được giữ nguyên.');
  if(!input||![input.XSize,input.YSize].every(v=>Number.isInteger(v)&&v>=2&&v<=80))throw Error('Kích thước bàn phải là số nguyên từ 2 đến 80.');
  if(count*2>input.XSize*input.YSize)throw Error('Bàn '+input.XSize+' × '+input.YSize+' không đủ ô cho '+count+' giun. Không đổi kích thước hoặc giảm số giun; map cũ được giữ nguyên.');
  const profile=options.progressiveDifficulty||'very-hard';
  if(!['hard','very-hard'].includes(profile))throw Error('Mức độ khó không hợp lệ. Chọn Khó hoặc Rất khó.');
  const deadline=Date.now()+Math.min(28000,options.searchBudgetMs||24000);
  if(count<20)return generateCompact(engine,designer,input,count,profile,options,onProgress,deadline);
  const basis=pattern(engine,designer,input,count,profile,options);
  if(basis)return refine(engine,designer,input,basis,count,profile,{...options,deadline},onProgress);
  const fitted=await fitSmallerPattern(engine,designer,input,count,profile,options,onProgress,deadline);
  if(fitted)return refine(engine,designer,input,fitted,count,profile,{...options,deadline},onProgress);
  const layout=board(input,count,profile),target=profile==='very-hard'?75:60;
  for(let attempt=0;attempt<24&&Date.now()<deadline;attempt++){
   if(options.signal?.stop)throw abort();onProgress({stage:'weave',attempt,iteration:0,total:4000000,cells:0,area:layout.XSize*layout.YSize});await pause();
   const skeletonMin=options.skeletonMin||Math.max(2,Math.min(count<40&&profile==='very-hard'?16:12,Math.floor(layout.XSize*layout.YSize/count*.55)));
   const seed=String(options.seed||'hard')+'|'+profile+'|'+attempt;
   let map;try{map=designer.generateProgressive(layout,{count,minLen:skeletonMin,maxLen:skeletonMin,seed,boundaryRoot:true,compact:attempt%3!==2,deadline:Math.min(deadline,Date.now()+1200)});}catch{continue;}
   map=await weave(engine,designer,map,seed,{...options,skeletonMin,deadline,attempt,onProgress});if(!map)continue;
   const analysis=designer.analyze(engine,map,'progressive'),quality=engine.evaluate(map,analysis.simulation);onProgress({stage:'candidate-quality',attempt,score:quality?.score,observation:quality?.observation||geometry.measure(map,analysis.simulation)});
   if(quality?.observation?.varied&&quality.score>=target){colorize(engine,map,seed);return{map,quality,analysis,profile,attempts:attempt+1};}
  }
  throw Error('Chưa tìm được map '+(profile==='very-hard'?'Rất khó':'Khó')+' kín bàn, đủ '+count+' giun và đúng nhịp trong thời gian cho phép. Không thay bằng map dễ; map cũ được giữ nguyên. Giữ bàn '+input.XSize+' × '+input.YSize+' và đủ '+count+' giun. Thử Đổi seed.');
 }
 const api={generate,weave,board,colorize,refine};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWProgressiveGenerator=api;
})(typeof globalThis!=='undefined'?globalThis:window);
