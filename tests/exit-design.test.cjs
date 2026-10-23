const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const projectRoot=fs.existsSync(path.join(__dirname,'../examples/gen_200.txt'))?path.join(__dirname,'..'):'D:/VNG/Tool/colorful-worms-level-editor_2026-10-12/colorful-worms-level-editor';
const designer=require('../editor-exit-design.js');
const engine=require('../editor-engine.js');
const make=(count=7,seed='physical')=>designer.generateProgressive(engine.empty(12,16,'test.txt'),{count,minLen:3,maxLen:10,seed});
// Independent grid oracle: no editor simulator, caches, ice timers or release IDs.
function choices(map,remaining){
 const cells=new Map();for(const i of remaining)for(const[x,y]of map.worms[i].cells)cells.set(y*map.XSize+x,i);
 return [...remaining].filter(i=>{const [head,neck]=map.worms[i].cells,dx=head[0]-neck[0],dy=head[1]-neck[1];for(let x=head[0]+dx,y=head[1]+dy;x>=0&&y>=0&&x<map.XSize&&y<map.YSize;x+=dx,y+=dy)if(cells.has(y*map.XSize+x))return false;return true;});
}
function verifyRoute(map,order){const remaining=new Set(map.worms.map((_,i)=>i)),flow=[];for(const next of order){const free=choices(map,remaining);flow.push(free.length);assert.ok(free.includes(next),'suggested worm is physically blocked');remaining.delete(next);}assert.equal(remaining.size,0);assert.deepEqual(flow,designer.targetFlow(map.worms.length));}

test('target sequence respects the remaining worm count through the final move',()=>{
 assert.deepEqual(designer.targetFlow(10),[1,2,3,4,5,5,4,3,2,1]);assert.deepEqual(designer.targetFlow(7),[1,2,3,4,3,2,1]);assert.deepEqual(designer.targetFlow(0),[]);
});
test('current mode preserves ordinary maps and does not mutate input',async()=>{
 const map=engine.fromGame({XSize:8,YSize:6,Arrows:Array.from({length:6},(_,i)=>({Indices:[i*8,i*8+1]}))}),saved=JSON.stringify(map);
 const result=await designer.optimize(engine,map,{mode:'any',iterations:2});assert.equal(result.analysis.matches,true);assert.equal(result.analysis.free.length,6);assert.equal(JSON.stringify(map),saved);
});
test('generated sequence opens paths using bodies with no timers or extra blockers',()=>{
 const input=engine.empty(12,16,'test'),saved=JSON.stringify(input),map=designer.generateProgressive(input,{count:10,minLen:3,maxLen:12,seed:'bodies'}),analysis=designer.analyze(engine,map,'progressive');
 assert.equal(JSON.stringify(input),saved);assert.equal(analysis.matches,true);assert.equal(analysis.certified,true);assert.equal(choices(map,new Set(map.worms.map((_,i)=>i))).length,1);
 assert.ok(map.worms.every(w=>!w.ice&&!w.lock&&!w.bomb&&!w.area));assert.equal(map.portals.length+map.keys.length+map.holes.length,0);
 verifyRoute(map,Array.from(analysis.result.order));
 const sim=engine.simulate(map);assert.ok(sim.paths.filter(p=>p.blockers.length).length===9);
});
test('every possible legal ordering of seven worms remains solvable',()=>{
 const map=make(),memo=new Set();let terminals=0;
 function visit(remaining){const key=[...remaining].join(',');if(memo.has(key))return;memo.add(key);if(!remaining.size){terminals++;return;}const free=choices(map,remaining);assert.ok(free.length,'reachable deadlock');for(const i of free){const next=new Set(remaining);next.delete(i);visit(next);}}
 visit(new Set(map.worms.map((_,i)=>i)));assert.ok(memo.size>15);assert.equal(terminals,1);verifyRoute(map,Array.from(designer.analyze(engine,map,'progressive').result.order));
});
test('old all-outward ice schedules are no longer certified as a physical sequence',()=>{
 const map=engine.fromGame({XSize:8,YSize:10,Arrows:Array.from({length:10},(_,i)=>({Indices:[i*8,i*8+1],bingDong:Math.floor((i+1)/2)}))});
 const a=designer.analyze(engine,map,'progressive');assert.equal(a.safe,true);assert.deepEqual(Array.from(a.flow),designer.targetFlow(10));assert.equal(a.certified,false);assert.equal(a.matches,false);
});
test('a later bad stage is rejected even if the first three counts match',()=>{
 let bad;for(let seed=0;seed<40&&!bad;seed++){
  const map=make(10,'mutate-'+seed);for(let i=0;i<map.worms.length;i++){map.worms[i].cells.reverse();const a=designer.analyze(engine,map,'progressive');if(a.safe&&a.flow.slice(0,3).join(',')==='1,2,3'&&!a.matches){bad=a;break;}map.worms[i].cells.reverse();}
 }
 assert.ok(bad);assert.equal(bad.matches,false);assert.ok(bad.firstMismatch>=3);
});
test('incompatible existing maps fail without adding ice or changing geometry',async()=>{
 const map=engine.fromGame({XSize:8,YSize:6,Arrows:[{Indices:[0,1]},{Indices:[8,9]},{Indices:[16,17]}]}),saved=JSON.stringify(map);
 await assert.rejects(designer.optimize(engine,map,{mode:'progressive',allowIce:true}),/Tự tạo/);assert.equal(JSON.stringify(map),saved);
});
test('already valid geometry is preserved by optimization',async()=>{
 const map=make(12),saved=JSON.stringify(map),result=await designer.optimize(engine,map,{mode:'progressive'});assert.equal(result.analysis.matches,true);assert.equal(JSON.stringify(result.map),saved);assert.equal(JSON.stringify(map),saved);
});
test('104-worm maps round-trip and stay solvable for many different choices',()=>{
 for(let seed=0;seed<5;seed++){
  const map=designer.generateProgressive(engine.empty(32,51,'gen_200.txt'),{count:104,minLen:4,maxLen:24,seed:'large-'+seed});
  assert.equal(map.worms.length,104);assert.ok(map.worms.every(w=>w.cells.length>=4&&w.cells.length<=24));assert.equal(engine.validate(map,engine.index(map)).length,0);
  const restored=engine.fromGame(JSON.parse(JSON.stringify(engine.toGame(map)))),a=designer.analyze(engine,restored,'progressive');assert.equal(a.matches,true);verifyRoute(restored,Array.from(a.result.order));
  for(let order=0;order<20;order++){const remaining=new Set(restored.worms.map((_,i)=>i));let step=0;while(remaining.size){const free=choices(restored,remaining);assert.ok(free.length,'independent random path deadlocks');remaining.delete(free[(step++*17+order)%free.length]);}}
 }
});
test('small counts and many seeds have a complete physical release sequence',()=>{
 for(const count of [1,2,3,4,5,6,9,20])for(let seed=0;seed<4;seed++){const map=make(count,'small-'+count+'-'+seed),a=designer.analyze(engine,map,'progressive');assert.equal(a.matches,true);verifyRoute(map,Array.from(a.result.order));}
});
test('impossible settings fail explicitly instead of returning a partial map',()=>{
 assert.throws(()=>designer.generateProgressive(engine.empty(6,6,'test'),{count:20,minLen:4}),/không đủ ô/);
 assert.throws(()=>designer.generateProgressive(engine.empty(3,3,'test'),{count:4,minLen:2,maxLen:2}),/Chưa xếp được/);
});
test('cycles, empty boards, overlaps and self-facing geometry cannot be certified',async()=>{
 const empty=engine.empty(6,6,'empty');assert.equal(designer.analyze(engine,empty,'progressive').matches,false);await assert.rejects(designer.optimize(engine,empty),/chưa có giun/);
 const cycle=engine.fromGame({XSize:6,YSize:6,Arrows:[{Indices:[14,13]},{Indices:[15,16]}]});assert.equal(designer.analyze(engine,cycle,'progressive').safe,false);
 const overlap=make();overlap.worms[1].cells=overlap.worms[0].cells.slice();assert.equal(designer.analyze(engine,overlap,'progressive').matches,false);
 const facing=engine.fromGame({XSize:3,YSize:3,Arrows:[{Indices:[4,7,8,5,2,1]}]});assert.equal(designer.analyze(engine,facing,'progressive').matches,false);
});
test('original hard example stays intact and is not mislabeled progressive',()=>{
 const map=engine.fromGame(JSON.parse(fs.readFileSync(path.join(projectRoot,'examples/gen_200.txt'),'utf8'))),a=designer.analyze(engine,map,'progressive');assert.equal(a.safe,true);assert.equal(a.matches,false);assert.equal(engine.validate(map,engine.index(map)).length,0);assert.ok(engine.evaluate(map).score>=90);
});
