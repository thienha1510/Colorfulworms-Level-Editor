/* Dense, intertwined physical progressive puzzles. No timer or extra blocker. */
(function(root){
 'use strict';
 const geometry=typeof module!=='undefined'&&module.exports?require('./editor-progressive-quality.js'):root.CWProgressiveQuality;
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 const abort=()=>{const error=Error('Đã dừng. Map cũ được giữ nguyên.');error.name='AbortError';return error;};
 function board(input,count,profile){
  const minimum=profile==='very-hard'?32:18,W0=Math.max(16,input.XSize),H0=Math.max(16,input.YSize),scale=Math.max(1,Math.sqrt(count*minimum/(W0*H0)));
  let W=Math.min(80,Math.ceil(W0*scale)),H=Math.min(80,Math.ceil(H0*scale));
  while(W*H<count*minimum){if(W<H&&W<80)W++;else if(H<80)H++;else if(W<80)W++;else break;}
  return{...input,XSize:W,YSize:H,worms:[],portals:[],holes:[],keys:[]};
 }
 async function weave(engine,designer,map,seed,options){
  const W=map.XSize,H=map.YSize,area=W*H,analysis=designer.analyze(engine,map,'progressive');if(!analysis.matches)return null;
  const rnd=engine.random(engine.hash(seed+'|weave')),rank=[],release=map.worms.map(()=>-1),occupied=new Int32Array(area).fill(-1),watch=Array.from({length:area},()=>[]);
  analysis.result.order.forEach((id,step)=>rank[id]=step);
  const minimum=options.skeletonMin||12,maximum=Math.max(minimum,Math.floor(area*.3));
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
  if(used!==area)return null;
  map.worms.forEach((worm,id)=>worm.cells=paths[id].map(cell=>[cell%W,Math.floor(cell/W)]));
  return designer.analyze(engine,map,'progressive').matches?map:null;
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
  const iterations=Math.max(400,Math.round(3200*Math.pow(50/Math.max(50,count),2))),deadline=Date.now()+Math.min(28000,options.searchBudgetMs||24000);
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
  for(const map of sources){if(map.worms.length!==count||map.XSize<input.XSize||map.YSize<input.YSize)continue;const analysis=designer.analyze(engine,map,'progressive');if(!analysis.matches)continue;const quality=engine.evaluate(map,analysis.simulation);if(quality?.observation?.varied&&quality.score>=target)candidates.push({map,quality});}
  candidates.sort((a,b)=>a.map.XSize*a.map.YSize-b.map.XSize*b.map.YSize||Math.abs(a.quality.score-goal)-Math.abs(b.quality.score-goal));
  if(!candidates.length)return null;
  const area=candidates[0].map.XSize*candidates[0].map.YSize,pool=candidates.filter(value=>value.map.XSize*value.map.YSize===area),rnd=engine.random(engine.hash(String(options.seed)+'|base'));
  return pool[Math.floor(rnd()*pool.length)].map;
 }
 async function generate(engine,designer,input,count,options={},onProgress=()=>{}){
  if(!Number.isInteger(count)||count<1||count>100)throw Error('Tăng lựa chọn sau mỗi con chỉ hỗ trợ từ 1 đến tối đa 100 giun. Map cũ được giữ nguyên.');
  const profile=options.progressiveDifficulty||'very-hard';
  if(!['hard','very-hard'].includes(profile))throw Error('Mức độ khó không hợp lệ. Chọn Khó hoặc Rất khó.');
  const minimum=profile==='very-hard'?32:20;
  if(count<minimum)throw Error((profile==='very-hard'?'Rất khó cần ít nhất 32':'Khó cần ít nhất 20')+' giun để đủ độ phức tạp. Hãy nhập '+minimum+'–100 giun hoặc chọn mức phù hợp. Map cũ được giữ nguyên.');
  const basis=pattern(engine,designer,input,count,profile,options);
  if(basis)return refine(engine,designer,input,basis,count,profile,options,onProgress);
  const layout=board(input,count,profile),deadline=Date.now()+Math.min(28000,options.searchBudgetMs||24000),target=profile==='very-hard'?75:60;
  for(let attempt=0;attempt<24&&Date.now()<deadline;attempt++){
   if(options.signal?.stop)throw abort();onProgress({stage:'weave',attempt,iteration:0,total:4000000,cells:0,area:layout.XSize*layout.YSize});await pause();
   const skeletonMin=options.skeletonMin||(count<40&&profile==='very-hard'?16:12);
   const seed=String(options.seed||'hard')+'|'+profile+'|'+attempt;
   let map;try{map=designer.generateProgressive(layout,{count,minLen:skeletonMin,maxLen:skeletonMin,seed,boundaryRoot:true,compact:attempt%3!==2,deadline:Math.min(deadline,Date.now()+1200)});}catch{continue;}
   map=await weave(engine,designer,map,seed,{...options,skeletonMin,deadline,attempt,onProgress});if(!map)continue;
   const analysis=designer.analyze(engine,map,'progressive'),quality=engine.evaluate(map,analysis.simulation);onProgress({stage:'candidate-quality',attempt,score:quality?.score,observation:quality?.observation||geometry.measure(map,analysis.simulation)});
   if(quality?.observation?.varied&&quality.score>=target){colorize(engine,map,seed);return{map,quality,analysis,profile,attempts:attempt+1};}
  }
  throw Error('Chưa tìm được map '+(profile==='very-hard'?'Rất khó':'Khó')+' kín bàn, đủ '+count+' giun và đúng nhịp trong thời gian cho phép. Không thay bằng map dễ; map cũ được giữ nguyên. Thử Đổi seed.');
 }
 const api={generate,weave,board,colorize,refine};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWProgressiveGenerator=api;
})(typeof globalThis!=='undefined'?globalThis:window);
