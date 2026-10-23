const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rules=require('../game/cw-playtest-rules'),engine=require('../editor-engine');
const bundle=fs.readFileSync(path.join(__dirname,'../game/assets/main/index.b834c.js'),'utf8');
const begin=bundle.indexOf('chunks:///_virtual/level2.ts'),source=bundle.slice(begin,bundle.indexOf('System.register(',begin+50));
function nativeMethod(name,context){const start=source.indexOf('e.'+name+'=')+('e.'+name+'=').length,end=source.indexOf('},e.',start)+1;assert.ok(start>name.length&&end>start,name);return vm.runInNewContext('('+source.slice(start,end)+')',context);}
function fixture(level,morePaths=0){
 const captured={},context={Mi:{bianJibol:false},Li:{infoData:{nowlv:level-1}},Pi:{},Yi:{}};
 const role={init(cells,id){captured.worm={cells,id};}};
 const object={initChuanSong(controller,cells,id){captured.portal={cells,id};},initBlackHole(controller,cells,id){captured.hole={cells,id};},initYaoShi(controller,cells,id){captured.key={cells,id};}};
 const node={getComponent:()=>object};
 class Level{
  constructor(){this.nowX=8;this.nowY=10;this.morePaths=morePaths;this.gameType='普通模式';this.id=1;this.chuanSongId=1;this.allArrowNum=0;this.arrowNum=0;this.xyArr=Array.from({length:10},()=>Array(8));for(const key of ['jianTouArr','saveDatajianTouArr','bianjijianTouArr','bianjiChuanSongArr','bianjiBlackHoleArr','bianjiYaoShiArr'])this[key]=[];}
  init(){}getItem(){return{getComponent:()=>role};}addId(){this.id++;}getChuanSong(){return node;}getBlackHole(){return node;}getNewYaoShi(){return node;}
 }
 for(const method of ['initRole2','initChuanSong','initBlackHole','initYaoShi','fanGet'])Level.prototype[method]=nativeMethod(method,context);
 return{Level,captured};
}

test('playtest matches editor orientation before and after the native level-11 reflection, including objects',()=>{
 for(const [level,morePaths] of [[1,0],[10,0],[11,0],[200,0],[1,1]]){
  const{Level,captured}=fixture(level,morePaths);rules.install(Level,()=>{});const controller=new Level(),nativeReflection=controller.fanGet;
  const worm=Object.assign([{x:1,y:0},{x:1,y:1},{x:2,y:1}],{bingDong:2,suo:0,zhaDan:0,areaType:1}),before=JSON.stringify(worm);
  controller.initRole2(worm,true);
  assert.deepEqual(captured.worm.cells.map(({x,y})=>[x,y]),[[1,9],[1,8],[2,8]],'level '+level);
  assert.equal(captured.worm.cells.bingDong,2);assert.equal(captured.worm.cells.areaType,1);assert.equal(JSON.stringify(worm),before);assert.equal(worm.bingDong,2);
  for(const [method,key,cells] of [['initChuanSong','portal',[{x:0,y:0},{x:7,y:9}]],['initBlackHole','hole',[{x:3,y:2}]],['initYaoShi','key',[{x:5,y:7}]]]){
   const original=JSON.stringify(cells);controller[method](cells);assert.deepEqual(captured[key].cells.map(({x,y})=>[x,y]),cells.map(({x,y})=>[x,9-y]));assert.equal(JSON.stringify(cells),original);
  }
  assert.equal(controller.fanGet,nativeReflection);assert.equal(Object.hasOwn(controller,'fanGet'),false);
 }
});

test('native gameplay remains unchanged without installing editor test rules',()=>{
 const first=fixture(1),later=fixture(11),a=new first.Level(),b=new later.Level();
 a.initRole2([{x:1,y:0},{x:1,y:1}]);b.initRole2([{x:1,y:0},{x:1,y:1}]);
 assert.equal(first.captured.worm.cells[0].y,0);assert.equal(later.captured.worm.cells[0].y,9);
});

test('orientation normalization never rewrites serialized level coordinates or direction metadata',()=>{
 const raw={XSize:8,YSize:10,Arrows:[{Dx:0,Dy:-1,X:1,Y:0,Indices:[1,9,10],BendCount:1,bingDong:2}],chuanSong:[[{x:0,y:0},{x:7,y:9}]],blackHole:[[{x:3,y:2}]],yaoShi:[[{x:5,y:7}]]};
 const map=engine.fromGame(raw),before=JSON.stringify(map),{Level}=fixture(1);rules.install(Level,()=>{});const controller=new Level();
 for(const worm of map.worms)controller.initRole2(Object.assign(worm.cells.map(([x,y])=>({x,y})),{bingDong:worm.ice}));
 controller.initChuanSong(map.portals[0]);controller.initBlackHole(map.holes);controller.initYaoShi(map.keys);
 assert.equal(JSON.stringify(map),before);assert.deepEqual(engine.toGame(map),raw);
});
