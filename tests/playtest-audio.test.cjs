const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../game/cw-playtest-audio.js'),'utf8');
function fixture(search='?playtest=1&token=test'){
 const listeners=new Map(),parent={},document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn)};
 class AudioContext{
  constructor(){this.state='running';this.resumes=0;this.suspends=0;}
  resume(){this.resumes++;this.state='running';return Promise.resolve();}
  suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
 }
 class HTMLMediaElement{
  constructor(loop=false){this.loop=loop;this.paused=true;this.plays=0;this.pauses=0;}
  play(){this.paused=false;this.plays++;return Promise.resolve();}
  pause(){this.paused=true;this.pauses++;}
 }
 const window={AudioContext,webkitAudioContext:AudioContext,HTMLMediaElement,document,parent,location:{search,origin:'http://editor.test'},addEventListener:(name,fn)=>listeners.set(name,fn)};
 const ctx={window,URLSearchParams,console};vm.createContext(ctx);vm.runInContext(source,ctx);
 return{window,document,listeners,Native:AudioContext,emit(data,envelope={}){listeners.get('message')({origin:'http://editor.test',source:parent,data:{type:'cw-playtest-audio',token:'test',...data},...envelope});}};
}
test('normal standalone game keeps its native audio behavior',()=>{
 const f=fixture('');assert.equal(f.window.AudioContext,f.Native);assert.equal(f.window.CWPlaytestAudio,undefined);assert.equal(f.listeners.size,0);
});
test('warm engine is silent before play and cannot unmute itself while the panel is closed',async()=>{
 const f=fixture(),c=new f.window.AudioContext();assert.equal(c.state,'suspended');assert.equal(c.resumes,0);
 await c.resume();assert.equal(c.resumes,0);
 f.emit({active:true});await Promise.resolve();assert.equal(c.state,'running');assert.equal(f.window.CWPlaytestAudio.active,true);
 f.emit({type:'cw-playtest-pause'});assert.equal(c.state,'suspended');const before=c.resumes;
 await c.resume();assert.equal(c.resumes,before);assert.equal(f.window.CWPlaytestAudio.active,false);
 f.emit({active:true});await Promise.resolve();assert.equal(c.state,'running');
 f.emit({type:'cw-playtest-abort'});assert.equal(c.state,'suspended');
});
test('only the matching parent origin and session token can enable audio',()=>{
 const f=fixture(),c=new f.window.AudioContext();
 f.emit({active:true},{origin:'http://elsewhere.test'});f.emit({active:true},{source:{}});f.emit({active:true,token:'other'});
 assert.equal(c.resumes,0);f.emit({active:true});assert.equal(c.resumes,1);
});
test('tab visibility suspends audio and returning to the editor cannot restore it',async()=>{
 const f=fixture(),c=new f.window.webkitAudioContext();assert.ok(c instanceof f.Native);
 f.emit({active:true});await Promise.resolve();f.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(c.state,'suspended');
 f.document.hidden=false;f.listeners.get('visibilitychange')();await Promise.resolve();assert.equal(c.state,'running');
 f.emit({active:false});f.document.hidden=true;f.listeners.get('visibilitychange')();f.document.hidden=false;f.listeners.get('visibilitychange')();assert.equal(c.state,'suspended');
 f.emit({active:true});f.listeners.get('pagehide')();assert.equal(c.state,'suspended');
});
test('media fallback stops on close, resumes only looping music, and honors explicit pause',async()=>{
 const f=fixture(),music=new f.window.HTMLMediaElement(true),effect=new f.window.HTMLMediaElement(false);
 await music.play();await effect.play();assert.equal(music.plays,0);assert.equal(effect.plays,0);
 f.emit({active:true});assert.equal(music.plays,1);assert.equal(effect.plays,0);
 await effect.play();assert.equal(effect.plays,1);f.emit({active:false});assert.equal(music.paused,true);assert.equal(effect.paused,true);
 f.emit({active:true});assert.equal(music.plays,2);assert.equal(effect.plays,1);
 f.emit({active:false});music.pause();f.emit({active:true});assert.equal(music.plays,2);
});
test('a pending resume cannot turn audio back on after the panel has closed',async()=>{
 const f=fixture(),c=new f.window.AudioContext();f.emit({active:true});f.emit({active:false});await Promise.resolve();assert.equal(c.state,'suspended');
});
test('audio gate is loaded before the native game starts',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../game/index.html'),'utf8');assert.ok(html.indexOf('cw-playtest-audio.js')<html.indexOf("System.import('./index.c8ee2.js')"));
});
