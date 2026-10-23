const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const speed=require('../game/cw-enemy-speed'),engine=require('../editor-engine'),importer=require('../editor-import-data'),session=require('../editor-session'),jobs=require('../editor-design-jobs');
const raw=()=>({XSize:8,YSize:10,Arrows:[{Indices:[1,2]}],chuanSong:[],blackHole:[],yaoShi:[]});
const file=(value)=>({name:'gen_1.txt',text:async()=>JSON.stringify(value)});

test('all 17 speed steps have the specified exponential mapping and exact inverse',()=>{
 assert.equal(speed.ticks.length,17);assert.deepEqual(speed.ticks,Array.from({length:17},(_,i)=>-4+i*.5));
 for(const value of speed.ticks)assert.ok(Math.abs(speed.toSlider(speed.fromSlider(value))-value)<1e-12);
 for(const [tick,multiplier]of [[-4,.25],[-2,.5],[0,1],[2,2],[4,4]])assert.equal(speed.fromSlider(tick),multiplier);
});

test('old maps keep default speed and valid settings round-trip through TXT/JSON and project import',async()=>{
 const old=raw();assert.equal(speed.readMap(engine.fromGame(old)),1);assert.deepEqual(engine.toGame(engine.fromGame(old)),old);
 for(const multiplier of [.25,1,4,Math.pow(4,.125)]){
  const value={...raw(),enemySpeedMultiplier:multiplier},plan=await importer.prepare([file(value)]),map=engine.fromGame(plan.levels[0].map);
  const txt=JSON.stringify(engine.toGame(map)),project=importer.validateProject({cfg:{start:1,count:1},levels:[{levelid:1,target:50,name:'gen_1',wenname:'game-level',map:txt}]});
  assert.equal(speed.readMap(engine.fromGame(JSON.parse(project.levels[0].map))),multiplier);assert.deepEqual(JSON.parse(txt),value);
 }
});

test('invalid speed data is rejected by import and export instead of silently clamping or coercing',async()=>{
 for(const value of [null,'1',true,0,.249,4.001,NaN,Infinity,undefined]){
  const map={...raw(),enemySpeedMultiplier:value};assert.throws(()=>engine.fromGame(map),/enemySpeedMultiplier/);
  const internal=engine.fromGame(raw());internal.extraTop.enemySpeedMultiplier=value;assert.throws(()=>engine.toGame(internal),/enemySpeedMultiplier/);
  if(value!==undefined)await assert.rejects(importer.prepare([file(map)]),/enemySpeedMultiplier/);
 }
});

test('speed belongs to opening, save, discard and reset snapshots',()=>{
 const state=session.create(),map=engine.fromGame(raw()),snapshot=()=>({map});state.begin(1,snapshot());speed.setMap(map,4);assert.equal(state.dirty(snapshot()),true);state.save(snapshot());speed.setMap(map,.25);assert.equal(speed.readMap(state.discard().map),4);assert.equal(speed.readMap(state.reset().map),1);assert.equal(state.dirty(state.discard()),false);
});

test('map regeneration preserves per-map speed without changing the input',async()=>{
 const input=engine.empty(12,16);speed.setMap(input,4);const before=JSON.stringify(input);
 const result=await jobs.run('generate',input,{mode:'any',autoTune:true,count:10,seed:'speed-preservation'});
 assert.equal(speed.readMap(result.map),4);assert.equal(JSON.stringify(input),before);assert.equal(JSON.parse(JSON.stringify(engine.toGame(result.map))).enemySpeedMultiplier,4);
});

const bundle=fs.readFileSync(path.join(__dirname,'../game/assets/main/index.b834c.js'),'utf8');
const start=bundle.indexOf('chunks:///_virtual/level2.ts'),section=bundle.slice(start,bundle.indexOf('System.register(',start+50));
const updateStart=section.indexOf('e.update=')+'e.update='.length,updateEnd=section.indexOf('},e.',updateStart)+1;
const nativeUpdate=vm.runInNewContext('('+section.slice(updateStart,updateEnd)+')',{window:{CWEnemySpeed:speed},Mi:{bianJibol:false,xunHuanBol:true},Li:{infoData:{nowlv:20}},mi:{},hi:(x,y,z)=>({x,y,z}),wi:{os:'test',OS:{IOS:'ios'}}});
function controller(multiplier=1,position=0){return{
 nowObj:{enemySpeedMultiplier:multiplier},over:false,foeStop:false,foeStartMove:true,foeSpeed:5,skillTimeStop:0,allMoveId:position,
 xunHuanArr:[{x:100,y:100},{},{},{y:-100}],xuanHuanAllXY:Array(20000),nowGoarrow:[],nowAtkarrow:[],
 view:{roleArea:{getComponent:()=>({opacity:255})},'bgArea/bg3/cj3/zj':{position:{}},'xunHuanArea/foe':{children:[]}},
 morePaths:0,foeBatkNum:0,moveTimeOff:0,moveTimeOff2:1,jiSuanJianGe:0,testTime:0,audioTest:0,audioNum:0
};}

test('real native movement uses integer route indices at x0.25, x1 and x4 at 30/60/120 fps, including all slow zones',()=>{
 for(const [position,step]of [[0,5],[5000,2],[11000,1]])for(const multiplier of [.25,1,4])for(const fps of [30,60,120]){
  const c=controller(multiplier,position);for(let frame=0;frame<fps*2;frame++){nativeUpdate.call(c,1/fps);assert.equal(Number.isInteger(c.allMoveId),true);}
  assert.equal(c.allMoveId-position,2*60*step*multiplier,JSON.stringify({position,multiplier,fps}));
 }
});

test('native freeze, pause, kill hold and knockback preserve movement state without accumulating a catch-up jump',()=>{
 const c=controller(.25);nativeUpdate.call(c,1/120);const position=c.allMoveId,remainder=c.__cwEnemyStepRemainder;
 for(const flag of ['foeStop','over','skillTimeStop']){c[flag]=true;for(let i=0;i<20;i++)nativeUpdate.call(c,1/60);assert.equal(c.allMoveId,position);assert.equal(c.__cwEnemyStepRemainder,remainder);c[flag]=false;}
 c.foeBatkNum=5;for(let i=0;i<5;i++)nativeUpdate.call(c,1/60);assert.equal(c.allMoveId,position);assert.equal(c.__cwEnemyStepRemainder,remainder);
 // Paused Cocos does not call update; the next frame uses its own dt only.
 c.allMoveId-=10;nativeUpdate.call(c,1/120);assert.equal(c.allMoveId,position-9);assert.ok(c.__cwEnemyStepRemainder<1);
 speed.reset(c);assert.equal(c.__cwEnemyStepRemainder,0);
});

test('changing enemy speed does not alter map HP/damage/timer metadata',()=>{
 const value={...raw(),hp:3,damage:7,timeBonus:120},map=engine.fromGame(value);speed.setMap(map,4);const output=engine.toGame(map);assert.equal(output.hp,3);assert.equal(output.damage,7);assert.equal(output.timeBonus,120);
});

test('fast enemies crossing an arrow between rendered frames receive native damage only once',()=>{
 const c=controller(4,180),hits=[],enemy={id:0,over:false,nowMoveSpeedId:100,atkIdArr:[],initFx(){},move(){},addMove(){},batkAudio(){},batk(damage,id){hits.push(damage);this.atkIdArr.push(id);}};
 c.xuanHuanAllXY=Array.from({length:20000},(_,x)=>({x,y:0}));c.view['xunHuanArea/foe'].children=[{active:true,ts:enemy}];c.allMoveOff=100;c.bossType=0;c.off=35;
 c.nowAtkarrow=[{arrowover:false,nowMoveSpeedId:120,arrowid:7,atk:9,node:{active:true},audioNum:0,atkMove(){}}];
 nativeUpdate.call(c,1/30);assert.deepEqual(hits,[9]);assert.equal(enemy.nowMoveSpeedId,180);
 nativeUpdate.call(c,1/30);assert.deepEqual(hits,[9]);
});
