const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const projectRoot = fs.existsSync(path.join(__dirname,'../examples/gen_200.txt')) ? path.join(__dirname,'..') : 'D:/VNG/Tool/colorful-worms-level-editor_2026-10-12/colorful-worms-level-editor';
const designer = require(path.join(__dirname,'../editor-exit-design.js'));
const text=fs.readFileSync(path.join(projectRoot,'colorful-worms-editor.js'),'utf8');
const context={console:{info(){}},document:{querySelector:()=>({getContext:()=>({})})},matchMedia:()=>({matches:false}),window:{self:1,top:1},setTimeout,performance,Int32Array,Uint8Array,Int8Array};
vm.createContext(context);
vm.runInContext(text.slice(0,text.indexOf('let R=null'))+'const mt=(v,a,b)=>Math.max(a,Math.min(b,v));globalThis.engine={fromGame:g,toGame:p,simulate:M,run:L,choose:C,evaluate:O,validate:E,index:$,empty:k};})();',context);
const engine=context.engine;
function simple(count=6) { return engine.fromGame({XSize:8,YSize:Math.max(6,count),Arrows:Array.from({length:count},(_,i)=>({Indices:[i*8,i*8+1]})),chuanSong:[],blackHole:[],yaoShi:[]}); }
test('targets include the endgame and respect remaining worm count',()=>{
 assert.deepEqual(designer.targetFlow(10),[1,2,3,4,5,5,4,3,2,1]);
 assert.deepEqual(designer.targetFlow(7),[1,2,3,4,3,2,1]);assert.deepEqual(designer.targetFlow(0),[]);
});
test('current mode preserves the existing initial choices',async()=>{
 const map=simple(),saved=JSON.stringify(map),result=await designer.optimize(engine,map,{mode:'any',iterations:2});
 assert.equal(result.analysis.matches,true);assert.equal(result.analysis.free.length,6);assert.equal(JSON.stringify(map),saved);
});
test('ice schedule covers every turn without mutating input or geometry',()=>{
 const original=simple(10),saved=JSON.stringify(original),map=designer.seedIce(engine,original,'progressive');
 const result=designer.analyze(engine,map,'progressive');
 assert.equal(result.matches,true);assert.equal(result.certified,true);assert.deepEqual(Array.from(result.flow),designer.targetFlow(10));assert.equal(JSON.stringify(original),saved);
 assert.deepEqual(map.worms.map(w=>w.cells),JSON.parse(saved).worms.map(w=>w.cells));
});
test('all possible player choices obey the full curve on seven worms',()=>{
 const map=designer.seedIce(engine,simple(7),'progressive'),sim=engine.simulate(map),expected=designer.targetFlow(7);let leaves=0;
 function visit(prefix){
  let step=0,next=[];
  const result=engine.run(sim,(choices)=>{if(step===prefix.length)next=Array.from(choices);const choice=prefix[step]??choices[0];assert.ok(choices.includes(choice));step++;return choice;});
  assert.deepEqual(Array.from(result.Fs),expected);assert.equal(result.solved,true);
  if(prefix.length===7){leaves++;return;}next.forEach(choice=>visit([...prefix,choice]));
 }
 visit([]);assert.ok(leaves>100);
});
test('matching the first three turns is insufficient',()=>{
 const map=designer.seedIce(engine,simple(10),'progressive');map.worms[9].ice=4;
 const result=designer.analyze(engine,map,'progressive');
 assert.deepEqual(Array.from(result.flow.slice(0,3)),[1,2,3]);assert.equal(result.matches,false);assert.equal(result.firstMismatch,4);
});
test('a single successful solution does not certify all choices',()=>{
 const map=simple();map.worms[3].cells=[[2,1],[3,1]];map.worms.forEach((w,i)=>w.ice=Math.floor((i+1)/2));
 const result=designer.analyze(engine,map,'progressive');
 assert.deepEqual(Array.from(result.flow),designer.targetFlow(6));assert.equal(result.certified,false);assert.equal(result.matches,false);
});
test('preserving an incompatible map fails safely with an actionable message',async()=>{
 const map=simple();map.worms[3].cells=[[2,1],[3,1]];map.worms[4].cells=[[2,2],[3,2]];const saved=JSON.stringify(map);
 await assert.rejects(designer.optimize(engine,map,{mode:'progressive',allowIce:true}),/Tự tạo/);assert.equal(JSON.stringify(map),saved);
});
test('disallowing ice does not silently replace blockers',async()=>{
 const map=simple(),saved=JSON.stringify(map);
 await assert.rejects(designer.optimize(engine,map,{mode:'progressive',allowIce:false}),/Bật/);assert.equal(JSON.stringify(map),saved);
 map.worms[1].lock=1;map.keys=[{x:0,y:7}];assert.deepEqual(designer.seedIce(engine,map,'progressive'),JSON.parse(JSON.stringify(map)));
});
test('auto-generation supports 104 worms, validates geometry and round-trips game data',()=>{
 for(let seed=0;seed<5;seed++){
  const map=designer.generateProgressive(engine.empty(32,51,'gen_200.txt'),{count:104,minLen:4,maxLen:24,seed:'large-'+seed});
  assert.equal(map.worms.length,104);assert.ok(map.worms.every(w=>w.cells.length>=4&&w.cells.length<=24));assert.equal(engine.validate(map,engine.index(map)).length,0);
  const restored=engine.fromGame(JSON.parse(JSON.stringify(engine.toGame(map))));assert.equal(designer.analyze(engine,restored,'progressive').matches,true);
  for(let order=0;order<20;order++){let step=0;const result=engine.run(engine.simulate(restored),choices=>choices[(step++*17+order)%choices.length]);assert.deepEqual(Array.from(result.Fs),designer.targetFlow(104));assert.equal(result.solved,true);}
 }
});
test('one and two worm levels do not require nonexistent choices',()=>{
 for(const count of [1,2])assert.equal(designer.analyze(engine,designer.seedIce(engine,simple(count),'progressive'),'progressive').matches,true);
});
test('impossible generation settings fail explicitly',()=>{
 assert.throws(()=>designer.generateProgressive(engine.empty(6,6,'test'),{count:20,minLen:4}),/không đủ ô/);
 assert.throws(()=>designer.generateProgressive(engine.empty(10,10,'test'),{count:40,minLen:2}),/Chưa xếp đủ/);
});
test('empty map and self-facing geometry are rejected',async()=>{
 const map=simple();map.worms=[];await assert.rejects(designer.optimize(engine,map),/chưa có giun/);
 const facing=engine.fromGame({XSize:3,YSize:3,Arrows:[{Indices:[4,7,8,5,2,1]}],chuanSong:[],blackHole:[],yaoShi:[]});assert.equal(designer.analyze(engine,facing,'progressive').matches,false);
});
test('the original hard example remains solvable but is not mislabeled as full progressive',()=>{
 const map=engine.fromGame(JSON.parse(fs.readFileSync(path.join(projectRoot,'examples/gen_200.txt'),'utf8'))),result=designer.analyze(engine,map,'progressive');
 assert.equal(result.safe,true);assert.equal(result.matches,false);assert.equal(result.firstMismatch,3);assert.equal(engine.validate(map,engine.index(map)).length,0);assert.ok(engine.evaluate(map).score>=90);
});
