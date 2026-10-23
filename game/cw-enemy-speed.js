/* Shared map setting: enemy movement only, relative to the native 60 fps speed. */
(function(root){
 'use strict';
 const KEY='enemySpeedMultiplier',MIN=.25,MAX=5,STEP=.25,ticks=Object.freeze(Array.from({length:20},(_,i)=>(i+1)*STEP));
 function read(raw){
  if(!raw||!Object.prototype.hasOwnProperty.call(raw,KEY))return 1;
  const value=raw[KEY];
  if(typeof value!=='number'||!Number.isFinite(value)||value<MIN||value>MAX)throw Error('enemySpeedMultiplier phải là số hữu hạn từ 0.25 đến 5.');
  return value;
 }
 function fromSlider(value){
  read({[KEY]:value});
  return Math.round(value/STEP)*STEP;
 }
 function toSlider(multiplier){return fromSlider(multiplier);}
 function difficulty(map,base){
  if(!base)return base;
  const multiplier=readMap(map),adjustment=18*Math.log2(multiplier);
  const score=Math.max(0,Math.min(100,Math.round(base.score+adjustment)));
  const delta=score-base.score,formatted=Number(multiplier.toFixed(2));
  return{...base,score,tier:score<20?0:score<40?1:score<60?2:score<75?3:score<90?4:5,
   baseScore:base.score,enemySpeedMultiplier:multiplier,
   factors:[...base.factors,{k:'enemySpeed',l:'Áp lực tốc độ quái',raw:'x'+formatted+' · '+(delta>0?'+':'')+delta+' điểm so với x1',v:(Math.log2(multiplier/MIN)/Math.log2(MAX/MIN)),w:0}]};
 }
 const readMap=map=>read(map?.extraTop);
 function setMap(map,multiplier){read({[KEY]:multiplier});map.extraTop={...map.extraTop,[KEY]:multiplier};}
 function copyMap(source,target){
  readMap(source);target.extraTop={...target.extraTop};
  if(Object.prototype.hasOwnProperty.call(source?.extraTop||{},KEY))target.extraTop[KEY]=source.extraTop[KEY];
  else delete target.extraTop[KEY];
  return target;
 }
 function reset(controller){controller.__cwEnemyStepRemainder=0;}
 function advance(controller,baseStep,dt){
  if(!(baseStep>0)||controller.foeStop||controller.over||controller.skillTimeStop>0)return 0;
  const seconds=dt===undefined?1/60:dt;
  if(!Number.isFinite(seconds)||seconds<=0)return 0;
  const total=(controller.__cwEnemyStepRemainder||0)+baseStep*read(controller.nowObj)*seconds*60;
  const whole=Math.floor(total+1e-9);
  controller.__cwEnemyStepRemainder=Math.max(0,total-whole);
  return whole;
 }
 // Preserve collision checks across every integer position crossed by a fast
 // enemy. Native per-arrow hit IDs still decide damage and prevent repeat hits.
 function recordMovement(route,enemy,next){
  const previous=enemy.nowMoveSpeedId;
  if(!Number.isInteger(previous)||!Number.isInteger(next)||next<=previous)return;
  for(let index=Math.max(0,previous);index<next;index++)route[index]=enemy;
 }
 const api={KEY,MIN,MAX,STEP,ticks,read,readMap,setMap,copyMap,fromSlider,toSlider,difficulty,reset,advance,recordMovement};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWEnemySpeed=api;
})(typeof globalThis!=='undefined'?globalThis:window);
