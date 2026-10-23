/* Automatic generation treats numeric controls as preferences. Mode, board size
 * and minimum coverage stay fixed; actual changes are returned to the UI. */
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 function packedProgressive(input,options={}){
  const originalW=input.XSize,originalH=input.YSize;
  const layouts=[false,true].map(rotate=>{const W=rotate?originalH:originalW,H=rotate?originalW:originalH;return{rotate,W,H,capacity:Math.min(Math.floor((2*W+1)/3),Math.pow(2,Math.min(20,H-1))-1)};});
  layouts.sort((a,b)=>b.capacity-a.capacity);
  const {rotate,W,H,capacity}=layouts[0],count=Math.max(1,Math.min(capacity,Math.floor(options.count||capacity)));
  const map=clone(input);map.worms=[];map.portals=[];map.holes=[];map.keys=[];
  function add(x,y,w,h,n,up){
   const cells=[];
   if(n===1){
    // A column snake fills a leaf rectangle; its head faces the ancestor bar.
    for(let col=w-1;col>=0;col--){const down=(w-1-col)%2===0?up:!up;for(let row=0;row<h;row++)cells.push([x+col,y+(down?h-1-row:row)]);}
   }else{
    // A U-shaped parent encloses two disjoint column ranges. Removing it
    // opens both children. Descendant rays meet ancestors only, never siblings.
    for(let row=0;row<h;row++)cells.push([x+w-1,y+(up?h-1-row:row)]);
    for(let col=w-2;col>=0;col--)cells.push([x+col,y+(up?0:h-1)]);
    for(let row=1;row<h;row++)cells.push([x,y+(up?row:h-1-row)]);
   }
   map.worms.push({cells:cells.map(([a,b])=>rotate?[b,a]:[a,b]),color:null,ice:0,lock:0,bomb:0,area:0,extra:{}});
   if(n===1)return;
   const innerX=x+1,innerY=y+(up?1:0),innerW=w-2,innerH=h-1;
   if(n===2){add(innerX,innerY,innerW,innerH,1,!up);return;}
   let left=Math.floor((n-1)/2);if(n%2===1&&left%2===0)left--;
   const right=n-1-left,widthFor=nodes=>Math.floor(3*nodes/2),extra=innerW-widthFor(left)-widthFor(right);
   const leftWidth=widthFor(left)+Math.floor(extra*left/(left+right));
   add(innerX,innerY,leftWidth,innerH,left,!up);
   add(innerX+leftWidth,innerY,innerW-leftWidth,innerH,right,!up);
  }
  add(0,0,W,H,count,true);return map;
 }
 function packedIndependent(input,options={}){
  const map=clone(input);map.worms=[];map.portals=[];map.holes=[];map.keys=[];
  const rotate=map.XSize>map.YSize,W=rotate?map.YSize:map.XSize,H=rotate?map.XSize:map.YSize;
  const count=Math.max(1,Math.min(H,Math.floor(options.count||H)));
  for(let id=0;id<count;id++){
   const from=Math.floor(id*H/count),to=Math.floor((id+1)*H/count),cells=[];
   for(let row=from;row<to;row++)for(let col=0;col<W;col++){const x=(row-from)%2?W-1-col:col;cells.push(rotate?[row,x]:[x,row]);}
   map.worms.push({cells,color:null,ice:0,lock:0,bomb:0,area:0,extra:{}});
  }
  return map;
 }
 function actualSettings(map,requested,settings){
  const lengths=map.worms.map(w=>w.cells.length);
  const blockers={ice:map.worms.filter(w=>w.ice).length,lock:map.worms.filter(w=>w.lock).length,bomb:map.worms.filter(w=>w.bomb).length,portal:map.portals.length,hole:map.holes.length};
  return{...settings,W:map.XSize,H:map.YSize,minLen:Math.min(...lengths),maxLen:Math.max(...lengths),count:requested.count?map.worms.length:0,blockers};
 }
 async function generate(engine,designer,density,input,requested,onProgress,strict){
  if(!input||![input.XSize,input.YSize].every(value=>Number.isInteger(value)&&value>=2&&value<=80))throw Error('Kích thước bàn phải là số nguyên từ 2 đến 80.');
  const minimum=Math.max(0,Math.min(95,Number(requested.minCoverage)||0)),mode=requested.mode||'any';
  const variants=[{...requested,searchAttempts:1,searchBudgetMs:2500},
   {...requested,count:0,minLen:2,maxLen:Math.max(80,requested.maxLen||0),extend:true,searchAttempts:2,searchBudgetMs:5000}];
  let lastError;
  for(let attempt=0;attempt<variants.length;attempt++){
   onProgress({stage:attempt?'adjust':'requested',iteration:attempt,total:3});
   try{
    const settings=variants[attempt],result=await strict(settings);
    if(!attempt)return result;
    return{...result,autoAdjusted:true,settings:actualSettings(result.map,requested,settings)};
   }catch(error){lastError=error;}
  }
  onProgress({stage:'construct',iteration:2,total:3});
  // A complete tiling is the bounded final fallback. It trades worm count and
  // length preferences for a certified result instead of returning a sparse map.
  let map=mode==='progressive'?packedProgressive(input,requested):packedIndependent(input,requested);
  if(mode==='waves')map=designer.applyWaves(engine,map,requested);
  if(!map)throw Error('Không dựng được bố cục theo đợt: '+lastError?.message);
  const analysis=designer.analyze(engine,map,mode),coverage=density.measure(map);
  if(!analysis.matches||coverage.percent+1e-9<minimum)throw Error('Không kiểm chứng được kết quả tự tạo. Map đang sửa được giữ nguyên.');
  const quality=engine.evaluate(map,analysis.simulation);
  if(!quality)throw Error('Không chấm được kết quả tự tạo.');
  return{map,analysis,quality,coverage,autoAdjusted:true,settings:actualSettings(map,requested,requested)};
 }
 const api={generate,packedProgressive,packedIndependent};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWAutoGenerate=api;
})(typeof globalThis!=='undefined'?globalThis:window);
