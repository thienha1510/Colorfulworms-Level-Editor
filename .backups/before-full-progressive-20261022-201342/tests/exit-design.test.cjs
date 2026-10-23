const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const projectRoot = fs.existsSync(path.join(__dirname,'../colorful-worms-editor.js')) ? path.join(__dirname,'..') : 'D:/VNG/Tool/colorful-worms-level-editor_2026-10-12/colorful-worms-level-editor';
const designer = require(path.join(projectRoot,'editor-exit-design.js'));
const text=fs.readFileSync(path.join(projectRoot,'colorful-worms-editor.js'),'utf8');
const context={console:{info(){}},document:{querySelector:()=>({getContext:()=>({})})},matchMedia:()=>({matches:false}),window:{self:1,top:1},setTimeout,performance,Int32Array,Uint8Array,Int8Array};
vm.createContext(context);
vm.runInContext(text.slice(0,text.indexOf('let R=null'))+'const mt=(v,a,b)=>Math.max(a,Math.min(b,v));globalThis.engine={fromGame:g,toGame:p,simulate:M,run:L,choose:C,evaluate:O,validate:E,index:$};})();',context);
const engine=context.engine;
function simple() { return engine.fromGame({XSize:8,YSize:6,Arrows:Array.from({length:6},(_,i)=>({Indices:[i*8,i*8+1]})),chuanSong:[],blackHole:[],yaoShi:[]}); }
test('single-exit constraint uses real solver and does not mutate the input',()=>{
 const original=simple(),saved=JSON.stringify(original),map=designer.seedIce(engine,original,'one');
 const result=designer.analyze(engine,map,'one');assert.equal(result.matches,true);assert.equal(result.free.length,1);assert.equal(JSON.stringify(original),saved);
});
test('progressive mode verifies both second-move choices',()=>{
 const map=designer.seedIce(engine,simple(),'progressive'),result=designer.analyze(engine,map,'progressive');
 assert.equal(result.matches,true);assert.deepEqual(Array.from(result.flow.slice(0,3)),[1,2,3]);assert.deepEqual(Array.from(result.alternate.Fs.slice(0,3)),[1,2,3]);
});
test('many-exit mode accepts at least three initial choices',()=>{
 assert.equal(designer.analyze(engine,simple(),'many').matches,true);
});
test('empty map is rejected with an actionable message',async()=>{
 const map=simple();map.worms=[];await assert.rejects(designer.optimize(engine,map),/chưa có giun/);
});
test('cancellation leaves source geometry intact',async()=>{
 const map=simple(),saved=JSON.stringify(map);await designer.optimize(engine,map,{mode:'one',allowIce:true,signal:{stop:true}});assert.equal(JSON.stringify(map),saved);
});
test('optimization preserves every worm body and applies only feasible constraints',async()=>{
 const map=simple(),result=await designer.optimize(engine,map,{mode:'one',allowIce:true,iterations:12,seed:'test'});
 assert.equal(result.analysis.matches,true);
 for(let i=0;i<map.worms.length;i++)assert.equal(JSON.stringify([...map.worms[i].cells].sort()),JSON.stringify([...result.map.worms[i].cells].sort()));
});
test('level 200 example is hard, valid, solvable and progressive',()=>{
 const map=engine.fromGame(JSON.parse(fs.readFileSync(path.join(projectRoot,'examples/gen_200.txt'),'utf8'))),result=designer.analyze(engine,map,'progressive');
 assert.equal(result.matches,true);assert.equal(result.result.booms,0);assert.equal(engine.validate(map,engine.index(map)).length,0);assert.ok(engine.evaluate(map).score>=90);
});
test('auto-design rejects an orientation that points into its own body',()=>{
 const map=engine.fromGame({XSize:3,YSize:3,Arrows:[{Indices:[4,7,8,5,2,1]}],chuanSong:[],blackHole:[],yaoShi:[]});
 const result=designer.analyze(engine,map,'one');assert.equal(result.selfFacing.length,1);assert.equal(result.matches,false);
});
