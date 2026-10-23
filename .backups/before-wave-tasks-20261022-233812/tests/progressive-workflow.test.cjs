const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const designer=require('../editor-exit-design.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../colorful-worms-editor.js'),'utf8');
new vm.Script(source); // Parse the whole application, including UI hooks below the pure engine.
const start=source.indexOf('function fn(){'),end=source.indexOf('e("#autoCard").addEventListener',start);
function harness(){
 const elements=new Map(Object.entries({auW:12,auH:16,auMin:3,auMax:8,auCount:7,auSeed:'auto-route',auStraight:35,auBias:50,auIce:8,auLock:4,auBomb:4,auPortal:4,auHole:4,exitMode:'progressive',auFit:0}).map(([k,v])=>['#'+k,{value:String(v),checked:k==='auFit',click(){throw Error('difficulty fitting must not override the sequence');}}]));elements.set('#exitWorkStatus',{textContent:''});
 const engineContext={console:{info(){}},document:{querySelector:()=>({getContext:()=>({})})},matchMedia:()=>({matches:false}),window:{self:1,top:1},setTimeout,performance,Int32Array,Uint8Array,Int8Array};vm.createContext(engineContext);vm.runInContext(source.slice(0,source.indexOf('let R=null'))+'globalThis.engine={simulate:M,run:L,choose:C,empty:k,index:$,evaluate:O};})();',engineContext);const engine=engineContext.engine;
 let undo=0;const messages=[],legacy=[];
 const ctx={ne:false,he:1,R:engine.empty(12,16,'original'),J:null,B:[],gn:true,te:0,performance,CWExitDesign:designer,e:key=>elements.get(key),un:key=>+elements.get('#'+key).value,k:engine.empty,St:()=>({name:'test'}),M:engine.simulate,L:engine.run,C:engine.choose,dn(){},Ce(){undo++},nt(){},de(){},Te(){},Pe:text=>messages.push(text),A(){legacy.push('geometry');throw Error('wrong generator');},N(){legacy.push('blockers');throw Error('wrong blockers');}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 return{ctx,elements,engine,messages,legacy,undo:()=>undo,run:()=>vm.runInContext('fn()',ctx)};
}
test('auto sliders / seed / regenerate route honors progressive mode and ignores legacy blocker sliders',()=>{
 const h=harness();h.run();assert.equal(designer.analyze(h.engine,h.ctx.R,'progressive').matches,true);assert.equal(h.ctx.R.worms.length,7);assert.equal(h.undo(),1);assert.deepEqual(h.legacy,[]);assert.match(h.messages.at(-1),/không kẹt/);
});
test('a failed auto-generation leaves the previous map and undo checkpoint untouched',()=>{
 const h=harness(),saved=JSON.stringify(h.ctx.R);h.elements.get('#auW').value='6';h.elements.get('#auH').value='6';h.elements.get('#auCount').value='20';h.elements.get('#auMin').value='4';h.run();assert.equal(JSON.stringify(h.ctx.R),saved);assert.equal(h.undo(),0);assert.match(h.messages.at(-1),/không đủ ô/);
});
test('changing the seed generates another certified map without routing back to ordinary generation',()=>{
 const h=harness();h.run();const first=JSON.stringify(h.ctx.R);h.elements.get('#auSeed').value='another-seed';h.ctx.gn=true;h.run();assert.notEqual(JSON.stringify(h.ctx.R),first);assert.equal(designer.analyze(h.engine,h.ctx.R,'progressive').matches,true);assert.equal(h.undo(),2);
});

test('live play counter follows the actual remaining board after every removal',()=>{
 const h=harness();h.run();const map=h.ctx.R,order=designer.analyze(h.engine,map,'progressive').result.order;
 const nodes={'#hpSel':{value:'3'},'#hearts':{},'#timer':{classList:{toggle(){}}},'#playExits':{}};
 const ctx={R:map,_:'play',G:{alive:map.worms.map(()=>true),anims:new Map(),ice:map.worms.map(()=>0),lock:map.worms.map(()=>0),hp:3,timeLeft:300,left:map.worms.length,I:h.engine.index(map)},Je:'',Ye:'heart %c',Fe:String,e:key=>nodes[key],editEntry:{design:{exitMode:'progressive'}}};
 // Use the real ray tracer, independent of the counter's cached presentation.
 const rayStart=source.indexOf('function S(e,t,n)'),rayEnd=source.indexOf('function M(e)',rayStart);
 vm.createContext(ctx);vm.runInContext('const y=1,w=2,x=3;'+source.slice(rayStart,rayEnd),ctx);
 const geStart=source.indexOf('function Ge(){'),geEnd=source.indexOf('function _e(',geStart);vm.runInContext(source.slice(geStart,geEnd),ctx);
 for(let step=0;step<=order.length;step++){
  vm.runInContext('Ge()',ctx);assert.equal(nodes['#playExits'].hidden,false);
  assert.equal(nodes['#playExits'].textContent,'Thoát được: '+(designer.targetFlow(map.worms.length)[step]||0)+' · Còn: '+(map.worms.length-step));
  if(step<order.length){ctx.G.alive[order[step]]=false;ctx.G.left--;ctx.G.I=h.engine.index(map,ctx.G.alive);}
 }
});
test('batch Sync preserves a saved progressive level instead of unconstrained difficulty fitting',async()=>{
 const h=harness();h.run();const entry={levelid:1,name:'test',m:h.ctx.R,design:{exitMode:'progressive'},score:20,target:20};
 const saved=JSON.stringify(entry.m),ctx={oe:false,ae:{stop:false},performance,he:null,St:()=>entry,Bt(){},setTimeout,gt:{cfg:{seed:'batch',minLen:3,maxLen:8}},CWExitDesign:designer,M:h.engine.simulate,L:h.engine.run,C:h.engine.choose,O:h.engine.evaluate,rt(){},pt:{start:1,size:50},Ot(){},Rt(){},Ft(){},zt(){},Jt(){},Mt(a,d){a.score=d.score},X(){throw Error('unconstrained fit must not run')},Kt(){throw Error('ordinary generator must not run')}};
 const begin=source.indexOf('async function Ut('),end=source.indexOf('function qt(',begin);vm.createContext(ctx);vm.runInContext(source.slice(begin,end),ctx);
 await vm.runInContext('Ut([1],{mode:"auto",budget:10})',ctx);assert.equal(JSON.stringify(entry.m),saved);assert.equal(designer.analyze(h.engine,entry.m,'progressive').matches,true);
});
