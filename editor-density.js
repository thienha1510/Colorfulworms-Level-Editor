/* Coverage-aware tail growth. Heads stay fixed; every committed edit preserves the selected exit rule. */
(function(root){
 'use strict';
 function measure(map){const cells=map.worms.reduce((sum,w)=>sum+w.cells.length,0),area=map.XSize*map.YSize;return{cells,area,percent:100*cells/area};}
 function grow(engine,designer,input,options={}){
  const map=JSON.parse(JSON.stringify(input)),mode=options.mode||'any',max=Math.max(2,options.maxLen||40),W=map.XSize,H=map.YSize;
  const initial=designer.analyze(engine,map,mode);if(!initial.matches)return map;
  const rnd=engine.random(engine.hash(String(options.seed)+'|fill'));
  const rank=new Map(initial.result.order.map((id,i)=>[id,i])),occupied=new Int32Array(W*H).fill(-1),watch=Array.from({length:W*H},()=>[]);
  map.worms.forEach((w,id)=>w.cells.forEach(([x,y])=>occupied[y*W+x]=id));
  const release=map.worms.map(()=>-1);
  map.worms.forEach((w,id)=>{let[x,y]=w.cells[0];const dx=x-w.cells[1][0],dy=y-w.cells[1][1];for(x+=dx,y+=dy;x>=0&&y>=0&&x<W&&y<H;x+=dx,y+=dy){const cell=y*W+x;watch[cell].push(id);if(occupied[cell]>=0)release[id]=Math.max(release[id],rank.get(occupied[cell]));}});
  const directions=[[1,0],[-1,0],[0,1],[0,-1]],shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const valid=(x,y,id)=>x>=0&&y>=0&&x<W&&y<H&&occupied[y*W+x]<0&&!watch[y*W+x].includes(id);
  let checks=0;
  function commit(w,id,at,cells,strict){
   if(cells.some(([x,y])=>!valid(x,y,id)))return false;
   // Preserving each release time is cheap. Other moves use the complete validator.
   const sameSchedule=cells.every(([x,y])=>watch[y*W+x].every(other=>mode==='waves'?w.ice<map.worms[other].ice:rank.get(id)<=release[other]));
   if(strict&&!sameSchedule)return false;
   if((!sameSchedule||!strict)&&checks>=1200)return false;
   w.cells.splice(at,0,...cells);
   if(!sameSchedule||!strict){checks++;if(!designer.analyze(engine,map,mode).matches){w.cells.splice(at,cells.length);return false;}}
   cells.forEach(([x,y])=>occupied[y*W+x]=id);return true;
  }
  const original=JSON.stringify(map.worms);
  for(const strict of [true,false])for(let pass=0;pass<12;pass++){
   let changed=false;
   for(const id of shuffle(map.worms.map((_,i)=>i))){const w=map.worms[id];
    if(w.cells.length<max){const[x,y]=w.cells.at(-1);for(const[dx,dy]of shuffle(directions.slice()))if(commit(w,id,w.cells.length,[[x+dx,y+dy]],strict)){changed=true;break;}}
    // Rewire a tail through its own body without moving the head or changing
    // occupied cells. This opens endpoints near pockets that simple extension misses.
    if(w.cells.length<max&&w.cells.length>4){
     const tail=w.cells.at(-1),indices=shuffle(w.cells.map((_,i)=>i).slice(1,-2));
     for(const k of indices){const at=w.cells[k];if(Math.abs(at[0]-tail[0])+Math.abs(at[1]-tail[1])!==1)continue;
      const old=w.cells;w.cells=old.slice(0,k+1).concat(old.slice(k+1).reverse());
      const[x,y]=w.cells.at(-1);let added=false;
      for(const[dx,dy]of shuffle(directions.slice()))if(commit(w,id,w.cells.length,[[x+dx,y+dy]],strict)){added=true;changed=true;break;}
      if(added)break;w.cells=old;
     }
    }
    for(let i=1;i<w.cells.length-1&&w.cells.length+2<=max;i++){
     const a=w.cells[i],b=w.cells[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
     for(const side of shuffle([-1,1]))if(commit(w,id,i+1,[[a[0]-dy*side,a[1]+dx*side],[b[0]-dy*side,b[1]+dx*side]],strict)){changed=true;i+=2;break;}
    }
   }
   if(!changed)break;
  }
  // Greedy tie-breaking can change after added dependencies; validate the whole result.
  if(original!==JSON.stringify(map.worms)&&!designer.analyze(engine,map,mode).matches)return JSON.parse(JSON.stringify(input));
  return map;
 }
 const api={measure,grow};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWMapDensity=api;
})(typeof globalThis!=='undefined'?globalThis:window);
