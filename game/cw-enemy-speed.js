/* Shared map setting: enemy movement only, relative to the native 60 fps speed. */
(function(root){
 'use strict';
 const KEY='enemySpeedMultiplier',ticks=Object.freeze(Array.from({length:17},(_,i)=>-4+i*.5));
 function read(raw){
  if(!raw||!Object.prototype.hasOwnProperty.call(raw,KEY))return 1;
  const value=raw[KEY];
  if(typeof value!=='number'||!Number.isFinite(value)||value<.25||value>4)throw Error('enemySpeedMultiplier phải là số hữu hạn từ 0.25 đến 4.');
  return value;
 }
 function fromSlider(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value< -4||value>4)throw Error('Nấc tốc độ phải nằm từ -4 đến +4.');
  return Math.pow(4,value/4);
 }
 function toSlider(multiplier){read({[KEY]:multiplier});return 4*Math.log(multiplier)/Math.log(4);}
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
 const api={KEY,ticks,read,readMap,setMap,copyMap,fromSlider,toSlider,reset,advance,recordMovement};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWEnemySpeed=api;
})(typeof globalThis!=='undefined'?globalThis:window);
