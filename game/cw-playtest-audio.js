/* Audio belongs to the visible editor playtest, including during engine warm-up. */
(function(root){
 'use strict';
 const params=new URLSearchParams(root.location.search);
 if(params.get('playtest')!=='1')return;
 const token=params.get('token')||'',contexts=new Set(),media=new Map();
 let active=false;
 const audible=()=>active&&!root.document.hidden;
 const settle=promise=>{if(promise?.catch)promise.catch(()=>{});};
 function track(context){
  const resume=context.resume.bind(context),suspend=context.suspend.bind(context);
  const item={context,resume,suspend};contexts.add(item);
  context.resume=function(){
   if(!audible())return Promise.resolve();
   return resume().then(()=>{if(!audible()&&context.state!=='closed')return suspend();});
  };
  if(!audible()&&context.state!=='closed')settle(suspend());
 }
 // Install before Cocos creates its shared audio context. Engine callbacks may
 // still request resume while warming; those requests must remain silent too.
 const constructors=new Map();
 for(const name of ['AudioContext','webkitAudioContext','mozAudioContext']){
  const Native=root[name];if(!Native)continue;
  if(!constructors.has(Native))constructors.set(Native,new Proxy(Native,{construct(Target,args,newTarget){
   const context=Reflect.construct(Target,args,newTarget);track(context);return context;
  }}));
  root[name]=constructors.get(Native);
 }
 const proto=root.HTMLMediaElement?.prototype,nativePlay=proto?.play,nativePause=proto?.pause;
 if(nativePlay&&nativePause){
  proto.play=function(){
   let item=media.get(this);if(!item){item={resume:false};media.set(this,item);}
   if(!audible()){item.resume=!!this.loop;return Promise.resolve();}
   item.resume=false;return nativePlay.apply(this,arguments);
  };
  proto.pause=function(){const item=media.get(this);if(item)item.resume=false;return nativePause.apply(this,arguments);};
 }
 function sync(){
  const enabled=audible();
  for(const item of contexts){
   if(item.context.state==='closed'){contexts.delete(item);continue;}
   if(enabled)settle(item.context.resume());else settle(item.suspend());
  }
  for(const[element,item]of media){
   if(enabled){if(item.resume){item.resume=false;settle(nativePlay.call(element));}}
   else if(!element.paused){item.resume=!!element.loop;nativePause.call(element);}
  }
 }
 function setActive(value){active=value===true;sync();}
 root.CWPlaytestAudio={setActive,get active(){return audible();}};
 root.addEventListener('message',event=>{
  const data=event.data;
  if(event.origin!==root.location.origin||event.source!==root.parent||!data||data.token!==token)return;
  if(data.type==='cw-playtest-audio')setActive(data.active);
  else if(data.type==='cw-playtest-pause'||data.type==='cw-playtest-abort')setActive(false);
 });
 root.document.addEventListener('visibilitychange',sync);
 root.addEventListener('pagehide',()=>setActive(false));
})(window);
