/* Full-board generation. Size, exit mode and requested/original worm count stay fixed;
 * lengths can grow to cover the board. The result is committed only after coverage and solve checks. */
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 function random(seed){let s=2166136261;for(const c of String(seed||'full'))s=Math.imul(s^c.charCodeAt(0),16777619);return()=>{s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
 function mixTail(cells,rnd){
  // Backbite moves keep every cell occupied and keep the head/neck fixed.
  for(let pass=0;pass<Math.min(600,cells.length*5);pass++){
   const tail=cells.at(-1),candidates=[];
   for(let i=1;i<cells.length-2;i++)if(Math.abs(tail[0]-cells[i][0])+Math.abs(tail[1]-cells[i][1])===1)candidates.push(i);
   if(!candidates.length)break;const k=candidates[Math.floor(rnd()*candidates.length)];
   cells=cells.slice(0,k+1).concat(cells.slice(k+1).reverse());
  }
  return cells;
 }
 // A positive explicit entry wins. Blank/zero inherits the original level.
 function resolveCount(input,options={}){
  const explicit=Number(options.count||0),original=Number(options.originalCount||input?.worms?.length||0);
  for(const value of [explicit,original])if(!Number.isInteger(value)||value<0)throw Error('Số giun phải là số nguyên không âm. Để trống hoặc nhập 0 để dùng số giun của map gốc.');
  const count=explicit||original;
  if(count>Math.floor(input.XSize*input.YSize/2))throw Error('Bàn '+input.XSize+' × '+input.YSize+' không đủ ô cho '+count+' giun (mỗi giun cần ít nhất 2 ô). Số giun không bị tự giảm; map cũ được giữ nguyên.');
  return{count,source:explicit?'explicit':original?'original':'new'};
 }
 function packedProgressive(input,options={}){
  const originalW=input.XSize,originalH=input.YSize,rnd=random(options.seed);
  const layouts=[false,true].map(rotate=>{const W=rotate?originalH:originalW,H=rotate?originalW:originalH;return{rotate,W,H,capacity:Math.min(Math.floor((2*W+1)/3),Math.pow(2,Math.min(20,H-1))-1)};});
  layouts.sort((a,b)=>b.capacity-a.capacity);
  const layout=layouts[0],{rotate,W,H,capacity}=layout;
  const requested=resolveCount(input,options),count=requested.count||Math.max(1,Math.floor(capacity*(.6+rnd()*.3)));
  if(count>capacity)throw Error('Bộ tạo tăng lựa chọn hiện chưa dựng được bố cục kín bàn với đúng '+count+' giun trên bàn '+originalW+' × '+originalH+'. Không tự giảm số giun; map cũ được giữ nguyên.');
  const map=clone(input);map.worms=[];map.portals=[];map.holes=[];map.keys=[];
  const widthFor=nodes=>Math.floor(3*nodes/2),flipX=rnd()<.5,flipY=rnd()<.5;
  function add(x,y,w,h,n,up){
   let cells=[];const localFlip=rnd()<.5;
   if(n===1){
    for(let col=w-1;col>=0;col--){const down=(w-1-col)%2===0?up:!up;for(let row=0;row<h;row++)cells.push([x+col,y+(down?h-1-row:row)]);}
    cells=mixTail(cells,rnd);
   }else{
    for(let row=0;row<h;row++)cells.push([x+w-1,y+(up?h-1-row:row)]);
    for(let col=w-2;col>=0;col--)cells.push([x+col,y+(up?0:h-1)]);
    for(let row=1;row<h;row++)cells.push([x,y+(up?row:h-1-row)]);
   }
   map.worms.push({cells:cells.map(([a,b])=>{if(localFlip)a=2*x+w-1-a;let[X,Y]=rotate?[b,a]:[a,b];return[flipX?originalW-1-X:X,flipY?originalH-1-Y:Y];}),color:null,ice:0,lock:0,bomb:0,area:0,extra:{}});
   if(n===1)return;
   const innerX=x+1,innerY=y+(up?1:0),innerW=w-2,innerH=h-1;
   if(n===2){add(innerX,innerY,innerW,innerH,1,!up);return;}
   const splits=[],maxChild=Math.pow(2,Math.min(20,innerH-1))-1;
   for(let left=1;left<n-1;left++){const right=n-1-left;if(n%2&&left%2===0||left>maxChild||right>maxChild||widthFor(left)+widthFor(right)>innerW)continue;splits.push(left);}
   const left=splits[Math.floor(rnd()*splits.length)],right=n-1-left,extra=innerW-widthFor(left)-widthFor(right);
   const leftWidth=widthFor(left)+Math.floor(rnd()*(extra+1));
   add(innerX,innerY,leftWidth,innerH,left,!up);
   add(innerX+leftWidth,innerY,innerW-leftWidth,innerH,right,!up);
  }
  add(0,0,W,H,count,true);return map;
 }
 function packedIndependent(input,options={}){
  const map=clone(input);map.worms=[];map.portals=[];map.holes=[];map.keys=[];
  const rnd=random(options.seed),preferred=rnd()<.5,requested=resolveCount(input,options),layouts=[preferred,!preferred].map(rotate=>({rotate,W:rotate?map.YSize:map.XSize,H:rotate?map.XSize:map.YSize})),layout=layouts.find(v=>!requested.count||Math.floor(v.W/2)*v.H>=requested.count);
  if(!layout)throw Error('Bộ tạo hiện chưa xếp được đúng '+requested.count+' giun trên bàn này. Không tự giảm số giun; map cũ được giữ nguyên.');
  const{rotate,W,H}=layout,perBand=Math.floor(W/2);
  const mean=Math.max(3,Math.min(30,((options.minLen||4)+(options.maxLen||18))/2));
  const count=requested.count||Math.max(1,Math.min(perBand*H,Math.floor(W*H/mean)));
  const minBands=Math.ceil(count/perBand),maxBands=Math.min(H,count),bands=Math.max(minBands,Math.min(maxBands,Math.round(H/(2+rnd()*2))));
  const heights=Array(bands).fill(1),sizes=Array(bands).fill(1);
  for(let left=H-bands;left>0;left--)heights[Math.floor(rnd()*bands)]++;
  for(let left=count-bands;left>0;left--){let best=-1,score=-1;for(let i=0;i<bands;i++)if(sizes[i]<perBand){const s=heights[i]/sizes[i]+rnd()*.2;if(s>score){score=s;best=i;}}sizes[best]++;}
  let y=0;
  for(let band=0;band<bands;band++){
   const h=heights[band],n=sizes[band],widths=Array(n).fill(2),flip=rnd()<.5;
   for(let left=W-2*n;left>0;left--)widths[Math.floor(rnd()*n)]++;
   let x=0;
   for(const width of widths){let cells=[],flipY=rnd()<.5;
    for(let row=0;row<h;row++)for(let col=0;col<width;col++)cells.push([x+(row%2?width-1-col:col),y+(flipY?h-1-row:row)]);
    cells=mixTail(cells,rnd).map(([a,b])=>{if(flip)a=W-1-a;return rotate?[b,a]:[a,b];});
    map.worms.push({cells,color:null,ice:0,lock:0,bomb:0,area:0,extra:{}});x+=width;
   }
   y+=h;
  }
  return map;
 }
 function actualSettings(map,requested){const lengths=map.worms.map(w=>w.cells.length);return{...requested,W:map.XSize,H:map.YSize,minLen:Math.min(...lengths),maxLen:Math.max(...lengths),count:requested.count?map.worms.length:0,minCoverage:100,blockers:{ice:map.worms.filter(w=>w.ice).length,lock:map.worms.filter(w=>w.lock).length,bomb:map.worms.filter(w=>w.bomb).length,portal:map.portals.length,hole:map.holes.length}};}
 async function generate(engine,designer,density,input,requested,onProgress){
  if(!input||![input.XSize,input.YSize].every(v=>Number.isInteger(v)&&v>=2&&v<=80))throw Error('Kích thước bàn phải là số nguyên từ 2 đến 80.');
  const countRequest=resolveCount(input,requested);
  const mode=requested.mode||'any';if(mode==='waves')throw Error('Đang trong quá trình phát triển');
  if(!['any','progressive'].includes(mode))throw Error('Chế độ tạo map không hợp lệ.');
  onProgress({stage:'construct',iteration:0,total:2});
  let map=mode==='progressive'?packedProgressive(input,requested):packedIndependent(input,requested);
  if(mode==='any'&&requested.blockers)engine.addBlockers(map,{ice:requested.blockers.ice||0,bomb:requested.blockers.bomb||0,lock:0,portal:0,hole:0},engine.random(engine.hash(requested.seed+'|full-blockers')));
  if(mode==='any'&&requested.fitTarget!=null){
   const candidate=(await engine.X(map,requested.fitTarget,requested.iterations||1500,requested.seed,iteration=>onProgress({stage:'target',iteration}),requested.signal||null)).m;
   if(density.measure(candidate).cells===input.XSize*input.YSize&&designer.analyze(engine,candidate,mode).matches)map=candidate;
  }
  if(countRequest.count&&map.worms.length!==countRequest.count)throw Error('Kết quả sai số giun: cần '+countRequest.count+', nhận '+map.worms.length+'. Map cũ được giữ nguyên.');
  const analysis=designer.analyze(engine,map,mode),coverage=density.measure(map);
  if(!analysis.matches||coverage.cells!==coverage.area)throw Error('Không kiểm chứng được bố cục lấp kín. Map đang sửa được giữ nguyên.');
  const quality=engine.evaluate(map,analysis.simulation);if(!quality)throw Error('Không chấm được kết quả tự tạo.');
  return{map,analysis,quality,coverage,autoAdjusted:true,countRequest:{...countRequest,count:map.worms.length},settings:actualSettings(map,requested)};
 }
 const api={generate,packedProgressive,packedIndependent,resolveCount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWAutoGenerate=api;
})(typeof globalThis!=='undefined'?globalThis:window);
