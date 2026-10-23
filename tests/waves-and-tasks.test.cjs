const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../editor-engine.js'),designer=require('../editor-exit-design.js'),jobs=require('../editor-design-jobs.js'),createTasks=require('../editor-map-tasks.js');
function independentFree(map,alive,step){const cells=new Map();for(const id of alive)for(const[x,y]of map.worms[id].cells)cells.set(y*map.XSize+x,id);return[...alive].filter(id=>{if(map.worms[id].ice>step)return false;const[h,n]=map.worms[id].cells,dx=h[0]-n[0],dy=h[1]-n[1];for(let x=h[0]+dx,y=h[1]+dy;x>=0&&y>=0&&x<map.XSize&&y<map.YSize;x+=dx,y+=dy)if(cells.has(y*map.XSize+x))return false;return true;});}
test('wave flow differs from increasing choices and handles a short final wave',()=>{assert.deepEqual(designer.waveFlow(10),[1,2,1,3,2,1,4,3,2,1]);assert.deepEqual(designer.waveFlow(8),[1,2,1,3,2,1,2,1]);assert.deepEqual(designer.waveFlow(0),[]);assert.notDeepEqual(designer.waveFlow(10),designer.targetFlow(10));});
test('every ordering within each wave waits for the entire previous wave and solves',()=>{
 const map=designer.generateWaves(engine,engine.empty(12,16,'waves'),{count:10,minLen:3,maxLen:8,seed:'exhaustive'}),expected=designer.waveFlow(10),seen=new Set();
 function visit(alive,step){const key=[...alive].join(',');if(seen.has(key))return;seen.add(key);if(!alive.size)return;const free=independentFree(map,alive,step);assert.equal(free.length,expected[step]);for(const id of free){const next=new Set(alive);next.delete(id);visit(next,step+1);}}
 visit(new Set(map.worms.map((_,i)=>i)),0);assert.ok(seen.size>20);assert.equal(designer.analyze(engine,map,'waves').matches,true);
});
test('large 167-worm wave maps fit the reported 31 by 47 board and survive game JSON round-trip',()=>{
 for(let seed=0;seed<3;seed++){const map=designer.generateWaves(engine,engine.empty(31,47,'test'),{count:167,minLen:4,maxLen:18,seed:'large-'+seed}),restored=engine.fromGame(engine.toGame(map));assert.equal(restored.worms.length,167);assert.equal(engine.validate(restored,engine.index(restored)).length,0);assert.equal(designer.analyze(engine,restored,'waves').matches,true);for(let order=0;order<8;order++){const alive=new Set(restored.worms.map((_,i)=>i));let step=0;while(alive.size){const free=independentFree(restored,alive,step);assert.equal(free.length,designer.waveFlow(167)[step]);alive.delete(free[(order+step*7)%free.length]);step++;}}}
});
test('an early timer or same-wave physical dependency is not falsely certified',()=>{
 const map=designer.generateWaves(engine,engine.empty(12,16,'waves'),{count:10,minLen:3,maxLen:8,seed:'bad'});map.worms.find(w=>w.ice===3).ice=2;assert.equal(designer.analyze(engine,map,'waves').matches,false);
});
test('worker job validates successful maps and rejects impossible/unknown jobs',async()=>{
 for(const mode of ['any','progressive','waves']){const r=await jobs.run('generate',engine.empty(12,16,'test'),{mode,count:10,minLen:3,maxLen:8,seed:mode});assert.equal(r.analysis.matches,true);assert.ok(r.quality);}
 await assert.rejects(jobs.run('generate',engine.empty(6,6,'test'),{mode:'progressive',count:20,minLen:4}),/không đủ ô/);await assert.rejects(jobs.run('invalid',engine.empty(6,6,'test')),/không hợp lệ/);
});
class FakeWorker{static instances=[];constructor(){FakeWorker.instances.push(this)}postMessage(message){this.message=message}terminate(){this.terminated=true}}
test('worker coordinator cleans up success, error, crashes and cancellation',async()=>{
 const tasks=createTasks({WorkerClass:FakeWorker});let p=tasks.run('generate',{},{}),w=FakeWorker.instances.at(-1);w.onmessage({data:{id:w.message.id,type:'result',result:{ok:true}}});assert.deepEqual(await p,{ok:true});assert.equal(w.terminated,true);
 p=tasks.run('generate',{},{});w=FakeWorker.instances.at(-1);w.onmessage({data:{id:w.message.id,type:'error',error:'bad map'}});await assert.rejects(p,/bad map/);assert.equal(tasks.busy,false);
 p=tasks.run('generate',{},{});w=FakeWorker.instances.at(-1);w.onerror({message:'worker failed'});await assert.rejects(p,/worker failed/);
 p=tasks.run('generate',{},{});w=FakeWorker.instances.at(-1);tasks.stop();await assert.rejects(p,{name:'AbortError'});assert.equal(w.terminated,true);assert.equal(tasks.busy,false);
});
test('late/stale worker messages cannot resolve a newer task',async()=>{
 const tasks=createTasks({WorkerClass:FakeWorker}),p=tasks.run('generate',{},{}),old=FakeWorker.instances.at(-1);tasks.stop();await assert.rejects(p);const next=tasks.run('generate',{},{}),worker=FakeWorker.instances.at(-1);old.onmessage({data:{id:old.message.id,type:'result',result:'stale'}});assert.equal(tasks.busy,true);worker.onmessage({data:{id:worker.message.id,type:'result',result:'new'}});assert.equal(await next,'new');
});
