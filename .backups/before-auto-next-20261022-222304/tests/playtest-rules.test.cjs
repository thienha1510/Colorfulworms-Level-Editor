const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../game/cw-playtest-rules.js');
function fixture(){
 const events=[];
 const paths=['ui/dataShow/time','ui/tili','ui/btn_shezhi_01','ui/btn_jiashi','ui/btn_tishi','ui/timeStop','yindao','ui/allTc/newItem','ui/allTc/jituiFoe','ui/allTc/addHp','ui/hp'];
 const nodes=Object.fromEntries(paths.map(path=>[path,{active:true,children:[],name:path}]));
 const root={children:{},getChildByName(name){return this.children[name]}};
 for(const path of paths){let node=root;for(const name of path.split('/'))node=node.children[name]??=( {children:{},getChildByName(key){return this.children[key]}} );Object.defineProperty(node,'active',{get:()=>nodes[path].active,set:value=>{nodes[path].active=value},configurable:true});}
 class Level {
  constructor(){this.node=root;this.view={...nodes};delete this.view['ui/tili'];this.time=300;this.nowHp=3;this.over=false;this.hand={active:true};}
  init(){this.over=false;this.nowHp=3;nodes['ui/tili'].active=true;this.timeGo();}
  timeGo(){events.push('schedule');}
  timeUP(){this.time--;}
  initLable(){events.push('timer-label');}
  update(){nodes['ui/tili'].active=true;events.push('update');}
  initHp(){events.push('hp');}
  win(){events.push('win');}
  reload(){events.push('reload');}
  addHp(){this.nowHp=3;this.over=false;}
  jituiFoe(){this.over=false;}
  clickSetting(){events.push('settings');}
  closeAlltc(){nodes['ui/allTc/jituiFoe'].active=false;nodes['ui/allTc/addHp'].active=false;}
  tcAct(popup){popup.active=true;}
  getHand(){return this.hand;}
  unschedule(fn){events.push(['unschedule',fn]);}
 }
 return {Level,nodes,events};
}
test('normal game behavior stays unchanged until playtest explicitly installs rules',()=>{
 const {Level,events}=fixture(),level=new Level();level.timeUP();level.timeGo();level.clickSetting();assert.equal(level.time,299);assert.deepEqual(events,['schedule','settings']);
});
test('the test has no timed invasion or forced tutorial immortality',()=>{
 const flags={noTime:false,noTimeMode:false,xunHuanBol:true,twoLvWin:true};rules.configureGlobals(flags);
 assert.deepEqual(flags,{noTime:true,noTimeMode:true,xunHuanBol:false,twoLvWin:false});
});
test('playtests never schedule or advance the countdown',()=>{
 const {Level,events}=fixture();rules.install(Level,()=>{});const level=new Level();level.init();for(let i=0;i<1000;i++)level.timeUP();level.initLable();assert.equal(level.time,300);assert.equal(events.includes('schedule'),false);assert.equal(events.includes('timer-label'),false);
});
test('timer, stamina, settings and onboarding stay hidden while hearts remain visible',()=>{
 const {Level,nodes}=fixture();rules.install(Level,()=>{});const level=new Level();level.init();level.update();
 for(const path of ['ui/dataShow/time','ui/tili','ui/btn_shezhi_01','ui/timeStop','yindao'])assert.equal(nodes[path].active,false,path);
 assert.equal(nodes['ui/hp'].active,true);assert.equal(level.hand.active,false);
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
