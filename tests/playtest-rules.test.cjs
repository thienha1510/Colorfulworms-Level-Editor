const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../game/cw-playtest-rules.js');
function fixture(){
 const events=[];
 const paths=['ui/dataShow','ui/allTc/addTime','ui/dataShow/time','ui/tili','ui/btn_shezhi_01','ui/btn_jiashi','ui/btn_tishi','ui/timeStop','yindao','ui/allTc/newItem','ui/allTc/jituiFoe','ui/allTc/addHp','ui/hp'];
 const nodes=Object.fromEntries(paths.map(path=>[path,{active:true,children:[],name:path}]));
 const root={children:{},getChildByName(name){return this.children[name]}};
 for(const path of paths){let node=root;for(const name of path.split('/'))node=node.children[name]??=( {children:{},getChildByName(key){return this.children[key]}} );Object.defineProperty(node,'active',{get:()=>nodes[path].active,set:value=>{nodes[path].active=value},configurable:true});}
 class Level {
  constructor(){this.node=root;this.view={...nodes};delete this.view['ui/tili'];this.time=300;this.timeUp=true;this.nowHp=3;this.over=false;this.hand={active:true};}
  init(){this.over=false;this.time=300;this.nowHp=3;nodes['ui/tili'].active=true;this.timeGo();}
  timeGo(){this.timeStart=true;events.push('schedule');}
  timeUP(){if(this.over||!this.timeUp)return;if(this.time===0){this.lose();this.tcAct(nodes['ui/allTc/addTime']);}else this.time--;this.initLable();}
  initLable(){events.push('timer-label');}
  update(){nodes['ui/tili'].active=true;events.push('update');}
  initHp(){events.push('hp');}
  win(){events.push('win');}
  reload(){events.push('reload');}
  addHp(){this.nowHp=3;this.over=false;}
  jituiFoe(){this.over=false;}
  clickSetting(){events.push('settings');}
  closeAlltc(){for(const path of ['ui/allTc/jituiFoe','ui/allTc/addHp','ui/allTc/addTime'])nodes[path].active=false;}
  tcAct(popup){popup.active=true;}
  getHand(){return this.hand;}
  unschedule(fn){events.push(['unschedule',fn]);}
 }
 return {Level,nodes,events};
}
test('normal game behavior stays unchanged until playtest explicitly installs rules',()=>{
 const {Level,events}=fixture(),level=new Level();level.timeUP();level.timeGo();level.clickSetting();assert.equal(level.time,299);assert.deepEqual(events,['timer-label','schedule','settings']);
});
test('the test uses native timed invasion without tutorial immortality',()=>{
 const flags={noTime:false,noTimeMode:false,xunHuanBol:true,twoLvWin:true};rules.configureGlobals(flags);
 assert.deepEqual(flags,{noTime:false,noTimeMode:false,xunHuanBol:true,twoLvWin:false});
});
test('playtests schedule the native countdown and refresh its visible label',()=>{
 const {Level,events}=fixture(),timeGo=Level.prototype.timeGo,timeUP=Level.prototype.timeUP,initLable=Level.prototype.initLable;rules.install(Level,()=>{});const level=new Level();level.init();level.timeUP();assert.equal(level.time,299);assert.equal(level.timeUp,true);assert.equal(events.includes('schedule'),true);assert.equal(events.includes('timer-label'),true);assert.equal(level.timeGo,timeGo);assert.equal(level.timeUP,timeUP);assert.equal(level.initLable,initLable);
});

test('timeout keeps only the locked failure popup and editor restart resets the countdown',()=>{
 const {Level,nodes}=fixture();let lost=0;rules.install(Level,()=>lost++);const level=new Level();level.init();level.time=1;level.timeUP();assert.equal(level.time,0);assert.equal(lost,0);level.timeUP();level.timeUP();assert.equal(lost,1);assert.equal(level.over,true);assert.equal(nodes['ui/allTc/jituiFoe'].active,true);assert.equal(nodes['ui/allTc/addTime'].active,false);level.tcAct(nodes['ui/allTc/addHp']);assert.equal(nodes['ui/allTc/addHp'].active,false);
 level.init();assert.equal(level.time,300);assert.equal(level.timeStart,true);assert.equal(level.timeUp,true);assert.equal(level.foeStop,false);assert.equal(nodes['ui/allTc/jituiFoe'].active,false);level.timeUP();assert.equal(level.time,299);
});
test('timer and hearts stay visible while stamina, settings and onboarding stay hidden',()=>{
 const {Level,nodes}=fixture();rules.install(Level,()=>{});const level=new Level();level.init();level.update();
 for(const path of ['ui/tili','ui/btn_shezhi_01','ui/timeStop','yindao'])assert.equal(nodes[path].active,false,path);
 for(const path of ['ui/hp','ui/dataShow','ui/dataShow/time'])assert.equal(nodes[path].active,true,path);assert.equal(level.hand.active,false);
});
test('three mistakes lose exactly once and show the reference failure popup',()=>{
 const {Level,nodes}=fixture();let lost=0;rules.install(Level,(_,popup)=>{lost++;assert.equal(popup,nodes['ui/allTc/jituiFoe']);});const level=new Level();level.init();
 level.jianHp();assert.equal(level.nowHp,2);level.jianHp();assert.equal(level.nowHp,1);assert.equal(lost,0);level.jianHp();level.jianHp();level.foeLose();assert.equal(level.nowHp,0);assert.equal(lost,1);assert.equal(level.over,true);assert.equal(nodes['ui/allTc/jituiFoe'].active,true);assert.equal(nodes['ui/allTc/addHp'].active,false);
});
test('revival, settings, reload and a late win cannot escape the failed state',()=>{
 const {Level,events}=fixture();rules.install(Level,()=>{});const level=new Level();level.init();level.foeLose();const hp=level.nowHp;level.addHp();level.jituiFoe();level.reload();level.clickSetting();level.win(false);level.update();assert.equal(level.nowHp,hp);assert.equal(level.over,true);assert.equal(level.__cwTestLost,true);assert.equal(events.includes('reload'),false);assert.equal(events.includes('settings'),false);assert.equal(events.includes('win'),false);assert.equal(events.includes('update'),false);
});
test('editor restart reuses the controller and restores hearts and input state',()=>{
 const {Level,nodes}=fixture();let lost=0;rules.install(Level,()=>lost++);const level=new Level();level.init();level.jianHp();level.jianHp();level.jianHp();level.init();assert.equal(level.__cwTestLost,false);assert.equal(level.over,false);assert.equal(level.nowHp,3);assert.equal(nodes['ui/allTc/jituiFoe'].active,false);level.jianHp();assert.equal(level.nowHp,2);assert.equal(lost,1);
});
test('reinstalling rules does not stack callbacks on a warm engine',()=>{
 const {Level}=fixture();let lost=0;assert.equal(rules.install(Level,()=>lost++),true);assert.equal(rules.install(Level,()=>lost+=100),false);const level=new Level();level.init();level.foeLose();assert.equal(lost,1);
});
test('winning signals completion once without invoking the normal win popup or progress',()=>{
 const {Level,events,nodes}=fixture();let won=0,lost=0;rules.install(Level,()=>lost++,()=>won++);
 const level=new Level();level.init();level.win();level.win(false);level.foeLose();level.jianHp();
 assert.equal(won,1);assert.equal(lost,0);assert.equal(level.__cwTestWon,true);assert.equal(level.over,true);
 assert.equal(events.includes('win'),false);assert.equal(nodes['ui/allTc/jituiFoe'].active,false);assert.equal(level.nowHp,3);
 level.init();assert.equal(level.__cwTestWon,false);level.win();assert.equal(won,2);
});

test('the captured native win gate is suppressed until the final worm animation clears',()=>{
 const {Level,events}=fixture();
 const nativeWin=Level.prototype.win;
 Level.prototype.update=function(){if(!this.__trackingBoardHidden)nativeWin.call(this);};
 Level.prototype.changeWin=function(){nativeWin.call(this);};
 let won=0,ice=0;rules.install(Level,()=>{},()=>won++);
 const level=new Level();level.init();level.__levelReady=true;
 const body={isValid:true,activeInHierarchy:true};
 const role={goBol:false,over:false,allNode:[body]};
 const node={isValid:true,getComponent:name=>name==='role'?role:null};
 level.jianTouArr=[node];level.xyArr=[[node]];level.jianIce=()=>ice++;
 level.changeWin();level.update();assert.equal(ice,1);assert.equal(won,0);
 level.xyArr=[[null]];role.goBol=true;level.update();assert.equal(won,0);
 body.activeInHierarchy=false;level.update();level.update();
 assert.equal(won,1);assert.equal(events.includes('win'),false);
 assert.equal(level.__trackingBoardHidden,undefined);
 level.init();level.update();assert.equal(won,1,'a reused empty board cannot clear the next map');
});
