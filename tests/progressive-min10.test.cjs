const{test}=require('node:test'),assert=require('node:assert/strict'),E=require('../editor-engine'),D=require('../editor-exit-design'),J=require('../editor-design-jobs'),A=require('../editor-auto-generate'),Q=require('../editor-progressive-quality');
const originals=[require('./fixtures/level-1-original.json'),require('./fixtures/level-2-original.json')];
function available(map,alive){const occupied=new Set([...alive].flatMap(id=>map.worms[id].cells.map(([x,y])=>y*map.XSize+x)));return[...alive].filter(id=>{const[h,n]=map.worms[id].cells,dx=h[0]-n[0],dy=h[1]-n[1];for(let x=h[0]+dx,y=h[1]+dy;x>=0&&y>=0&&x<map.XSize&&y<map.YSize;x+=dx,y+=dy)if(occupied.has(y*map.XSize+x))return false;return true;});}
function verify(result,input,count){
 const map=E.fromGame(E.toGame(result.map)),analysis=D.analyze(E,map,'progressive'),index=E.index(map);
 assert.equal(map.XSize,input.XSize);assert.equal(map.YSize,input.YSize);assert.equal(map.worms.length,count);assert.ok(index.wormAt.every(id=>id>=0));assert.equal(index.overlaps.length,0);assert.equal(analysis.matches,true);assert.equal(analysis.free.length,1);
 assert.equal(E.enemySpeed.readMap(map),E.enemySpeed.readMap(input));assert.equal(map.portals.length+map.holes.length+map.keys.length,0);assert.ok(map.worms.every(w=>!w.ice&&!w.lock&&!w.bomb));
 const live=new Set(map.worms.map((_,i)=>i));for(let step=0;step<count;step++){const choices=available(map,live);assert.equal(choices.length,Math.min(step+1,count-step));assert.ok(choices.includes(analysis.result.order[step]));live.delete(analysis.result.order[step]);}
 for(let variant=0;variant<24;variant++){const alive=new Set(map.worms.map((_,i)=>i));let step=0;while(alive.size){const choices=available(map,alive);assert.ok(choices.length,'legal choice must never deadlock');alive.delete(choices[(variant+step++*7)%choices.length]);}}
 const metrics=Q.measure(map,analysis.simulation);assert.ok(metrics.directions>=3);assert.ok(metrics.bestScanMistakes>=2);assert.ok(metrics.maxWormShare<=.25);
 assert.equal(result.quality.score,E.evaluate(map,analysis.simulation).score,'profile cannot fabricate a high difficulty score');
 return JSON.stringify(map.worms.map(w=>w.cells));
}
test('actual levels 1 and 2 keep original bounds, worm count and speed with blank count',async()=>{
 for(const [i,raw]of originals.entries())for(const progressiveDifficulty of ['hard','very-hard'])for(const seed of ['level-test-a','level-test-b']){
  const input=E.fromGame(raw);E.enemySpeed.setMap(input,i?4:.25);const before=JSON.stringify(input),start=Date.now();
  const result=await J.run('generate',input,{mode:'progressive',autoTune:true,count:0,progressiveDifficulty,seed});verify(result,input,raw.Arrows.length);assert.equal(JSON.stringify(input),before);assert.ok(Date.now()-start<5000);
 }
});
test('requesting exactly ten worms works on both actual level boards, under both difficulty preferences',async()=>{
 for(const raw of originals)for(const progressiveDifficulty of ['hard','very-hard']){
  const input=E.fromGame(raw),before=JSON.stringify(input),result=await J.run('generate',input,{mode:'progressive',autoTune:true,count:10,progressiveDifficulty,seed:'exact-minimum'});
  verify(result,input,10);assert.equal(JSON.stringify(input),before);
 }
});
test('minimum is ten, maximum remains150, and invalid requests do not reduce or inflate the input',async()=>{
 const input=E.fromGame(originals[0]),before=JSON.stringify(input);
 for(const count of [1,5,9,151])await assert.rejects(J.run('generate',input,{mode:'progressive',autoTune:true,count,progressiveDifficulty:'hard'}),count<10?/ít nhất 10/:/tối đa 150/);
 assert.equal(JSON.stringify(input),before);assert.equal(A.PROGRESSIVE_MIN,10);assert.equal(A.PROGRESSIVE_LIMIT,150);
 const advice=A.progressiveCountAdvice(10,10);assert.equal(advice.available,true);assert.ok(advice.recommended>=10);
});
test('a stopped ten-worm request keeps the input and never commits a cached layout',async()=>{
 const input=E.fromGame(originals[0]),before=JSON.stringify(input);await assert.rejects(J.run('generate',input,{mode:'progressive',autoTune:true,count:10,progressiveDifficulty:'hard',signal:{stop:true}}),/Đã dừng/);assert.equal(JSON.stringify(input),before);
});
