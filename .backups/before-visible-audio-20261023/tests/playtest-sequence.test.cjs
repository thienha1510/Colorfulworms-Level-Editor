const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(ids=[1,2,4]){
 let now=0,nextTimer=1;const timers=new Map(),nodes=new Map(),listeners=new Map(),storage=new Map(),sent=[];
 const document={activeElement:null,body:{classList:{add(){},remove(){}}},addEventListener(){},querySelector(selector){
  if(!nodes.has(selector))nodes.set(selector,{dataset:{},hidden:false,textContent:'',classList:{add(){},remove(){}},setAttribute(name,value){this[name]=value},removeAttribute(name){delete this[name]},focus(){document.activeElement=this},addEventListener(name,fn){this.events=this.events||{};this.events[name]=fn;}});
  return nodes.get(selector);
 }};
 const frame=document.querySelector('#gameTestFrame');frame.contentWindow={postMessage:data=>sent.push(data)};
 class TestDate extends Date{static now(){return now;}}
 const context={Date:TestDate,window:{},document,crypto:{randomUUID:()=> 'test-token'},location:{origin:'http://editor.test'},localStorage:{setItem:(key,value)=>storage.set(key,value)},setTimeout:(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),requestIdleCallback(){},addEventListener:(name,fn)=>listeners.set(name,fn)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../editor-playtest.js'),'utf8'),context);
 const api={mapForLevel:id=>ids.includes(id)?'map-'+id:null,nextMapLevel:id=>ids.filter(next=>next>id).sort((a,b)=>a-b)[0],firstMapLevel:()=>ids[0],beforePlay(){},suspendEditor:()=>1,restoreEditor(){},status(){}};
 const client=context.window.CWPlaytestClient(api);
 const session=()=>JSON.parse(storage.get('cw_playtest_session'));
 function emit(type,extra={},envelope={}){
  const current=session();listeners.get('message')({origin:'http://editor.test',source:frame.contentWindow,data:{type,token:'test-token',requestId:current.requestId,level:current.start,elapsedMs:10,...extra},...envelope});
 }
 function tick(ms){const until=now+ms;for(;;){const due=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();}now=until;}
 return {client,emit,tick,session,nodes,sent,frame,ready(){emit('cw-playtest-ready')}};
}
test('a completed map waits exactly one second then loads the next project map',()=>{
 const f=fixture();f.client.play(1);f.ready();f.emit('cw-playtest-won');f.tick(999);assert.equal(f.session().start,1);
 f.tick(1);assert.equal(f.session().start,2);assert.ok(f.sent.some(data=>data.type==='cw-playtest-play'&&data.session.start===2));
});
test('duplicate and stale completions cannot skip maps or reset the one second delay',()=>{
 const f=fixture();f.client.play(1);f.ready();f.emit('cw-playtest-won');f.tick(500);f.emit('cw-playtest-won');f.tick(500);assert.equal(f.session().start,2);
 f.ready();f.emit('cw-playtest-won',{requestId:1,level:1});f.tick(1000);assert.equal(f.session().start,2);
});
test('closing or manually restarting cancels pending automatic navigation',()=>{
 for(const action of ['close','restart']){
  const f=fixture();f.client.play(1);f.ready();f.emit('cw-playtest-won');
  if(action==='close')f.client.close();else f.client.play(1);
  f.tick(1500);assert.equal(f.session().start,1,action);
 }
});
test('empty slots are skipped and the last project map stops without a popup or fallback',()=>{
 const f=fixture();f.client.play(2);f.ready();f.emit('cw-playtest-won');f.tick(1000);assert.equal(f.session().start,4);
 f.ready();f.emit('cw-playtest-won');f.tick(5000);assert.equal(f.session().start,4);assert.match(f.nodes.get('#gameTestStatus').textContent,/map cuối/);
});
test('losing, hidden warm games and messages with the wrong origin do not advance',()=>{
 const f=fixture();f.client.play(1);f.ready();f.emit('cw-playtest-lost');f.emit('cw-playtest-won');f.tick(1000);assert.equal(f.session().start,1);
 f.client.play(1);f.ready();f.emit('cw-playtest-won',{}, {origin:'http://elsewhere.test'});f.tick(1000);assert.equal(f.session().start,1);
 f.client.close();f.tick(150);f.ready();f.emit('cw-playtest-won');f.tick(1000);assert.equal(f.session().start,1);
});

test('the engine boots immediately with an empty project without inserting a project map',()=>{const ids=[],f=fixture(ids);assert.match(f.frame.src,/game\/index.html/);assert.equal(ids.length,0);assert.equal(f.session().engineOnly,true);const boot=JSON.parse(f.session().maps[1]);assert.ok(boot.Arrows.length);f.ready();assert.match(f.nodes.get('#gameWarmStatus').textContent,/Engine đã nạp sẵn/);ids.push(30);f.client.prepare(30);assert.equal(f.session().engineOnly,false);assert.equal(f.session().start,30);f.ready();const before=f.session().requestId;f.client.play(30);assert.equal(f.session().requestId,before);assert.equal(f.sent.at(-1).type,'cw-playtest-resume');assert.equal(f.nodes.get('#gameTestLoading').hidden,true);});
test('booting switches to the latest requested map and ignores an old readiness message',()=>{const f=fixture([1,2]);const boot=f.session().requestId;f.client.prepare(2);const latest=f.session().requestId;assert.notEqual(boot,latest);f.frame.events.load();assert.equal(f.sent.at(-1).session.requestId,latest);f.emit('cw-playtest-ready',{requestId:boot,level:1});assert.notEqual(f.nodes.get('#gameTestPanel').dataset.ready,'true');f.ready();assert.equal(f.nodes.get('#gameTestPanel').dataset.level,'2');});
test('a cold boot stops waiting at 45 seconds even after switching the requested map',()=>{const f=fixture([1,2]);f.tick(20000);f.client.prepare(2);f.tick(24999);assert.equal(f.nodes.get('#gameTestReload').hidden,true);f.tick(1);assert.match(f.nodes.get('#gameTestStatus').textContent,/45.*giây/);assert.equal(f.sent.at(-1).type,'cw-playtest-abort');f.ready();assert.notEqual(f.nodes.get('#gameTestPanel').dataset.ready,'true');});
test('a new map uses the warm engine and has a 30 second loading deadline',()=>{const f=fixture([1,2]);f.ready();f.client.play(2);f.tick(29999);assert.equal(f.nodes.get('#gameTestReload').hidden,true);f.tick(1);assert.match(f.nodes.get('#gameTestStatus').textContent,/30.*giây/);assert.equal(f.sent.at(-1).type,'cw-playtest-abort');});
